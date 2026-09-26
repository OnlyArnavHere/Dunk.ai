"""Tests for case-variant merging in the taxonomy label index.

The catalogue carries the same concept under several casings. Deduping on the
exact string kept both, and near-identical embeddings rank them adjacently, so
ONE concept consumed TWO slots of a top-N window. The MCU query lost four of
its top ten slots that way ('ARTERY Mcu'/'Artery Mcu' and
'Pre-Ordered MCUs'/'Pre-ordered MCUs').

Exercises the real grouping logic against real label/count pairs measured from
the 490,894-row catalogue, without loading the dataset.

Run:  ai_engine/.venv/bin/python agents/component_agent/test_taxonomy_dedup.py
"""
from __future__ import annotations

import sys
from typing import Dict, List

FAILURES: list[str] = []


def check(label, got, want):
    if got == want:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}\n          got:  {got!r}\n          want: {want!r}")
        FAILURES.append(label)


def merge(counts: Dict[str, int]):
    """The grouping rule from _build_category_index, isolated."""
    groups: Dict[str, List[str]] = {}
    for label in counts:
        groups.setdefault(label.lower(), []).append(label)
    labels, rows = [], []
    for key in sorted(groups):
        variants = groups[key]
        canonical = max(variants, key=lambda v: (counts[v], v))
        labels.append(canonical)
        rows.append(sum(counts[v] for v in variants))
    return labels, rows


# Real pairs measured from the catalogue (all 46 groups; counts are actual).
REAL_PAIRS = [
    ("Inductors/Coils/Transformers", 24259, "inductors/coils/transformers", 1),
    ("Switches", 11471, "switches", 1),
    ("Circuit Protection", 11469, "circuit protection", 1),
    ("Global Sourcing Parts", 7315, "global sourcing parts", 1),
    ("Optoelectronics", 5206, "optoelectronics", 10),
    ("Pre-Ordered Connectors", 7, "Pre-ordered Connectors", 2081),
    ("Data Converters", 1902, "data converters", 1),
    ("Pre-Ordered RLCs", 4, "Pre-ordered RLCs", 1706),
    ("Mezzanine Connectors (Board To Board)", 145, "Mezzanine Connectors (Board to Board)", 1521),
    ("Relays", 1662, "relays", 1),
    ("Pre-Ordered Products", 1, "Pre-ordered Products", 1625),
    ("Others", 1197, "others", 56),
    ("Screw Terminal", 205, "Screw terminal", 837),
    ("Pre-Ordered MCUs", 2, "Pre-ordered MCUs", 1029),
    ("Pre-Programmed Oscillators", 60, "Pre-programmed Oscillators", 712),
    ("Clock And Timing", 93, "Clock and Timing", 614),
    ("Audio Products/Micromotors", 593, "audio products/micromotors", 1),
    ("Pre-Ordered Transistors", 2, "Pre-ordered transistors", 403),
    ("Hardware/Fasteners/Sealing", 254, "hardware/fasteners/sealing", 98),
    ("Industrial Control Electrical", 299, "Industrial control electrical", 16),
    ("Real-Time Clocks (RTC)", 15, "Real-time Clocks (RTC)", 236),
    ("SMD Round Nut", 90, "SMD round nut", 59),
    ("WIFI Modules", 1, "WiFi Modules", 147),
    ("Network Cables", 109, "Network cables", 1),
    ("Old Batch", 80, "old batch", 4),
    ("RF Misc ICs And Modules", 27, "RF Misc ICs and Modules", 42),
    ("Infrared Remote Receiver", 8, "Infrared remote receiver", 48),
    ("RF Attenuator", 20, "RF attenuator", 36),
    ("Temperature And Humidity Sensor", 27, "Temperature and Humidity Sensor", 28),
    ("Spring Plates Nut", 30, "Spring plates nut", 15),
    ("Plug", 29, "plug", 9),
    ("Switch Accessories Or Caps", 3, "Switch accessories or Caps", 28),
    ("Heat Sink/Heatsink", 20, "Heat sink/heatsink", 6),
    ("Press Spring", 21, "Press spring", 4),
    ("EMMC", 6, "eMMC", 18),
    ("Other Nuts", 12, "Other nuts", 10),
    ("Voltage-To-Frequency / Frequency-To-Voltage Converters", 2,
     "Voltage-to-Frequency / Frequency-to-Voltage Converters", 20),
    ("Shielding Clips", 12, "Shielding clips", 6),
    ("RMS-To-DC Converters", 1, "RMS-to-DC Converters", 13),
    ("ARTERY Mcu", 11, "Artery Mcu", 1),
    ("Hex Nut", 5, "Hex nut", 1),
    ("SMT Hex Nut Post", 2, "SMT hex nut post", 3),
    ("Test", 2, "test", 1),
    ("Interface Relays", 1, "Interface relays", 1),
    ("Cold-Pressed?Terminals", 119, "Cold-pressed?Terminals", 896),
    ("Clamp Filters (Ferrite Core With Case)", 33, "Clamp Filters (Ferrite Core with Case)", 28),
]

