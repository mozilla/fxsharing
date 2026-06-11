import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import BatchSpanProcessor

bind = "0.0.0.0:8000"
workers = int(os.environ.get("GUNICORN_WORKERS", 4))
worker_class = "sync"
worker_tmp_dir = "/dev/shm"
control_socket_disable = True
accesslog = "-"
errorlog = "-"
loglevel = "info"


def post_fork(server, worker):
    # BatchSpanProcessor's export thread isn't fork-safem re-add one per worker so
    # request spans actually flush. https://opentelemetry-python.readthedocs.io/en/stable/examples/fork-process-model/README.html
    trace.get_tracer_provider().add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter())
    )
