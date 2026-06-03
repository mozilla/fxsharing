#!/bin/bash

CELERY_NUM_WORKERS=${CELERY_NUM_WORKERS:-"2"}

opentelemetry-instrument celery -A fxsharing worker --concurrency=$CELERY_NUM_WORKERS --loglevel=info
