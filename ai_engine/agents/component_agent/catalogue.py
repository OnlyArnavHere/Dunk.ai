"""Is this part actually orderable? Checked when it is chosen, not later.

The board stage (dunkai-designer, Stage B) resolves every BOM part against the
JLCPCB catalogue. A part that is not there gets dropped from the board with its
connections -- measured on a real run: HDC2010YPAR (DSBGA-6) was selected here,
the catalogue search for it returned an unrelated EEPROM (M24C08), the gates
correctly refused it, and the humidity sensor vanished from the board. The
ranked list held other humidity sensors that ARE in stock.

So the ranker asks the same catalogue (jlcsearch, the service the designer
uses) before settling on a candidate, and walks down to the next one when the
answer is "not there". The verdict is three-valued on purpose: an unreachable
catalogue is "unknown", never "absent" -- going offline must not throw away
every good part.

``DUNKAI_CATALOGUE_CHECK=0`` turns the check off.
"""

from __future__ import annotations

import json
import os
import re
import threading
import urllib.parse
import urllib.request
from typing import Any

SEARCH_URL = os.environ.get("DUNKAI_CATALOGUE_URL", "https://jlcsearch.tscircuit.com/api/search")
TIMEOUT_S = float(os.environ.get("DUNKAI_CATALOGUE_TIMEOUT", "6"))

_cache: dict[str, dict[str, Any] | None] = {}
_lock = threading.Lock()


def enabled() -> bool:
    return os.environ.get("DUNKAI_CATALOGUE_CHECK", "1") != "0"


def _norm(part: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(part).upper())


def _same_part(requested: str, listed: str) -> bool:
    """Equal, or equal up to an ordering/packaging suffix (-TR, /MC, -E/MS)."""
    a, b = _norm(requested), _norm(listed)
    if not a or not b:
        return False
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    return len(short) >= 6 and long_.startswith(short)


class CatalogueUnavailable(Exception):
    """The catalogue could not be asked; the caller treats the part as unknown."""


def lookup(mfr_part: str, lcsc: str | None = None) -> dict[str, Any] | None:
    """The catalogue listing for a part, or None when it is not listed.

    By catalogue number when there is one: the service's text search is fuzzy
    and unreliable for part numbers -- "HDC1080DMBR" returns an unrelated
    relay, while "C82227" returns the HDC1080DMBR with 6,503 in stock. Without a
    number, a part-number miss is still the right answer for this pipeline: the
    board stage searches the same service and would miss it too.

    Raises CatalogueUnavailable on any transport problem. Answers are cached for
    the life of the process: a BOM asks about the same part more than once.
    """
    number = str(lcsc).upper().lstrip("C") if lcsc else ""
    query = f"C{number}" if number.isdigit() else mfr_part
    key = _norm(query)
    with _lock:
        if key in _cache:
            return _cache[key]

    url = f"{SEARCH_URL}?{urllib.parse.urlencode({'q': query})}"
    try:
        # An explicit user agent: the service answers 403 to urllib's default
        # "Python-urllib/3.x", which made every verdict "unknown".
        headers = {"accept": "application/json", "user-agent": "dunkai-component-agent/1.0"}
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=TIMEOUT_S) as res:
            body = json.loads(res.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 -- any failure means "could not ask"
        raise CatalogueUnavailable(str(exc)) from exc

    match = None
    for item in body.get("components") or []:
        same = str(item.get("lcsc")) == number if number.isdigit() else _same_part(mfr_part, item.get("mfr", ""))
        if same and int(item.get("stock") or 0) > 0:
            match = {
                "lcsc": f"C{item['lcsc']}",
                "mfr": item.get("mfr"),
                "package": item.get("package"),
                "stock": int(item.get("stock") or 0),
            }
            break

    with _lock:
        _cache[key] = match
    return match


def verdict(mfr_part: str, lcsc: str | None = None) -> tuple[bool | None, dict[str, Any] | None]:
    """(True, listing) in stock · (False, None) not listed / no stock · (None, None) unknown."""
    if not enabled() or not (mfr_part or lcsc):
        return None, None
    try:
        found = lookup(mfr_part, lcsc)
    except CatalogueUnavailable:
        return None, None
    return (True, found) if found else (False, None)
