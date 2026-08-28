"""Tests for the generic-port-naming guard on verified-absence claims.

Both directions are the acceptance criteria, not just the fix:

  * generic-port-naming-must-not-license-absence -- a fully-named part whose
    pads are named PA0/DIO3/P02 must fall back to UNKNOWN for protocol
    interfaces, not be "proven" to lack them.
  * ...and the original verified-absence proof cases must be untouched. AD4057
    is named by FUNCTION (BAT, CHRG, GND, PROG, STDBY, VCC); its I2C absence is
    a genuine negative and must still score at the absent tier.

Run:  ai_engine/.venv/bin/python agents/component_agent/test_generic_naming_guard.py
"""
from __future__ import annotations

import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
if "config" not in sys.modules:
    stub = types.ModuleType("config")
    stub.DEFAULT_QTY = 1
    sys.modules["config"] = stub

import coverage  # noqa: E402
import ranking  # noqa: E402

FAILURES: list[str] = []


def check(label, got, want):
    if got == want:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}\n          got:  {got!r}\n          want: {want!r}")
        FAILURES.append(label)


def cand(lcsc):
    return {"mfr_part": "P", "extra_params": {"number": lcsc}, "description": ""}


GUARDED = ["GPIO", "UART", "SPI", "I2C", "PWM"]

# The real shape the coverage table now emits.
coverage._TABLE = {"parts": {
    # STM32WLE5CCU6: 49/49 pads named, ZERO confirmed interfaces, all generic.
    "C2888218": {
        "mfr_part": "STM32WLE5CCU6", "pad_count": 49, "named_pads": 49,
        "naming_complete": True, "interfaces_confirmed": [],
        "names": ["PA0", "PA1", "PB2", "VDD1", "VSSSMPS"],
        "absence_unclaimable_for": GUARDED,
    },
    # STM32WL55JCI6: same, but Power IS confirmed.
    "C2678806": {
        "mfr_part": "STM32WL55JCI6", "pad_count": 136, "named_pads": 136,
        "naming_complete": True, "interfaces_confirmed": ["Power"],
        "names": ["PA0", "PB3", "VDD"],
        "absence_unclaimable_for": GUARDED,
    },
    # AD4057: functionally named, no generic IO -> guard must NOT fire.
    "C395461": {
        "mfr_part": "AD4057", "pad_count": 6, "named_pads": 6,
        "naming_complete": True, "interfaces_confirmed": ["Power"],
        "names": ["BAT", "CHRG", "GND", "PROG", "STDBY", "VCC"],
        "absence_unclaimable_for": [],
    },
    # An OLD table record with no key at all -> previous behaviour preserved.
    "C000LEGACY": {
        "mfr_part": "LEGACY-COMPLETE", "pad_count": 4, "named_pads": 4,
        "naming_complete": True, "interfaces_confirmed": ["Power"],
        "names": ["VCC", "GND", "OUT", "IN"],
    },
    # HY2111-GB is deliberately NOT in the table -> unknown by absence.
}}

print("\n=== generic-port-naming-must-not-license-absence ===")

for iface in ("I2C", "SPI", "UART"):
    check(f"STM32WLE5CCU6 {iface} is UNKNOWN, not a verified absence",
          coverage.interface_confidence(cand("C2888218"), iface), None)
    check(f"STM32WL55JCI6 {iface} is UNKNOWN, not a verified absence",
          coverage.interface_confidence(cand("C2678806"), iface), None)

# The whole point: it must no longer score at the disqualifying tier.
req_i2c = {"interface_requirements": [{"interface": "I2C", "relationship": "shared_bus"}]}
stm = ranking._score_interface_match(cand("C2888218"), req_i2c)
check("STM32WLE5CCU6 no longer scores at the verified-absent tier",
      stm > ranking._IFACE_VERIFIED_ABSENT, True)
check("STM32WLE5CCU6 lands on no-evidence (unknown), not a positive claim",
      stm, ranking._IFACE_NO_EVIDENCE)

# Power is NOT mux-assignable: generic I/O cannot conjure a supply rail.
check("Power absence is STILL claimable on a generic-named part (not guarded)",
      coverage.interface_confidence(cand("C2888218"), "Power"), 0.0)
check("a confirmed Power rail is still confirmed",
      coverage.interface_confidence(cand("C2678806"), "Power"), 1.0)

print("\n=== the original verified-absence cases must be UNAFFECTED ===")

check("AD4057 I2C is STILL a verified absence (0.0), guard did not fire",
      coverage.interface_confidence(cand("C395461"), "I2C"), 0.0)
check("AD4057 Power still confirmed",
      coverage.interface_confidence(cand("C395461"), "Power"), 1.0)

ad = ranking._score_interface_match(cand("C395461"), req_i2c)
hy = ranking._score_interface_match(cand("C82747"), req_i2c)  # absent from table
check("AD4057 still scores at the verified-absent tier",
      ad, ranking._IFACE_VERIFIED_ABSENT)
check("HY2111-GB is still merely unknown (absent from table)",
      coverage.interface_confidence(cand("C82747"), "I2C"), None)
check("proven-absent still ranks STRICTLY below merely-unknown",
      ad < hy, True)

# The ordering invariant that motivated the ceiling must survive: a guarded
# generic part is unknown, so it must rank above a genuinely proven absence.
check("guarded generic part outranks a genuinely proven absence",
      stm > ad, True)

print("\n=== a stale table must not silently neuter negatives ===")

check("record with NO absence_unclaimable_for key keeps old behaviour",
      coverage.interface_confidence(cand("C000LEGACY"), "I2C"), 0.0)

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("all checks passed")


def test_generic_naming_guard():
    assert not FAILURES, FAILURES
