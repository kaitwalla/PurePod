do shell script "cd /Users/kait/Dev/PurePod/worker && .venv/bin/python -m celery -A worker.main worker --loglevel=info -Q audio_processing --pool=solo >> /tmp/celery-worker.log 2>&1 &"
