"""
Celery task dispatching for the Manager.

This module provides functions to dispatch tasks to the remote Worker.
"""
import os
import logging
from celery import Celery

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
MANAGER_BASE_URL = os.getenv("MANAGER_BASE_URL", "http://web:8000")

# Create Celery app for dispatching tasks to Worker
celery_app = Celery(
    "podcastpurifier_manager",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)


def dispatch_episode_processing(episode_id: int, audio_url: str) -> str:
    """
    Dispatch an episode for processing by the Worker.

    Args:
        episode_id: The episode ID in the database.
        audio_url: URL to download the original audio.

    Returns:
        The Celery task ID.
    """
    callback_url = f"{MANAGER_BASE_URL}/upload/{episode_id}"

    task = celery_app.send_task(
        "worker.process_episode",
        args=[episode_id, audio_url, callback_url],
        queue="audio_processing",
    )

    logger.info(f"Dispatched episode {episode_id} for processing, task_id={task.id}")
    return task.id
