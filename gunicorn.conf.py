import os

bind = "0.0.0.0:8000"
workers = int(os.environ.get("GUNICORN_WORKERS", 4))
worker_class = "sync"
worker_tmp_dir = "/dev/shm"
control_socket_disable = True
accesslog = "-"
errorlog = "-"
loglevel = "info"
