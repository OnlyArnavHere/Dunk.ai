"""Tests for the pin-coverage lookup and its wiring into interface_match.

Deliberately weighted toward the UNKNOWN paths rather than the happy path. The
real table is 44% complete-naming, with confirmed interfaces dominated by Power
(81) and I2C (31) — UART 1, SPI 0 — so "no opinion" is the common answer and is
what most needs to be correct.

Run:  ai_engine/.venv/bin/python -m pytest agents/component_agent/test_coverage.py -q
  or: ai_engine/.venv/bin/python agents/component_agent/test_coverage.py
"""
from __future__ import annotations

import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# `config` downloads a 490k-row dataset at import time; stub it.
if "config" not in sys.modules:
    stub = types.ModuleType("config")
    stub.DEFAULT_QTY = 1
    sys.modules["config"] = stub

import coverage  # noqa: E402
import ranking  # noqa: E402

_IFACE_ABSENT_TIER = ranking._IFACE_VERIFIED_ABSENT

FAILURES: list[str] = []


def check(label: str, got, want) -> None:
    if got == want:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}\n          got:  {got!r}\n          want: {want!r}")
        FAILURES.append(label)


def candidate(lcsc: str | None, **extra) -> dict:
    ep = {"number": lcsc} if lcsc else {}
    ep.update(extra.pop("extra_params", {}))
    return {"mfr_part": extra.pop("mfr_part", "PART"), "extra_params": ep, **extra}


def use_table(parts: dict) -> None:
    """Install a fixed coverage table, bypassing any fetch."""
    coverage._TABLE = {"parts": parts}


print("\n=== interface_confidence: the three states ===")

# 1. NOT IN TABLE -> unknown. The single most common case in the real data.
use_table({})
check("part absent from table -> None (never 0.0)",
      coverage.interface_confidence(candidate("C99999"), "I2C"), None)

# 2. PARTIAL NAMING, interface not confirmed -> unknown, NOT absent.
#    Real instance: MC9RS08KA1CSCR, 2 of 8 pads named (VSS, VDD).
use_table({"C2053131": {
    "mfr_part": "MC9RS08KA1CSCR", "pad_count": 8, "named_pads": 2,
    "naming_complete": False, "interfaces_confirmed": ["Power"],
}})
check("partial naming, interface absent -> None (unproven)",
      coverage.interface_confidence(candidate("C2053131"), "I2C"), None)
check("partial naming, interface confirmed -> 1.0 (positive still valid)",
      coverage.interface_confidence(candidate("C2053131"), "Power"), 1.0)

# 3. COMPLETE NAMING, interface absent -> the one sound hard negative.
use_table({"C82227": {
    "mfr_part": "HDC1080DMBR", "pad_count": 7, "named_pads": 7,
    "naming_complete": True, "interfaces_confirmed": ["I2C", "Power"],
}})
check("complete naming, interface absent -> 0.0 (genuine negative)",
      coverage.interface_confidence(candidate("C82227"), "SPI"), 0.0)
check("complete naming, interface confirmed -> 1.0",
      coverage.interface_confidence(candidate("C82227"), "I2C"), 1.0)

# 4. No catalogue id at all -> unknown. ~70 of 232 real MPNs have no C-number.
check("candidate without extra_params.number -> None",
      coverage.interface_confidence(candidate(None), "I2C"), None)
check("candidate with malformed extra_params -> None",
      coverage.interface_confidence({"extra_params": "not-a-dict"}, "I2C"), None)


print("\n=== interface_match: None must FALL THROUGH, never become a score ===")

req = {"interfaces": ["I2C"], "power_interfaces": []}

# Unknown coverage + structured attribute present -> the attribute tier decides.
use_table({})
structured = candidate("C111", extra_params={"attributes": {"Interface": "I2C"}})
check("unknown coverage falls through to structured attribute (1.00)",
      ranking._score_interface_match(structured, req), 1.00)

# Unknown coverage + free text only -> text tier, capped.
text_only = candidate("C222", description="a lovely I2C sensor")
check("unknown coverage falls through to free text (0.60)",
      round(ranking._score_interface_match(text_only, req), 2), 0.60)

# Unknown coverage + nothing at all -> no-evidence tier, NOT zero.
silent = candidate("C333", description="a component")
check("unknown coverage with no other evidence -> 0.30, not 0",
      round(ranking._score_interface_match(silent, req), 2), 0.30)

# Verified coverage OUTRANKS misleading free text.
use_table({"C444": {"pad_count": 8, "named_pads": 8, "naming_complete": True,
                    "interfaces_confirmed": []}})
lying = candidate("C444", description="supports I2C SPI UART everything")
score = ranking._score_interface_match(lying, req)
check("verified-absent beats marketing copy (0.05, not 0.60)", round(score, 2), 0.05)

use_table({"C555": {"pad_count": 8, "named_pads": 8, "naming_complete": True,
                    "interfaces_confirmed": ["I2C"]}})
quiet = candidate("C555", description="no marketing words here")
check("verified-present beats silence (1.00, not 0.30)",
      ranking._score_interface_match(quiet, req), 1.00)

