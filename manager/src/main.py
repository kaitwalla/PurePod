import logging
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Set

import aiofiles
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, WebSocket, WebSocketDisconnect, APIRouter
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select

from .config import AUDIO_STORAGE_PATH, PUBLIC_HOSTNAME

STATIC_DIR = Path(__file__).parent.parent / "static"
from .database import init_db, engine
from .models import Feed, Episode, EpisodeStatus
from .ingest import ingest_feed, extract_feed_metadata
from .tasks import dispatch_episode_processing

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for progress updates."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients."""
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.add(connection)
        self.active_connections -= disconnected


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    yield


app = FastAPI(
    title="PodcastPurifier Manager",
    description="Manager service for PodcastPurifier - strips ads from podcasts",
    version="0.1.0",
    lifespan=lifespan,
)

# Create API router - all API endpoints go here
api = APIRouter(prefix="/api")

# Mount static files for serving cleaned audio
app.mount("/files", StaticFiles(directory=str(AUDIO_STORAGE_PATH)), name="files")


def get_db_session():
    """Dependency for database sessions."""
    with Session(engine) as session:
        yield session


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    """
    WebSocket endpoint for real-time progress updates.

    Clients connect here to receive progress updates for episodes
    currently being processed by workers.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, wait for messages (or disconnection)
            # In production, workers would POST progress updates that get broadcast
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@api.post("/progress/{episode_id}")
async def update_progress(
    episode_id: int,
    progress: int,
    stage: str = "processing",
):
    """
    Endpoint for workers to report processing progress.

    This broadcasts the progress to all connected WebSocket clients.
    """
    await manager.broadcast({
        "episode_id": episode_id,
        "progress": progress,
        "stage": stage,
    })
    return {"status": "ok"}


@api.post("/upload/{episode_id}")
async def upload_cleaned_audio(
    episode_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
):
    """
    Upload a cleaned MP3 file from the Worker.

    This endpoint allows the Worker to upload the final cleaned MP3
    back to the Manager after processing.
    """
    episode = session.get(Episode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} not found")

    if not file.filename or not file.filename.endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only MP3 files are accepted")

    feed_dir = AUDIO_STORAGE_PATH / str(episode.feed_id)
    feed_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{episode_id}_{file.filename.replace('/', '_')}"
    file_path = feed_dir / safe_filename

    try:
        async with aiofiles.open(file_path, "wb") as out_file:
            content = await file.read()
            await out_file.write(content)
    except Exception as e:
        logger.error(f"Failed to save file for episode {episode_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to save file")

    episode.local_filename = str(file_path.relative_to(AUDIO_STORAGE_PATH))
    episode.status = EpisodeStatus.CLEANED
    episode.updated_at = datetime.utcnow()
    session.add(episode)
    session.commit()

    # Broadcast completion
    await manager.broadcast({
        "episode_id": episode_id,
        "progress": 100,
        "stage": "completed",
    })

    logger.info(f"Uploaded cleaned audio for episode {episode_id}: {safe_filename}")

    return {
        "message": "File uploaded successfully",
        "episode_id": episode_id,
        "local_filename": episode.local_filename,
    }


@api.post("/feeds", response_model=Feed)
async def create_feed(
    rss_url: str,
    session: Session = Depends(get_db_session),
):
    """Create a new feed by fetching metadata from the RSS URL."""
    existing = session.exec(select(Feed).where(Feed.rss_url == rss_url)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Feed with this URL already exists")

    # Fetch metadata from the RSS feed
    metadata = extract_feed_metadata(rss_url)
    if not metadata:
        raise HTTPException(status_code=400, detail="Could not parse RSS feed. Please check the URL.")

    # Append "(Purified)" to the title
    title = f"{metadata['title']} (Purified)"

    feed = Feed(
        title=title,
        rss_url=rss_url,
        description=metadata.get('description'),
        image_url=metadata.get('image_url'),
        author=metadata.get('author'),
    )
    session.add(feed)
    session.commit()
    session.refresh(feed)

    # Auto-ingest episodes from the feed
    try:
        new_episodes = ingest_feed(feed.id, session)
        logger.info(f"Auto-ingested {len(new_episodes)} episodes for new feed {feed.id}")
    except Exception as e:
        logger.error(f"Failed to auto-ingest episodes for feed {feed.id}: {e}")

    return feed


@api.get("/feeds", response_model=List[Feed])
async def list_feeds(session: Session = Depends(get_db_session)):
    """List all feeds."""
    feeds = session.exec(select(Feed)).all()
    return feeds


@api.patch("/feeds/{feed_id}/auto-process", response_model=Feed)
async def update_feed_auto_process(
    feed_id: int,
    auto_process: bool,
    session: Session = Depends(get_db_session),
):
    """Update the auto_process setting for a feed."""
    feed = session.get(Feed, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail=f"Feed {feed_id} not found")

    feed.auto_process = auto_process
    feed.updated_at = datetime.utcnow()
    session.add(feed)
    session.commit()
    session.refresh(feed)

    return feed


@api.delete("/feeds/{feed_id}")
async def delete_feed(
    feed_id: int,
    session: Session = Depends(get_db_session),
):
    """Delete a feed and all its episodes."""
    feed = session.get(Feed, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail=f"Feed {feed_id} not found")

    # Get and delete all episodes for this feed
    episodes = session.exec(select(Episode).where(Episode.feed_id == feed_id)).all()
    episode_count = len(episodes)

    for episode in episodes:
        session.delete(episode)

    # Flush to ensure episodes are deleted before feed
    session.flush()

    # Delete the feed
    session.delete(feed)
    session.commit()

    logger.info(f"Deleted feed {feed_id} and {episode_count} episodes")

    return {"message": f"Feed {feed_id} deleted", "deleted_episodes": episode_count}


@api.post("/feeds/{feed_id}/ingest")
async def trigger_ingest(feed_id: int, session: Session = Depends(get_db_session)):
    """Trigger ingestion for a specific feed."""
    feed = session.get(Feed, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail=f"Feed {feed_id} not found")

    new_episodes = ingest_feed(feed_id, session)

    return {
        "message": f"Ingestion complete for feed {feed_id}",
        "new_episodes": len(new_episodes),
        "episodes": [{"id": ep.id, "title": ep.title, "status": ep.status} for ep in new_episodes],
    }


@app.get("/feed/{feed_id}")
async def get_feed_rss(feed_id: int, session: Session = Depends(get_db_session)):
    """
    Generate RSS 2.0 XML feed for cleaned episodes.

    Returns an RSS feed with enclosure tags pointing to the public URL
    for each cleaned episode's audio file.
    """
    feed = session.get(Feed, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail=f"Feed {feed_id} not found")

    # Get only cleaned episodes for this feed
    episodes = session.exec(
        select(Episode)
        .where(Episode.feed_id == feed_id)
        .where(Episode.status == EpisodeStatus.CLEANED)
        .order_by(Episode.created_at.desc())
    ).all()

    # Build RSS 2.0 XML
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")

    ET.SubElement(channel, "title").text = feed.title
    ET.SubElement(channel, "link").text = f"https://{PUBLIC_HOSTNAME}/feed/{feed_id}"
    ET.SubElement(channel, "description").text = f"Ad-free version of {feed.title}"
    ET.SubElement(channel, "lastBuildDate").text = datetime.utcnow().strftime(
        "%a, %d %b %Y %H:%M:%S +0000"
    )

    for episode in episodes:
        if not episode.local_filename:
            continue

        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = episode.title
        ET.SubElement(item, "guid").text = episode.guid

        pub_date = episode.updated_at.strftime("%a, %d %b %Y %H:%M:%S +0000")
        ET.SubElement(item, "pubDate").text = pub_date

        # Build public URL for the audio file
        audio_url = f"https://{PUBLIC_HOSTNAME}/files/{episode.local_filename}"
        ET.SubElement(
            item,
            "enclosure",
            url=audio_url,
            type="audio/mpeg",
            length="0",
        )

    xml_str = ET.tostring(rss, encoding="unicode", xml_declaration=True)
    return Response(content=xml_str, media_type="application/rss+xml")


class EpisodeWithFeed(BaseModel):
    """Episode with feed title for display."""
    id: int
    feed_id: int
    feed_title: str
    guid: str
    status: EpisodeStatus
    title: str
    audio_url: str
    published_at: datetime | None
    local_filename: str | None
    created_at: datetime
    updated_at: datetime


class PaginatedEpisodes(BaseModel):
    """Paginated episode response."""
    items: List[EpisodeWithFeed]
    total: int
    page: int
    page_size: int
    total_pages: int


@api.get("/episodes", response_model=PaginatedEpisodes)
async def list_episodes(
    feed_id: int = None,
    status: EpisodeStatus = None,
    show_ignored: bool = False,
    page: int = 1,
    page_size: int = 25,
    session: Session = Depends(get_db_session),
):
    """List episodes with optional filters and pagination."""
    query = select(Episode)

    if feed_id is not None:
        query = query.where(Episode.feed_id == feed_id)

    if status is not None:
        query = query.where(Episode.status == status)
    elif not show_ignored:
        # By default, hide ignored episodes
        query = query.where(Episode.status != EpisodeStatus.IGNORED)

    # Order by published date (newest first), fallback to created_at
    query = query.order_by(Episode.published_at.desc().nullslast(), Episode.created_at.desc())

    # Get total count
    count_query = select(Episode)
    if feed_id is not None:
        count_query = count_query.where(Episode.feed_id == feed_id)
    if status is not None:
        count_query = count_query.where(Episode.status == status)
    elif not show_ignored:
        count_query = count_query.where(Episode.status != EpisodeStatus.IGNORED)

    all_episodes = session.exec(count_query).all()
    total = len(all_episodes)

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    episodes = session.exec(query).all()

    # Get feed titles
    feed_ids = {ep.feed_id for ep in episodes}
    if feed_ids:
        feeds = {f.id: f for f in session.exec(select(Feed).where(Feed.id.in_(feed_ids))).all()}
    else:
        feeds = {}

    items = [
        EpisodeWithFeed(
            id=ep.id,
            feed_id=ep.feed_id,
            feed_title=feeds.get(ep.feed_id, Feed(title="Unknown")).title,
            guid=ep.guid,
            status=ep.status,
            title=ep.title,
            audio_url=ep.audio_url,
            published_at=ep.published_at,
            local_filename=ep.local_filename,
            created_at=ep.created_at,
            updated_at=ep.updated_at,
        )
        for ep in episodes
    ]

    total_pages = (total + page_size - 1) // page_size

    return PaginatedEpisodes(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


class BulkEpisodeRequest(BaseModel):
    episode_ids: List[int]


@api.post("/episodes/ignore")
async def ignore_episodes(
    request: BulkEpisodeRequest,
    session: Session = Depends(get_db_session),
):
    """Mark episodes as ignored."""
    ignored_count = 0

    for episode_id in request.episode_ids:
        episode = session.get(Episode, episode_id)
        if episode and episode.status in (EpisodeStatus.DISCOVERED, EpisodeStatus.FAILED):
            episode.status = EpisodeStatus.IGNORED
            episode.updated_at = datetime.utcnow()
            session.add(episode)
            ignored_count += 1

    session.commit()
    return {"ignored": ignored_count}


@api.post("/episodes/unignore")
async def unignore_episodes(
    request: BulkEpisodeRequest,
    session: Session = Depends(get_db_session),
):
    """Restore ignored episodes to discovered status."""
    restored_count = 0

    for episode_id in request.episode_ids:
        episode = session.get(Episode, episode_id)
        if episode and episode.status == EpisodeStatus.IGNORED:
            episode.status = EpisodeStatus.DISCOVERED
            episode.updated_at = datetime.utcnow()
            session.add(episode)
            restored_count += 1

    session.commit()
    return {"restored": restored_count}


@api.post("/episodes/queue")
async def queue_episodes(
    request: BulkEpisodeRequest,
    session: Session = Depends(get_db_session),
):
    """
    Queue multiple episodes for processing.

    Episodes with DISCOVERED or FAILED status can be queued.
    This dispatches Celery tasks to the Worker for each episode.
    """
    queued_count = 0
    dispatched_tasks = []

    for episode_id in request.episode_ids:
        episode = session.get(Episode, episode_id)
        if episode and episode.status in (EpisodeStatus.DISCOVERED, EpisodeStatus.FAILED):
            episode.status = EpisodeStatus.QUEUED
            episode.updated_at = datetime.utcnow()
            session.add(episode)
            queued_count += 1

            # Dispatch to Worker
            try:
                task_id = dispatch_episode_processing(episode_id, episode.audio_url)
                dispatched_tasks.append({"episode_id": episode_id, "task_id": task_id})
            except Exception as e:
                logger.error(f"Failed to dispatch episode {episode_id}: {e}")

    session.commit()

    return {"queued": queued_count, "tasks": dispatched_tasks}


# Include API router
app.include_router(api)

# Serve frontend static files (must be after API routes)
if STATIC_DIR.exists():
    @app.get("/")
    async def serve_spa_root():
        """Serve the SPA index.html at root."""
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{path:path}")
    async def serve_spa_fallback(path: str):
        """Serve static files or index.html for SPA client-side routing."""
        file_path = STATIC_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Return index.html for SPA routes
        return FileResponse(STATIC_DIR / "index.html")
