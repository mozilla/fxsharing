import environ

env = environ.Env()

bind = "0.0.0.0:8000"
workers = env.int("GUNICORN_WORKERS", default=4)
worker_class = "sync"
worker_tmp_dir = "/dev/shm"  # noqa: S108 — in-memory heartbeat directory
control_socket_disable = True

max_requests = env.int("GUNICORN_MAX_REQUESTS", default=2000)
max_requests_jitter = env.int("GUNICORN_MAX_REQUESTS_JITTER", default=200)
accesslog = "-"
errorlog = "-"
loglevel = "info"
