import environ
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import BatchSpanProcessor

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


def post_fork(server, worker):
    # BatchSpanProcessor's export thread isn't fork-safe, re-add one per worker so
    # request spans actually flush. https://opentelemetry-python.readthedocs.io/en/stable/examples/fork-process-model/README.html
    trace.get_tracer_provider().add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter())
    )
