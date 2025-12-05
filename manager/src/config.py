import os
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://podcast:podcast@localhost:5432/podcastpurifier")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
AUDIO_STORAGE_PATH = Path(os.getenv("AUDIO_STORAGE_PATH", "/app/audio"))
PUBLIC_HOSTNAME = os.getenv("PUBLIC_HOSTNAME", "localhost")

# Ensure audio storage directory exists
AUDIO_STORAGE_PATH.mkdir(parents=True, exist_ok=True)
