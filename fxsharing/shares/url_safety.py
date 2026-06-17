import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import requests

ALLOWED_SCHEMES = ("http", "https")


class UnsafeURLError(Exception):
    """Raised when a URL uses a disallowed scheme or resolves to a non-public IP."""


def _ip_is_public(ip_str):
    ip = ipaddress.ip_address(ip_str)

    # Unwrap IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254) so the embedded
    # IPv4 address is evaluated rather than the harmless-looking wrapper.
    if getattr(ip, "ipv4_mapped", None):
        ip = ip.ipv4_mapped

    return ip.is_global


def _resolve_and_validate(url):
    """Validate scheme and ensure every resolved IP for the host is public."""
    parts = urlsplit(url)
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeURLError(f"disallowed scheme: {parts.scheme!r}")
    host = parts.hostname
    if not host:
        raise UnsafeURLError("URL has no host")
    try:
        addrinfo = socket.getaddrinfo(host, parts.port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise UnsafeURLError(f"DNS resolution failed for {host!r}") from e
    ips = {info[4][0] for info in addrinfo}
    if not ips:
        raise UnsafeURLError(f"no addresses resolved for {host!r}")
    for ip in ips:
        if not _ip_is_public(ip):
            raise UnsafeURLError(f"{host!r} resolves to non-public address {ip}")


def safe_get(url, *, headers=None, timeout=10, max_redirects=5):
    """Safely GET the supplied URL while blocking access to non-public addresses.

    Validates the scheme and each resolved IP before each request, and follows
    redirects manually so every hop is re-validated.

    Raises ``UnsafeURLError`` for disallowed targets and
    ``requests.exceptions.TooManyRedirects`` past ``max_redirects``.
    """
    current = url
    for _ in range(max_redirects + 1):
        _resolve_and_validate(current)
        resp = requests.get(
            current, headers=headers, timeout=timeout, allow_redirects=False
        )
        if resp.is_redirect and resp.headers.get("Location"):
            current = urljoin(current, resp.headers["Location"])
            continue
        return resp
    raise requests.exceptions.TooManyRedirects(f"exceeded {max_redirects} redirects")
