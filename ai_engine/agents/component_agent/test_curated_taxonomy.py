"""Tests for the curated request-category -> catalogue-label table.

Weighted toward the things that must not regress silently: that the three
curated categories resolve from the table, that the other nine still take the
embedding path and are TAGGED as low confidence rather than passing as trusted,
that deliberate exclusions stay excluded, and that a stale table is REPORTED
rather than quietly producing a wrong shortlist.

Run:  ai_engine/.venv/bin/python agents/component_agent/test_curated_taxonomy.py
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


ALLOWED = ["Processing", "Power", "Communication", "Input", "Output", "Sensor",
           "Storage", "Security", "Memory", "Clock", "Expansion", "Network"]
CURATED_CATS = {"Processing", "Storage", "Security"}

print("\n=== exactly three categories are curated; the rest take the embedding path ===")
for cat in ALLOWED:
    labels, source = ct.resolve(cat)
    want = ct.RESOLUTION_CURATED if cat in CURATED_CATS else ct.RESOLUTION_EMBEDDING
    check(f"{cat} -> {want}", source, want)
    if cat in CURATED_CATS:
        check(f"{cat} returns labels", bool(labels), True)
    else:
        check(f"{cat} returns no curated labels", labels, None)

check("case-insensitive lookup", ct.resolve("PROCESSING")[1], ct.RESOLUTION_CURATED)
check("whitespace tolerated", ct.resolve("  storage  ")[1], ct.RESOLUTION_CURATED)
check("unknown category falls through", ct.resolve("Nonsense")[1], ct.RESOLUTION_EMBEDDING)
check("empty category falls through", ct.resolve("")[1], ct.RESOLUTION_EMBEDDING)
check("None category does not raise", ct.resolve(None)[1], ct.RESOLUTION_EMBEDDING)

print("\n=== the dominant labels that motivated this are actually present ===")
proc = ct.curated_labels("Processing")
for lab in ("Microcontroller Units (MCUs/MPUs/SOCs)", "Microcontrollers (MCU/MPU/SOC)",
            "Single Chip Microcomputer/Microcontroller"):
    check(f"Processing includes {lab[:34]}", lab in proc, True)
store = ct.curated_labels("Storage")
for lab in ("Memory", "EEPROM", "NOR FLASH", "NAND FLASH"):
    check(f"Storage includes {lab}", lab in store, True)
check("Security is the single real label",
      ct.curated_labels("Security"), ["Security Verification / Encryption ICs"])

print("\n=== deliberate exclusions must STAY excluded ===")
for lab in ("Programmable Logic Device (CPLDs/FPGAs)", "CPLD/FPGA",
            "Microprocessor & Microcontroller Supervisors"):
    check(f"Processing excludes {lab[:34]}", lab in proc, False)
    check(f"  ...and records why", lab in ct.CURATED["processing"]["excluded"], True)
for lab in ("SD Card / Memory Card Connector", "Memory Connector (DDR)"):
    check(f"Storage excludes {lab[:30]}", lab in store, False)
    check(f"  ...and records why", lab in ct.CURATED["storage"]["excluded"], True)
for lab in ("Safety Capacitors", "ESD Protection Devices", "Circuit Protection"):
    check(f"Security excludes {lab}", lab in ct.curated_labels("Security"), False)

print("\n=== contaminated labels found by a REAL RUN must stay excluded ===")
# 'Pre-ordered MCUs' is a stock-state bucket: all five of its entries in a live
# MCU shortlist were non-MCUs (a 3A LDO, a MOSFET, a power monitor, a power
# switch, a temperature sensor) and they took the top THREE scoring slots,
# handing the MCU role a voltage regulator. 'Embedded Processors & Controllers'
# is the CATEGORY those same parts carry, and _filter_candidates matches
# category OR subcategory -- so pruning only the subcategory re-admits them all.
for lab in ("Pre-ordered MCUs", "Embedded Processors & Controllers"):
    check(f"Processing excludes {lab}", lab in proc, False)
    check(f"  ...with the evidence recorded",
          bool(ct.CURATED["processing"]["excluded"].get(lab)), True)
check("no ordering-state bucket survives in Processing",
      [l for l in proc if "pre-order" in l.lower()], [])
# The real MCUs those parts displaced must still be reachable by subcategory.
for lab in ("Microcontrollers (MCU/MPU/SOC)", "Microcontroller Units (MCUs/MPUs/SOCs)"):
    check(f"real MCUs still reachable via {lab[:30]}", lab in proc, True)

print("\n=== staleness is REPORTED, never silent ===")
healthy = {k: v for e in ct.CURATED.values() for k, v in e["labels"].items()}
check("a healthy catalogue produces no findings", ct.verify(healthy), [])

gone = dict(healthy)
for lab in list(ct.CURATED["processing"]["labels"]):
    gone.pop(lab)
kinds = [f["kind"] for f in ct.verify(gone)]
sev = [f["severity"] for f in ct.verify(gone) if f["category"] == "processing"]
check("a vanished category is an ERROR", "category_vanished" in kinds, True)
check("  ...at error severity", sev, ["error"])

partial = dict(healthy)
partial.pop("NOR FLASH")
partial.pop("NAND FLASH")
f = [x for x in ct.verify(partial) if x["category"] == "storage"]
check("missing labels are reported", [x["kind"] for x in f], ["labels_missing"])
check("  ...at warning severity, not error", f[0]["severity"], "warning")
check("  ...and name the missing labels", "NOR FLASH" in f[0]["message"], True)

drift = dict(healthy)
drift["Microcontroller Units (MCUs/MPUs/SOCs)"] = 100   # 3600 -> 100
f = [x for x in ct.verify(drift) if x["kind"] == "row_counts_drifted"]
check("a collapsed row count is reported", len(f), 1)
check("  ...showing expected -> actual", "3600->100" in f[0]["message"], True)

small = dict(healthy)
small["Microcontroller Units (MCUs/MPUs/SOCs)"] = 3500   # within tolerance
check("ordinary restocking drift is NOT reported",
      [x for x in ct.verify(small) if x["kind"] == "row_counts_drifted"], [])

# Case-variant labels must still verify: the index is deduped and canonical
# casing is chosen by row count, so lookup has to be case-insensitive.
recased = {k.upper(): v for k, v in healthy.items()}
check("verification is case-insensitive (index dedup picks canonical casing)",
      ct.verify(recased), [])

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILED: {FAILURES}")
    sys.exit(1)
print("all checks passed")


def test_curated_taxonomy():
    assert not FAILURES, FAILURES
