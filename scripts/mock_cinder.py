#!/usr/bin/env python3
"""Local mock of Cinder's link_sharing_quality workflow.

Accepts ``POST /api/v2/workflows/event`` from the fxsharing app, replies with
the documented ``{event_id, status}`` envelope, then asynchronously POSTs a
signed ``decision.created`` webhook back to the app's ``/api/v1/ts_response``
endpoint.

The simulated branch is decided by URL substring:

  * 'malware', 'phishing', or 'unwanted'  -> Web Risk threat
  * 'csam' or 'ncmec'                     -> NCMEC hash match
  * anything else                         -> Approve (no enforcement actions)

Run locally:

  CINDER_WEBHOOK_TOKEN=$(grep ^CINDER_WEBHOOK_TOKEN .env | cut -d= -f2-) \\
      uv run python scripts/mock_cinder.py

Point the app at it by setting CINDER_URL=http://127.0.0.1:8081 in .env.
The webhook secret passed here must match the app's CINDER_WEBHOOK_TOKEN, or
the signature check in ts_webhook will reject the callback.
"""

import argparse
import hashlib
import hmac
import json
import logging
import os
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import requests

# Allow `from fxsharing...` imports when run as `python scripts/mock_cinder.py`
# (Python only puts the script's own directory on sys.path by default).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jsonschema import ValidationError, validate  # noqa: E402

from fxsharing.shares.cinder_schema import workflow_event_schema  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mock_cinder")

# Policy UUIDs from the handoff doc. Treated as illustrative — the app does not
# inspect them, but Cinder's real webhook carries these exact ids per branch.
POLICY_ILLEGAL_GOODS = "fc33b472-c428-4834-9e8f-ed2799950e5e"
POLICY_MINOR_EXPLOITATION = "d3cc8078-8d8b-4775-9de7-f64ca0fb0e05"
POLICY_APPROVE = "5de2b637-e303-4e8c-8e9f-36448ccf150b"
POLICY_CSAM_CLASSIFIER = "9c32c0a7-fc65-44c8-97ae-04beca31041f"


def classify(url):
    u = (url or "").lower()
    if any(k in u for k in ("malware", "phishing", "unwanted")):
        return "web_risk"
    if any(k in u for k in ("csam", "ncmec")):
        return "ncmec"
    return "approve"


def build_decision_payload(branch, link_attributes, event_id):
    """Build a ``decision.created`` webhook payload mirroring the real shape."""
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    payload = {
        "event": "decision.created",
        "payload": {
            "enforcement_actions": [],
            "enforcement_actions_removed": [],
            "entity": {
                "entity_schema": "fxsharing_url",
                "attributes": link_attributes,
                "predictions": [],
            },
            "timestamp": timestamp,
            "policies": [],
            "policies_removed": [],
            "point_updates": [],
            "source": {
                "decision": {
                    "id": str(uuid.uuid4()),
                    "type": "automated",
                    "metadata": {},
                },
                "workflow": {
                    "name": "Link Sharing Quality",
                    "slug": "link-sharing-quality",
                    "event_id": event_id,
                    "trigger": {"decision": None},
                },
            },
        },
    }

    if branch == "approve":
        payload["payload"]["policies"] = [
            {
                "id": POLICY_APPROVE,
                "name": "Link Collections: Approve",
                "is_illegal": False,
                "enforcement_actions": [],
                "is_non_violating": True,
            }
        ]
        return payload

    payload["payload"]["enforcement_actions"] = ["link-collections-high-risk-url"]
    if branch == "web_risk":
        payload["payload"]["policies"] = [
            {
                "id": POLICY_ILLEGAL_GOODS,
                "name": "Link Collections: Illegal Goods or Services",
                "is_illegal": True,
                "enforcement_actions": ["link-collections-high-risk-url"],
                "is_non_violating": False,
            }
        ]
    else:  # ncmec
        payload["payload"]["policies"] = [
            {
                "id": POLICY_MINOR_EXPLOITATION,
                "name": "Link Collections: Minor Exploitation",
                "is_illegal": True,
                "enforcement_actions": ["link-collections-high-risk-url"],
                "is_non_violating": False,
            }
        ]
        payload["payload"]["entity"]["predictions"] = [
            {
                "inference_id": "",
                "attributes": [],
                "policy_id": POLICY_CSAM_CLASSIFIER,
                "confidence": "HIGH",
                "is_positive": True,
            }
        ]
    return payload


