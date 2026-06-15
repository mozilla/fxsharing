#!/bin/bash

CELERY_NUM_WORKERS=${CELERY_NUM_WORKERS:-"2"}

exec celery -A fxsharing worker --concurrency=$CELERY_NUM_WORKERS --loglevel=info
