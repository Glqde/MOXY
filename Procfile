web: cd moxy-backend && gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:$PORT --workers 2
worker: cd moxy-backend && celery -A app.workers.celery_app worker --loglevel=info --concurrency=1
beat: cd moxy-backend && celery -A app.workers.celery_app beat --loglevel=info
