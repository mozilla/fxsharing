/**
 * Lightweight client-side telemetry utility.
 *
 * Fires events to the server-side /event endpoint, which emits an OTel span.
 * Uses sendBeacon so events survive link navigations (e.g. CTA clicks).
 *
 * Declarative usage: add data-event="<event_type>" to any element and load
 * this module — click listeners are wired automatically on DOMContentLoaded.
 *
 * Programmatic usage: import { recordEvent } from "./telemetry.mjs".
 */

export function recordEvent(eventType, properties = {}) {
  const data = JSON.stringify({ event_type: eventType, properties });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/event", new Blob([data], { type: "application/json" }));
    } else {
      fetch("/event", {
        method: "POST",
        body: data,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    }
  } catch {
    // Telemetry failures can fall through
  }
}

// Auto-wire click listeners for any element with data-event="<event_type>".
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-event]").forEach((el) => {
    el.addEventListener("click", () => recordEvent(el.dataset.event, {}));
  });
});
