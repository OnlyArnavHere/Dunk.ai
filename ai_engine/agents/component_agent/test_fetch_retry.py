"""Tests for _fetch_bytes's retry policy.

Weighted toward the exception types that ESCAPED the old enumerated tuple
(Timeout, ConnectionError, HTTPError) rather than the ones it already caught.
The regression that prompted this: a mid-body transfer break surfaces from
`resp.content` as ChunkedEncodingError -- a sibling of those three under
RequestException, not a subclass -- so it bypassed the retry and killed the
Component Agent on a transient failure.

`config` fetches a ~754MB dataset at module import, so importing it here is not
an option. Instead this execs ONLY the `_fetch_bytes` FunctionDef out of
config.py's source, against injected stubs. That means the code under test is
the real function as written in config.py -- if someone narrows the except
clause again, this test fails.

Run:  ai_engine/.venv/bin/python -m pytest agents/component_agent/test_fetch_retry.py -q
  or: ai_engine/.venv/bin/python agents/component_agent/test_fetch_retry.py
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.py"

FAILURES: list[str] = []


def check(label: str, got, want) -> None:
    if got == want:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}\n          got:  {got!r}\n          want: {want!r}")
        FAILURES.append(label)


# ---------------------------------------------------------------------------
# Load the real _fetch_bytes without executing config.py's module body.
# ---------------------------------------------------------------------------

def _load_fetch_bytes(namespace: dict):
    tree = ast.parse(CONFIG_PATH.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "_fetch_bytes":
            module = ast.Module(body=[node], type_ignores=[])
            exec(compile(module, str(CONFIG_PATH), "exec"), namespace)  # noqa: S102
            return namespace["_fetch_bytes"]
    raise AssertionError("_fetch_bytes not found in config.py")


class _Resp:
    """Minimal stand-in for requests.Response."""

    def __init__(self, content=b"", status_code=200):
        self.content = content
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            err = requests.HTTPError(f"{self.status_code} error")
            err.response = self
            raise err


def run_fetch(outcomes, attempts=3):
    """Drive _fetch_bytes over a scripted list of per-attempt outcomes.

    Each outcome is either an Exception to raise or a _Resp to return.
    Returns (result, error, calls, sleeps).
    """
    calls: list[str] = []
    sleeps: list[int] = []
    seq = list(outcomes)

    def fake_get(url, headers=None, timeout=None):
        calls.append(url)
        outcome = seq.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    fake_requests = type("R", (), {"get": staticmethod(fake_get), "exceptions": requests.exceptions})
    fake_time = type("T", (), {"sleep": staticmethod(lambda d: sleeps.append(d))})

    ns = {
        "requests": fake_requests,
        "time": fake_time,
        "hf_hub_url": lambda repo_id, filename, repo_type: f"https://hf/{repo_id}/{filename}",
        "HF_REPO_ID": "rayyanshk/dunkai",
        "HF_REPO_TYPE": "dataset",
        "_HEADERS": {},
        "_FETCH_TIMEOUT": (10, 120),
        "_FETCH_ATTEMPTS": attempts,
        "_FETCH_BACKOFF_SECONDS": 5,
        "print": lambda *a, **k: None,
    }
    fetch = _load_fetch_bytes(ns)

    result = error = None
    try:
        result = fetch("components_ml.parquet")
    except BaseException as exc:  # noqa: BLE001 - the assertion target
        error = exc
    return result, error, calls, sleeps


def chunked_break():
    """The exact failure seen in the wild: transfer dies mid-body."""
    return requests.exceptions.ChunkedEncodingError(
        "Connection broken: IncompleteRead(393355889 bytes read, 360657423 more expected)"
    )


def http_error(status):
    err = requests.HTTPError(f"{status}")
    err.response = _Resp(status_code=status)
    return err


# ---------------------------------------------------------------------------
print("\n=== THE REGRESSION: ChunkedEncodingError must retry, not escape ===")

# This is the case that failed before the widening. Under the old tuple the
# very first ChunkedEncodingError propagated out uncaught.
result, error, calls, sleeps = run_fetch([chunked_break(), chunked_break(), _Resp(b"payload")])
check("mid-stream break then success -> returns payload", result, b"payload")
check("mid-stream break -> retry actually fired (3 attempts)", len(calls), 3)
check("mid-stream break -> backoff is linear 5s, 10s", sleeps, [5, 10])
check("mid-stream break -> no exception escapes", error, None)

# Exhausting every attempt must still surface a RuntimeError, not the raw
# ChunkedEncodingError -- callers key on the wrapped message.
result, error, calls, sleeps = run_fetch([chunked_break(), chunked_break(), chunked_break()])
check("all attempts break -> RuntimeError", type(error).__name__, "RuntimeError")
check("all attempts break -> tried exactly 3 times", len(calls), 3)
check("all attempts break -> slept only between attempts", sleeps, [5, 10])
check("all attempts break -> cause chained", type(error.__cause__).__name__, "ChunkedEncodingError")

print("\n=== siblings the old tuple also missed ===")

# Neither of these is a Timeout/ConnectionError/HTTPError either.
result, _, calls, _ = run_fetch([requests.exceptions.ContentDecodingError("gzip"), _Resp(b"ok")])
check("ContentDecodingError -> retried", (result, len(calls)), (b"ok", 2))

result, _, calls, _ = run_fetch([requests.exceptions.ChunkedEncodingError("x"), _Resp(b"ok")])
check("single break recovers on attempt 2", (result, len(calls)), (b"ok", 2))

print("\n=== previously-caught types must STILL retry (no behaviour lost) ===")

for label, exc in (
    ("Timeout", requests.Timeout("slow")),
    ("ConnectionError", requests.ConnectionError("reset by peer")),
):
    result, _, calls, _ = run_fetch([exc, _Resp(b"ok")])
    check(f"{label} -> still retried", (result, len(calls)), (b"ok", 2))

print("\n=== the status guard must survive the widening ===")

# A definitive client-side rejection still fails fast on attempt 1: widening the
# catch must not turn a bad token into three slow identical failures.
result, error, calls, sleeps = run_fetch([http_error(404), _Resp(b"never")])
check("404 -> re-raised immediately", type(error).__name__, "HTTPError")
check("404 -> exactly one attempt, no retry", len(calls), 1)
check("404 -> never slept", sleeps, [])

result, error, calls, _ = run_fetch([http_error(401), _Resp(b"never")])
check("401 (bad token) -> re-raised immediately", type(error).__name__, "HTTPError")
check("401 -> exactly one attempt", len(calls), 1)

# 429 and 5xx are explicitly worth another go.
result, _, calls, _ = run_fetch([http_error(429), _Resp(b"ok")])
check("429 -> retried despite being 4xx", (result, len(calls)), (b"ok", 2))

result, _, calls, _ = run_fetch([http_error(503), _Resp(b"ok")])
check("503 -> retried", (result, len(calls)), (b"ok", 2))


# ---------------------------------------------------------------------------
print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("all checks passed")


def test_fetch_retry():
    """pytest entry point -- the checks above run at import."""
    assert not FAILURES, FAILURES