def fire_webhook(target_url, secret, payload, delay):
    if delay > 0:
        time.sleep(delay)
    body = json.dumps(payload).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "X-Cinder-Signature": sig,
        "X-Cinder-Timestamp": str(int(time.time())),
        "X-Cinder-Retry-Count": "0",
        "X-Cinder-Max-Retries": "5",
    }
    try:
        resp = requests.post(target_url, data=body, headers=headers, timeout=10)
        log.info(
            "decision.created -> %s [%s] %s",
            target_url,
            resp.status_code,
            resp.text[:200],
        )
    except requests.RequestException as exc:
        log.error("Failed to deliver decision.created: %s", exc)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path.rstrip("/") != "/api/v2/workflows/event":
            self._json(404, {"detail": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            self._json(400, {"detail": "invalid json"})
            return

        event_id = str(uuid.uuid4())

        if event.get("event_name") != "link_sharing_quality":
            self._json(
                200,
                {
                    "event_id": event_id,
                    "status": "accepted",
                    "detail": (
                        "Workflow for this event is not published. "
                        "No immediate action taken."
                    ),
                },
            )
            return

        try:
            validate(event, workflow_event_schema)
        except ValidationError as exc:
            log.warning(
                "rejecting malformed link_sharing_quality event: %s", exc.message
            )
            self._json(400, {"detail": f"invalid event payload: {exc.message}"})
            return

        attributes = event["entity"]["attributes"]
        link_id = attributes["id"]
        url = attributes["url"]
        branch = classify(url)

        log.info(
            "workflow event id=%s link_id=%s url=%s -> %s",
            event_id,
            link_id,
            url,
            branch,
        )

        decision_payload = build_decision_payload(branch, attributes, event_id)

        threading.Thread(
            target=fire_webhook,
            args=(
                self.server.webhook_url,
                self.server.webhook_secret,
                decision_payload,
                self.server.webhook_delay,
            ),
            daemon=True,
        ).start()

        self._json(200, {"event_id": event_id, "status": "ok"})

    def _json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        log.info("%s - %s", self.address_string(), fmt % args)


class MockCinderServer(HTTPServer):
    def __init__(self, addr, webhook_url, webhook_secret, webhook_delay):
        super().__init__(addr, Handler)
        self.webhook_url = webhook_url
        self.webhook_secret = webhook_secret
        self.webhook_delay = webhook_delay


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument(
        "--host",
        default=os.environ.get("MOCK_CINDER_HOST", "127.0.0.1"),
    )
    p.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("MOCK_CINDER_PORT", "8081")),
    )
    p.add_argument(
        "--webhook-url",
        default=os.environ.get(
            "MOCK_CINDER_WEBHOOK_URL",
            "http://127.0.0.1:8000/api/v1/ts_response",
        ),
        help="Where the app's ts_webhook receiver is listening.",
    )
    p.add_argument(
        "--webhook-secret",
        default=os.environ.get("CINDER_WEBHOOK_TOKEN", ""),
        help=(
            "HMAC secret used to sign the decision.created webhook. "
            "Must match the fxsharing app's CINDER_WEBHOOK_TOKEN."
        ),
    )
    p.add_argument(
        "--delay",
        type=float,
        default=float(os.environ.get("MOCK_CINDER_DELAY", "0.5")),
        help="Seconds to wait before firing the webhook (simulates Cinder latency).",
    )
    args = p.parse_args()

    if not args.webhook_secret:
        log.warning(
            "No webhook secret set; the signature check in ts_webhook will reject "
            "the callback. Pass --webhook-secret or set CINDER_WEBHOOK_TOKEN."
        )

    server = MockCinderServer(
        (args.host, args.port),
        webhook_url=args.webhook_url,
        webhook_secret=args.webhook_secret,
        webhook_delay=args.delay,
    )
    log.info(
        "mock_cinder listening on http://%s:%d  ->  decision.created delivered "
        "to %s after %.2fs",
        args.host,
        args.port,
        args.webhook_url,
        args.delay,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
