from opentelemetry import metrics

meter = metrics.get_meter("fxsharing.shares")

share_created = meter.create_counter(
    "fxsharing.share.created",
    unit="1",
    description="Shares created, tagged by outcome",
)

share_viewed = meter.create_counter(
    "fxsharing.share.viewed",
    unit="1",
    description="Live share pages viewed",
)

share_reported = meter.create_counter(
    "fxsharing.share.reported",
    unit="1",
    description="Shares reported by viewers",
)

client_event = meter.create_counter(
    "fxsharing.client.event",
    unit="1",
    description="Client-side product events, tagged by event_type",
)

task_retried = meter.create_counter(
    "fxsharing.task.retried",
    unit="1",
    description="Celery task retries, tagged by task",
)

task_deadlettered = meter.create_counter(
    "fxsharing.task.deadlettered",
    unit="1",
    description="Celery tasks moved to the DLQ after exhausting retries",
)