# A partially-named part must NOT be punished for an unproven absence.
use_table({"C666": {"pad_count": 48, "named_pads": 5, "naming_complete": False,
                    "interfaces_confirmed": []}})
partial = candidate("C666", description="a microcontroller")
check("partial naming does not produce a negative score (0.30)",
      round(ranking._score_interface_match(partial, req), 2), 0.30)


print("\n=== REGRESSION: verified-absence-outranking-unknown ===")

# THE GUARD, stated as a rule rather than a number:
#
#   A part with a VERIFIED absence on ANY required interface must score at or
#   below a part with NO EVIDENCE at all on that interface. A proven "no" can
#   never outrank an "unknown", however many other required interfaces the
#   part confirms.
#
# The original defect: interface_match aggregated Tier 0 as
# `matched / len(required)`, which counted confirmed interfaces and DISCARDED
# verified-absent ones. Requesting I2C + Power, a part with confirmed Power and
# a proven-absent I2C scored 1.00 * (1/2) = 0.50 -- ahead of an unscanned part
# at 0.30. Averaging let a verified capability launder a verified incapability.
#
# Captured live: dunkai_real_v3_rankedcoverage.json, subsystem U2. AD4057 is a
# linear charger, 6 of 6 pads named, interfaces_confirmed ["Power"], no I2C. It
# won U2 against an I2C net and produced two PART_CAPABILITY_MISMATCH errors
# downstream. Both entries below are the real coverage-table rows.

BOTH_REQUIRED = {"interfaces": ["I2C"], "power_interfaces": ["Power"]}

use_table({
    # Verified ABSENT on I2C, verified PRESENT on Power.
    "C395461": {
        "mfr_part": "AD4057", "pad_count": 6, "named_pads": 6,
        "naming_complete": True, "interfaces_confirmed": ["Power"],
    },
    # HY2111-GB is simply not in the table -> unknown on BOTH interfaces.
})

ad4057 = ranking._score_interface_match(candidate("C395461"), BOTH_REQUIRED)
hy2111 = ranking._score_interface_match(candidate("C82747"), BOTH_REQUIRED)

check("AD4057 I2C is a verified absence, not an unknown",
      coverage.interface_confidence(candidate("C395461"), "I2C"), 0.0)
check("HY2111-GB I2C is unknown, not an absence",
      coverage.interface_confidence(candidate("C82747"), "I2C"), None)

# The rule itself. Not `== 0.05`: the constants may be retuned, but the
# ORDERING is the invariant and must hold whatever the numbers become.
check("proven-absent scores at or below merely-unknown",
      ad4057 <= hy2111, True)
check("proven-absent scores STRICTLY below merely-unknown (no middle ground)",
      ad4057 < hy2111, True)
check("a confirmed Power rail cannot launder the absent I2C back up to 0.50",
      ad4057 < 0.50, True)

# Generalisation: the guard must not depend on there being exactly two required
# interfaces. The more interfaces a part confirms, the more the old average
# rewarded it -- so widen the request and re-assert.
MANY = {"interfaces": ["I2C", "SPI", "UART"], "power_interfaces": ["Power"]}
use_table({"C777": {
    "mfr_part": "CONFIRMS-THREE-OF-FOUR", "pad_count": 20, "named_pads": 20,
    "naming_complete": True, "interfaces_confirmed": ["Power", "SPI", "UART"],
}})
three_of_four = ranking._score_interface_match(candidate("C777"), MANY)
check("3 of 4 confirmed but 1 proven absent still scores at the absent tier",
      three_of_four, _IFACE_ABSENT_TIER)
check("3-of-4-with-a-proven-gap does not outrank a wholly unknown part",
      three_of_four <= ranking._IFACE_NO_EVIDENCE, True)

# The positive counterpart must NOT be dragged down by the same change: some
# confirmed and the rest merely unknown is better than nothing known at all.
use_table({"C888": {
    "mfr_part": "PARTIAL-POSITIVE", "pad_count": 20, "named_pads": 5,
    "naming_complete": False, "interfaces_confirmed": ["Power"],
}})
partial_positive = ranking._score_interface_match(candidate("C888"), MANY)
check("1 confirmed + 3 unknown is never worse than 4 unknown",
      partial_positive >= ranking._IFACE_NO_EVIDENCE, True)


print("\n=== fetch path degrades instead of blocking ===")

coverage._TABLE = None
original_url = coverage.COVERAGE_URL
coverage.COVERAGE_URL = "https://127.0.0.1:9/definitely-not-there.json"
coverage.CACHE_PATH = Path("/nonexistent-dir-for-test/pin-coverage.json")
coverage.FETCH_ATTEMPTS = 1
coverage.FETCH_BACKOFF_SECONDS = 0
table = coverage.load_coverage(force=True)
check("unreachable URL + no cache -> empty table, no exception",
      table.get("parts"), {})
check("unavailability is flagged, not silent", table.get("unavailable"), True)
check("every lookup is then None (unknown), not 0.0",
      coverage.interface_confidence(candidate("C82227"), "I2C"), None)
coverage.COVERAGE_URL = original_url

print()
if FAILURES:
    print("FAILURES: " + ", ".join(FAILURES))
    sys.exit(1)
print("all coverage tests passed")