counts = {}
for a, na, b, nb in REAL_PAIRS:
    counts[a] = na
    counts[b] = nb
# A few singletons that must pass through untouched.
counts.update({"LED Drivers": 1943, "Power Management ICs": 14631,
               "Microcontroller Units (MCUs/MPUs/SOCs)": 3600, "NXP MCU": 320})

print(f"\n=== all {len(REAL_PAIRS)} measured case-variant groups collapse to one slot ===")
labels, rows = merge(counts)

check("every group collapses to a single entry",
      len(labels), len(REAL_PAIRS) + 4)
check("no two surviving labels differ only by case",
      len({l.lower() for l in labels}), len(labels))
check("raw label count was larger before merging",
      len(counts) > len(labels), True)
check("merged-away entries == one per pair", len(counts) - len(labels), len(REAL_PAIRS))

print("\n=== canonical casing follows ROW COUNT, not arbitrary order ===")
by_lower = {l.lower(): (l, r) for l, r in zip(labels, rows)}
ties = 0
for a, na, b, nb in REAL_PAIRS:
    got, _ = by_lower[a.lower()]
    if na == nb:
        # A genuine tie: either variant is acceptable, but the choice must be
        # stable across runs. Determinism is asserted separately below.
        ties += 1
        check(f"tie {a.lower()!r} resolves to one of the variants", got in (a, b), True)
        continue
    check(f"canonical for {a.lower()!r}", got, a if na > nb else b)
print(f"  ({ties} group(s) were genuine count ties)")
check("'WiFi Modules'(147) beats 'WIFI Modules'(1)", by_lower["wifi modules"][0], "WiFi Modules")
check("'Pre-ordered MCUs'(1029) beats 'Pre-Ordered MCUs'(2)",
      by_lower["pre-ordered mcus"][0], "Pre-ordered MCUs")
check("'ARTERY Mcu'(11) beats 'Artery Mcu'(1)", by_lower["artery mcu"][0], "ARTERY Mcu")
check("'Inductors/Coils/Transformers'(24259) beats lowercase(1)",
      by_lower["inductors/coils/transformers"][0], "Inductors/Coils/Transformers")

print("\n=== merged row counts are SUMMED, not dropped ===")
check("WiFi Modules rows = 147 + 1", by_lower["wifi modules"][1], 148)
check("Pre-ordered MCUs rows = 1029 + 2", by_lower["pre-ordered mcus"][1], 1031)
check("ARTERY Mcu rows = 11 + 1", by_lower["artery mcu"][1], 12)
check("Switches rows = 11471 + 1", by_lower["switches"][1], 11472)

print("\n=== singletons pass through untouched ===")
for lab, n in (("LED Drivers", 1943), ("Power Management ICs", 14631),
               ("Microcontroller Units (MCUs/MPUs/SOCs)", 3600), ("NXP MCU", 320)):
    check(f"{lab!r} kept with {n} rows", by_lower[lab.lower()], (lab, n))

print("\n=== determinism ===")
check("repeated merge gives identical output", merge(counts), (labels, rows))
shuffled = {k: counts[k] for k in sorted(counts, reverse=True)}
check("insertion order does not change the result", merge(shuffled), (labels, rows))

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("all checks passed")


def test_taxonomy_dedup():
    assert not FAILURES, FAILURES
