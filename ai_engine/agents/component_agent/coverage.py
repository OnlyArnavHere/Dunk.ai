"""
coverage.py

Verified per-part pin coverage, fetched from the downstream PCB module.

WHY THIS EXISTS
---------------
`ranking.py` scores `interface_match` from catalogue data alone, and a populated
`Interface` attribute exists for roughly 8% of parts (18 of 240 surveyed, all in
one subsystem). Everything else falls back to free text, where a datasheet blurb
mentioning "I2C" is indistinguishable from a real capability.

The PCB module resolves each shortlisted part's actual footprint and reads its
real pin names, publishing the result as `pin-coverage.json`. This module fetches
that table so ranking can score against *verified* pins instead of prose.

THE CONTRACT — three states, never two
--------------------------------------
The table is deliberately not a boolean. Collapsing "we never checked" into "it
doesn't have it" is the same false-negative that has bitten this codebase
repeatedly (MISSING_PINS as a warning, mockedPinCount defaulting to 0). So:

    part absent from table          -> UNKNOWN. Never "no interfaces".
    naming_complete = False         -> a missing interface is UNKNOWN, not absent.
    naming_complete = True          -> absence is a real negative, UNLESS the table lists
                                       the interface in absence_unclaimable_for
                                       (generic port naming; see capabilityCheck.js).

`interface_confidence()` returns ``None`` for every unknown case. Callers must
fall through to their own weaker evidence rather than substituting a number.

Measured distribution at the time of writing (156 parts): 69 have complete
naming (44%), and confirmed interfaces are dominated by Power (81) and I2C (31),
with UART at 1 and SPI at 0. So ``None`` is the common answer, by a wide margin.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

# Published by the PCB module's scripts/build-coverage.js.
COVERAGE_URL = os.environ.get(
    "PIN_COVERAGE_URL",
    "https://raw.githubusercontent.com/OnlyArnavHere/Verm--circuit-module-"
    "/master/data/coverage/pin-coverage.json",
)

# Local fallback copy, refreshed on every successful fetch.
CACHE_PATH = Path(
    os.environ.get("PIN_COVERAGE_CACHE", Path(__file__).resolve().parents[2] / "data" / "pin-coverage.json")
)

# (connect, read). Present from the first line, not added after an incident:
# an unbounded requests.get() against a flaky remote turns a reportable error
# into an indefinite hang, which is exactly how this project lost 24 minutes and
# then 2h48m to a stalled HF stream.
FETCH_TIMEOUT = (10, 120)
FETCH_ATTEMPTS = 3
FETCH_BACKOFF_SECONDS = 3

_TABLE: Optional[Dict[str, Any]] = None


def _write_cache(payload: Dict[str, Any]) -> None:
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(payload), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001 - caching is best-effort
        logger.warning("Could not cache pin coverage: %s", exc)


def _read_cache() -> Optional[Dict[str, Any]]:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_coverage(force: bool = False) -> Dict[str, Any]:
    """Fetch the coverage table, falling back to the last good local copy.

    Ranking must never block on this. A fetch failure degrades to the cached
    file, and a missing cache degrades to an empty table — which reads as
    "nothing is known", the honest answer, and leaves every lookup returning
    ``None``.
    """
    global _TABLE
    if _TABLE is not None and not force:
        return _TABLE

    last_error: Optional[Exception] = None
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            response = requests.get(COVERAGE_URL, timeout=FETCH_TIMEOUT)
            response.raise_for_status()
            payload = response.json()
            _TABLE = payload
            _write_cache(payload)
            logger.info(
                "Pin coverage loaded: %d part(s) from %s",
                len(payload.get("parts") or {}), COVERAGE_URL,
            )
            return _TABLE
        except Exception as exc:  # noqa: BLE001 - any failure falls back
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status is not None and 400 <= status < 500 and status != 429:
                last_error = exc
                break  # a 404 will not fix itself on retry
            last_error = exc
            if attempt < FETCH_ATTEMPTS:
                time.sleep(FETCH_BACKOFF_SECONDS * attempt)

    cached = _read_cache()
    if cached is not None:
        logger.warning(
            "Pin coverage fetch failed (%s); using cached copy with %d part(s).",
            last_error, len(cached.get("parts") or {}),
        )
        _TABLE = cached
        return _TABLE

    logger.warning(
        "Pin coverage unavailable (%s) and no local cache. "
        "Ranking continues with unknown coverage for every part.",
        last_error,
    )
    _TABLE = {"parts": {}, "unavailable": True}
    return _TABLE


def lcsc_of(candidate: Dict[str, Any]) -> Optional[str]:
    """The JLCPCB catalogue id this candidate is keyed by (e.g. "C82227").

    Not `mfr_part`: the same manufacturer part in a different package is a
    different footprint with different pads.
    """
    extra = candidate.get("extra_params")
    if not isinstance(extra, dict):
        return None
    number = extra.get("number")
    return str(number) if number else None


def interface_confidence(candidate: Dict[str, Any], interface: str) -> Optional[float]:
    """How strongly verified pin data supports `interface` on this candidate.

    Returns
    -------
    1.0   the part's real pins confirm this interface
    0.0   every pad is named and the interface is genuinely absent
    None  UNKNOWN — not in the table, or naming incomplete so absence is
          unproven. The caller MUST fall through to weaker evidence; None must
          never be coerced to a score.
    """
    table = load_coverage()
    parts = table.get("parts") or {}

    lcsc = lcsc_of(candidate)
    if not lcsc:
        return None

    entry = parts.get(lcsc)
    if not isinstance(entry, dict):
        return None  # never resolved — unknown, not absent

    confirmed = {str(i).upper() for i in (entry.get("interfaces_confirmed") or [])}
    if str(interface).upper() in confirmed:
        return 1.0

    # Absent from the confirmed list. That is only a real negative when every
    # pad on the part is named; otherwise the interface may sit on an unnamed
    # pad and we simply do not know.
    #
    # ...and complete naming is not sufficient on its own. A part whose pads are
    # named GENERICALLY (PA0, DIO3, P02 -- port positions, not functions) can be
    # fully named and still say nothing about protocol: such a pin is
    # mux-assignable and may carry I2C/SPI/UART without ever declaring it.
    # STM32WLE5CCU6 is the proof -- 49 of 49 pads named, interfaces_confirmed
    # empty -- and read literally it was "proven" to lack I2C, SPI and UART,
    # which is the strongest negative this module can emit, asserted about a
    # part that plainly has all three.
    #
    # The table now says which interfaces its own naming cannot speak to. That
    # decision is made ONCE, in capabilityCheck.js
    # (`absenceUnclaimableInterfaces`), next to the positional-naming guard that
    # already existed; this is a lookup, not a second implementation of the
    # rule. Power is deliberately NOT in that list -- generic I/O cannot conjure
    # a supply rail -- so power negatives survive unchanged, as do parts named
    # by function (AD4057: BAT, CHRG, GND, PROG, STDBY, VCC).
    #
    # An OLD table without the key keeps the previous behaviour rather than
    # silently suppressing every negative: a stale artefact must not quietly
    # neuter genuine absences.
    unclaimable = {
        str(i).upper() for i in (entry.get("absence_unclaimable_for") or [])
    }
    if str(interface).upper() in unclaimable:
        return None

    if entry.get("naming_complete") is True:
        return 0.0
    return None
