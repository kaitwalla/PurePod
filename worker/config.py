import os

# Redis connection via Tailscale to Manager
REDIS_URL = os.getenv("REDIS_URL", "redis://100.x.x.x:6379/0")

# Manager API URL for callbacks
MANAGER_URL = os.getenv("MANAGER_URL", "http://100.x.x.x:8000")

# Temporary directory for audio processing
TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/podcastpurifier")
