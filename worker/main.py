"""
PodcastPurifier ML Worker

This worker runs on Apple Silicon Mac to leverage the Neural Engine
for ML-based audio processing. It connects to the Manager's Redis
instance via Tailscale for task distribution.
"""
import logging
import os
import tempfile
import time
from pathlib import Path

import requests
from celery import Celery

from config import REDIS_URL, MANAGER_URL, TEMP_DIR

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Ensure temp directory exists
Path(TEMP_DIR).mkdir(parents=True, exist_ok=True)

# Initialize Celery app with Redis broker
app = Celery(
    "podcastpurifier_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# Celery configuration
app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,  # Process one task at a time for ML workloads
    task_routes={
        "worker.process_episode": {"queue": "audio_processing"},
    },
)


def report_progress(episode_id: int, progress: int, stage: str = "processing") -> None:
    """Report processing progress to the Manager."""
    try:
        requests.post(
            f"{MANAGER_URL}/progress/{episode_id}",
            params={"progress": progress, "stage": stage},
            timeout=5,
        )
    except Exception as e:
        logger.warning(f"Failed to report progress for episode {episode_id}: {e}")


@app.task(name="worker.process_episode", bind=True)
def process_episode(self, episode_id: int, audio_url: str, callback_url: str) -> dict:
    """
    Process a podcast episode to strip ads.

    This is currently a stub that:
    1. Downloads the audio from audio_url
    2. Waits 5 seconds (simulating processing)
    3. Uploads the file back to callback_url

    Args:
        episode_id: The episode ID in the Manager database.
        audio_url: URL to download the original audio.
        callback_url: URL to POST the cleaned audio back to Manager.

    Returns:
        Dict with processing result status.
    """
    logger.info(f"Starting processing for episode {episode_id}")
    logger.info(f"Audio URL: {audio_url}")
    logger.info(f"Callback URL: {callback_url}")

    # Create temp file for this episode
    temp_path = Path(TEMP_DIR) / f"episode_{episode_id}.mp3"

    try:
        # Step 1: Download the audio file
        report_progress(episode_id, 10, "downloading")
        logger.info(f"Downloading audio for episode {episode_id}...")

        response = requests.get(audio_url, stream=True, timeout=300)
        response.raise_for_status()

        with open(temp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size = temp_path.stat().st_size
        logger.info(f"Downloaded {file_size} bytes to {temp_path}")
        report_progress(episode_id, 30, "downloaded")

        # Step 2: Simulate processing (placeholder for ML pipeline)
        report_progress(episode_id, 50, "processing")
        logger.info(f"Processing episode {episode_id} (simulated)...")
        time.sleep(5)  # Simulate ML processing time
        report_progress(episode_id, 80, "processing")

        # Step 3: Upload the processed file back to Manager
        report_progress(episode_id, 90, "uploading")
        logger.info(f"Uploading processed audio for episode {episode_id}...")

        with open(temp_path, "rb") as f:
            files = {"file": (f"episode_{episode_id}_cleaned.mp3", f, "audio/mpeg")}
            upload_response = requests.post(callback_url, files=files, timeout=300)
            upload_response.raise_for_status()

        result = upload_response.json()
        logger.info(f"Upload complete for episode {episode_id}: {result}")
        report_progress(episode_id, 100, "completed")

        return {
            "status": "success",
            "episode_id": episode_id,
            "message": "Processing complete",
            "upload_result": result,
        }

    except requests.RequestException as e:
        logger.error(f"Network error processing episode {episode_id}: {e}")
        report_progress(episode_id, 0, "failed")
        raise self.retry(exc=e, countdown=60, max_retries=3)

    except Exception as e:
        logger.error(f"Error processing episode {episode_id}: {e}")
        report_progress(episode_id, 0, "failed")
        raise

    finally:
        # Cleanup temp file
        if temp_path.exists():
            temp_path.unlink()
            logger.info(f"Cleaned up temp file: {temp_path}")


def start_worker():
    """Entry point for starting the Celery worker."""
    app.worker_main(
        argv=[
            "worker",
            "--loglevel=INFO",
            "--concurrency=1",  # Single worker for ML tasks
            "-Q", "audio_processing",
        ]
    )


if __name__ == "__main__":
    start_worker()
