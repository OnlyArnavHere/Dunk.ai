"""Per-request provider credentials (BYOK).

A user who brings their own key must have *their* key used for *their* run and
nobody else's. Writing it into ``os.environ`` would do the opposite: the
supervisor serves concurrent requests from one process, so a key set for one
run would be read by every other run in flight.

The key therefore lives in a :class:`~contextvars.ContextVar`. LangGraph and
LangChain copy the current context into the worker threads they spawn, so a
value set at the top of a request is visible to every node of that request and
to no other request.

Lookup order for every provider: the request's own key, then the operator's
environment variable (the hosted "platform" key), then nothing.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, Mapping

#: provider name -> environment variable holding the operator's key.
ENV_VARS: dict[str, str] = {
    "groq": "GROQ_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "ollama": "OLLAMA_API_KEY",
}

_request_keys: ContextVar[Mapping[str, str]] = ContextVar("dunkai_request_keys", default={})


def _clean(credentials: Mapping[str, object] | None) -> dict[str, str]:
    if not credentials:
        return {}
    return {
        name: value.strip()
        for name, value in credentials.items()
        if name in ENV_VARS and isinstance(value, str) and value.strip()
    }


@contextmanager
def use_credentials(credentials: Mapping[str, object] | None) -> Iterator[None]:
    """Make ``credentials`` the active keys for the duration of the block."""
    token = _request_keys.set(_clean(credentials))
    try:
        yield
    finally:
        _request_keys.reset(token)


def api_key(provider: str) -> str | None:
    """The key to use for ``provider`` right now: the user's, else the operator's."""
    own = _request_keys.get().get(provider)
    if own:
        return own
    env_var = ENV_VARS.get(provider)
    return os.getenv(env_var) if env_var else None


def is_user_key(provider: str) -> bool:
    """True when the active key for ``provider`` came from the request."""
    return bool(_request_keys.get().get(provider))


def subprocess_env(base: Mapping[str, str] | None = None) -> dict[str, str]:
    """An environment for a child process with the request's keys applied.

    The child gets a copy; this process's own environment is never touched.
    """
    env = dict(base if base is not None else os.environ)
    for provider, key in _request_keys.get().items():
        env[ENV_VARS[provider]] = key
    return env


def groq_api_key() -> str:
    """The Groq key for the current request, or a clear error naming both sources."""
    key = api_key("groq")
    if not key:
        raise EnvironmentError(
            "No Groq API key: add one in Settings → API keys, or set GROQ_API_KEY on the AI engine."
        )
    return key
