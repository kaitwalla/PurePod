import enum
from typing import Optional, List
from datetime import datetime

from sqlmodel import SQLModel, Field, Relationship


class EpisodeStatus(str, enum.Enum):
    DISCOVERED = "discovered"
    QUEUED = "queued"
    PROCESSING = "processing"
    CLEANED = "cleaned"
    FAILED = "failed"


class Feed(SQLModel, table=True):
    __tablename__ = "feeds"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True)
    rss_url: str = Field(unique=True)
    auto_process: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    episodes: List["Episode"] = Relationship(back_populates="feed")


class Episode(SQLModel, table=True):
    __tablename__ = "episodes"

    id: Optional[int] = Field(default=None, primary_key=True)
    feed_id: int = Field(foreign_key="feeds.id", index=True)
    guid: str = Field(index=True)
    status: EpisodeStatus = Field(default=EpisodeStatus.DISCOVERED)
    title: str
    audio_url: str
    local_filename: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    feed: Optional[Feed] = Relationship(back_populates="episodes")

    class Config:
        use_enum_values = True
