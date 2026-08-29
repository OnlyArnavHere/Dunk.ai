"""Tests for the query-text taxonomy hint (retrieval.py _build_query / ':281').

Before this, _build_query called the RAW uncurated resolver while
_filter_candidates used the curated table, so the two call sites disagreed about
what a category is. For an MCU request the query was steered by `NXP MCU` while
the filter admitted on generic labels, and the FAISS top-20 came back
20/20 NXP Semiconductors -- a single-vendor pool the filter faithfully preserved.

Exercises the selection logic against real measured label/row-count pairs
without loading the 490k-row dataset.
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

import curated_taxonomy as ct  # noqa: E402

FAILURES: list[str] = []


def check(label, got, want):
    if got == want:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}\n          got:  {got!r}\n          want: {want!r}")
        FAILURES.append(label)


MIN_ROWS = 10
N_LABELS = 3


class FakeRetriever:
    """The real _taxonomy_hint logic, against injected labels/counts."""

    TAXONOMY_HINT_MIN_ROWS = MIN_ROWS
    TAXONOMY_HINT_LABELS = N_LABELS

    def __init__(self, rows, resolved):
        self.category_labels = list(rows)
        self._rows = rows
        self._resolved = resolved

    def _resolve_category(self, text):
        return list(self._resolved)

    def _taxonomy_hint(self, subsystem, category):
        curated = ct.curated_labels(category)
        if curated:
            counts = ct.CURATED[str(category).strip().lower()]["labels"]
            return sorted(curated, key=lambda l: -counts.get(l, 0))[:self.TAXONOMY_HINT_LABELS]
        resolved = self._resolve_category(f"{subsystem or ''} {category or ''}".strip())
        if not resolved:
            return []
        substantial = [l for l in resolved if self._rows.get(l, 0) >= self.TAXONOMY_HINT_MIN_ROWS]
        return substantial[:self.TAXONOMY_HINT_LABELS]


# Real labels + real row counts measured from the catalogue.
ROWS = {
    "NXP MCU": 320, "Other Processors and Microcontrollers (MCUs)": 88, "ARTERY Mcu": 12,
    "Power Management": 2598, "Power Management - Specialized": 85, "Power Management ICs": 14631,
    "Temperature and Humidity Sensor": 55, "Humidity Sensors/Temperature and Humidity Sensors": 42,
    "Temperature Sensors": 678,
    "WiFi Modules": 148, "Wireless Modules": 4, "IoT/Communication Modules": 854,
    "Bluetooth Modules": 93,
    "EEPROM": 1218, "Memory Controllers": 3, "Memory": 2381,
    "Real-time Clocks": 236, "Real Time Clocks": 15, "RTC/Clock Chip": 614,
    "Pushbutton Switch": 2, "Pushbutton Switches": 123, "Pushbutton Switches & Relays": 16,
    "Push Switches": 360,
    "LED Drivers": 1943, "LED Display Drivers": 94,
    "Display Modules / LED Drivers / Display Drivers": 1169,
    "I/O Expansion": 1, "Pin Headers": 5744, "I/O Expanders": 274, "Female Headers": 3987,
    "Ethernet Modules": 55, "Ethernet ICs": 318, "Ethernet Switches": 13,
}

print("\n=== the 3 curated categories inject CURATED labels, ordered by coverage ===")
r = FakeRetriever(ROWS, ["ignored"])
check("Processing no longer injects the vendor label first",
      r._taxonomy_hint("MCU", "Processing")[0], "Microcontroller Units (MCUs/MPUs/SOCs)")
check("Processing hint is the 3 dominant generic labels",
      r._taxonomy_hint("MCU", "Processing"),
      ["Microcontroller Units (MCUs/MPUs/SOCs)",
       "Single Chip Microcomputer/Microcontroller",
       "Microcontrollers (MCU/MPU/SOC)"])
check("Processing hint contains NO vendor-specific label",
      [l for l in r._taxonomy_hint("MCU", "Processing")
       if l in ("NXP MCU", "TI MCU", "ARTERY Mcu")], [])
check("Storage no longer steered by the 2-row FLASH label",
      r._taxonomy_hint("Flash Storage", "Storage"), ["Memory", "EEPROM", "NOR FLASH"])
check("Security drops the label the FILTER explicitly rejects",
      r._taxonomy_hint("Secure Element", "Security"),
      ["Security Verification / Encryption ICs"])
check("  ...and Leakage Protection ICs is indeed a filter exclusion",
      "Leakage Protection ICs" in ct.CURATED["security"]["excluded"], True)

print("\n=== de-minimis floor: junk labels evicted, real ones promoted ===")
cases = {
    "Communication": (["WiFi Modules", "Wireless Modules", "IoT/Communication Modules",
                       "Bluetooth Modules"],
                      ["WiFi Modules", "IoT/Communication Modules", "Bluetooth Modules"],
                      "Wireless Modules"),
    "Memory": (["EEPROM", "Memory Controllers", "Memory"],
               ["EEPROM", "Memory"], "Memory Controllers"),
    "Input": (["Pushbutton Switch", "Pushbutton Switches", "Pushbutton Switches & Relays",
               "Push Switches"],
              ["Pushbutton Switches", "Pushbutton Switches & Relays", "Push Switches"],
              "Pushbutton Switch"),
    "Expansion": (["I/O Expansion", "Pin Headers", "I/O Expanders", "Female Headers"],
                  ["Pin Headers", "I/O Expanders", "Female Headers"], "I/O Expansion"),
}
for cat, (resolved, want, dropped) in cases.items():
    got = FakeRetriever(ROWS, resolved)._taxonomy_hint("x", cat)
    check(f"{cat}: drops {dropped!r} ({ROWS[dropped]} rows)", got, want)
    check(f"  ...{dropped!r} really is below the floor", ROWS[dropped] < MIN_ROWS, True)

print("\n=== NON-REGRESSION: the 5 literal-match categories keep good hints ===")
unchanged = {
    "Power": (["Power Management", "Power Management - Specialized", "Power Management ICs"],
              ["Power Management", "Power Management - Specialized", "Power Management ICs"]),
    "Sensor": (["Temperature and Humidity Sensor",
                "Humidity Sensors/Temperature and Humidity Sensors", "Temperature Sensors"],
               ["Temperature and Humidity Sensor",
                "Humidity Sensors/Temperature and Humidity Sensors", "Temperature Sensors"]),
    "Clock": (["Real-time Clocks", "Real Time Clocks", "RTC/Clock Chip"],
              ["Real-time Clocks", "Real Time Clocks", "RTC/Clock Chip"]),
    "Output": (["LED Drivers", "LED Display Drivers",
                "Display Modules / LED Drivers / Display Drivers"],
               ["LED Drivers", "LED Display Drivers",
                "Display Modules / LED Drivers / Display Drivers"]),
    "Network": (["Ethernet Modules", "Ethernet ICs", "Ethernet Switches"],
                ["Ethernet Modules", "Ethernet ICs", "Ethernet Switches"]),
}
for cat, (resolved, want) in unchanged.items():
    check(f"{cat}: hint unchanged (all labels already substantial)",
          FakeRetriever(ROWS, resolved)._taxonomy_hint("x", cat), want)
# Communication and Memory ARE literal-match categories and DO change -- for the
# better. Asserted explicitly so the change is deliberate, not incidental.
check("Communication (literal-match) improves rather than regresses",
      FakeRetriever(ROWS, cases["Communication"][0])._taxonomy_hint("x", "Communication"),
      cases["Communication"][1])
check("Memory (literal-match) improves rather than regresses",
      FakeRetriever(ROWS, cases["Memory"][0])._taxonomy_hint("x", "Memory"),
      cases["Memory"][1])

print("\n=== null-safety: never inject junk, never crash ===")
check("no resolution -> no hint line", FakeRetriever(ROWS, [])._taxonomy_hint("x", "Output"), [])
check("all labels below the floor -> no hint line, not junk",
      FakeRetriever(ROWS, ["I/O Expansion", "Pushbutton Switch"])._taxonomy_hint("x", "Output"), [])
check("unknown label (absent from index) treated as 0 rows",
      FakeRetriever(ROWS, ["Not In Catalogue", "LED Drivers"])._taxonomy_hint("x", "Output"),
      ["LED Drivers"])
check("None category does not raise",
      FakeRetriever(ROWS, ["LED Drivers"])._taxonomy_hint("x", None), ["LED Drivers"])
check("hint is capped at 3 labels",
      len(FakeRetriever(ROWS, list(ROWS))._taxonomy_hint("x", "Output")), 3)

print("\n=== the floor's safe range, MEASURED rather than asserted ===")
# Bounded BELOW by the largest junk label that must be dropped (Wireless
# Modules, 4) and ABOVE by the smallest real label that must be kept
# (Pushbutton Switches & Relays, 16). So (4, 16], and 10 sits in it with 6 rows
# of margin either side. An earlier estimate of "~5 to ~40" was WRONG -- it
# overlooked the 12-16 row labels (ARTERY Mcu 12, Ethernet Switches 13,
# Real Time Clocks 15, Pushbutton Switches & Relays 16). Asserted in both
# directions so the margin can never be quietly overstated again.
def stable_at(floor):
    class F(FakeRetriever):
        TAXONOMY_HINT_MIN_ROWS = floor
    return all(F(ROWS, resolved)._taxonomy_hint("x", cat) == want
               for cat, (resolved, want, _) in cases.items())

for floor in (5, 10, 16):
    check(f"floor={floor} gives the identical result", stable_at(floor), True)
for floor in (17, 20, 40):
    check(f"floor={floor} DOES change the result (the upper bound is real)",
          stable_at(floor), False)
check("the chosen floor sits inside the measured safe range",
      5 <= MIN_ROWS <= 16, True)

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("all checks passed")


def test_taxonomy_hint():
    assert not FAILURES, FAILURES
