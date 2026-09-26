"""Curated request-category -> catalogue-label table.

WHY THIS EXISTS
---------------
`_filter_candidates` first tries a LITERAL substring match of the request's
category against the candidate's `category` field. Measured across the real
catalogue, that path is structurally impossible for SEVEN of the twelve
`ALLOWED_CATEGORIES` -- there are zero rows whose category contains the word:

    Processing 0 | Input 0 | Output 0 | Storage 0
    Security   0 | Expansion 0 | Network 0
    (vs Power 34113, Sensor 5522, Communication 3657, Memory 2381, Clock 1242)

Those seven fall through to `_resolve_category`, which ranks labels on cosine
similarity alone and is documented in Phase 11e as unreliable: for a Processing
request it returned vendor-specific labels covering 608 of 6069 MCU rows (10%)
while the dominant generic labels -- 86% -- were cut, leaving the MCU role a
shortlist of ONE.

Six of the seven have not collapsed yet only because their candidates happen to
carry a label that landed in an arbitrary top-5. Two demonstrably survive on
luck: Storage's top candidates carry `NOR FLASH`, which the resolver does NOT
return (they match on their `Memory` category instead), and Security's request
pulled in 15,459 rows of capacitors and ESD parts around a 48-row answer.

WHY ONLY THREE CATEGORIES
-------------------------
Only Processing, Storage and Security are cleanly curatable from the catalogue.
The other four are role buckets or keyword-collision traps where a row-count
sort does not yield a correct list, and guessing them would repeat the
over-fitting that closed five mechanisms in 11e:

  Output    68 labels / 18208 rows -- "Light Emitting Diodes (LED)" 3843 and
            "LED Drivers" 1943 are different components; "Motor Driver ICs" 1402
            and "Buzzers" 646 are unrelated to either.
  Input     55 labels / 36048 rows -- "Switching Diode" 960, "Analog Switches /
            Multiplexers" 1427 and "RF Switches" 224 are keyword collisions.
  Network   26 labels / 4943 rows -- the LARGEST match is "Resistor Networks &
            Arrays" 1613, a false friend; the real ones are far smaller.
  Expansion  6 labels / 10054 rows -- "Pin Headers" 5744 and "I/O Expanders" 274
            are different things, and which is meant is ambiguous today.

Those four keep using the embedding path and are tagged `embedding` /
low-confidence so the weaker resolution is visible rather than assumed good.

STALENESS
---------
The catalogue vocabulary is OPERATIONALLY maintained, not a stable electrical
taxonomy: 46 case-variant duplicate groups, ordering-state labels
("Pre-ordered MCUs" 1031, "Pre-ordered Connectors" 2081), and junk buckets
("UNKNOWN" 185244, "Global Sourcing Parts" 7315, "Old Batch" 80). The dataset is
a third-party HF snapshot re-fetched EVERY RUN, with no version pin and no
schema contract, so a regenerated scrape can rename or re-bucket labels between
runs. "Pre-ordered MCUs" alone is 7% of Processing coverage and exists purely
because of stock state.

Every entry therefore records the row count observed at curation time, and
`verify()` checks it at index build. A curated label that has VANISHED or
COLLAPSED is reported, not silently dropped.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

# Row counts measured 2026-08-29 against rayyanshk/dunkai (490,894 rows), taken
# from the DEDUPED index, so case-variant pairs are already merged.
CURATED: Dict[str, Dict[str, object]] = {
    "processing": {
        "labels": {
            "Microcontroller Units (MCUs/MPUs/SOCs)": 3600,
            "Single Chip Microcomputer/Microcontroller": 3187,
            "Microcontrollers (MCU/MPU/SOC)": 617,
            "NXP MCU": 320,
            "TI MCU": 188,
            "Digital Signal Processors / Controllers (DSPs/DSCs)": 167,
            "Other Processors and Microcontrollers (MCUs)": 88,
            "Digital Signal Processors (DSP/DSC)": 33,
            "ARTERY Mcu": 12,
        },
        # Deliberate exclusions, with the reason. These MATCH a keyword scan for
        # the concept but are not the component the request means.
        "excluded": {
            "Programmable Logic Device (CPLDs/FPGAs)": "FPGAs/CPLDs are not microcontrollers",
            "CPLD/FPGA": "FPGAs/CPLDs are not microcontrollers",
            "Microprocessor & Microcontroller Supervisors": "supervisor/reset ICs, not processors",
            # Both removed after a REAL RUN admitted non-MCUs through them, not
            # on principle. This is the ordering-state hazard the module docstring
            # warns about, caught in practice:
            #
            #   'Pre-ordered MCUs' is a STOCK-STATE bucket with no electrical
            #   meaning. All five of its entries in a live MCU shortlist were
            #   wrong -- MIC29302WU (3A LDO), DN3545N8-G (N-channel MOSFET),
            #   MCP39F511-E/MQ (power monitor), MIC2039EYMT-TR (power switch),
            #   AT30TS74-XM8M-T (temperature sensor) -- and they took the top
            #   THREE scoring slots, handing the MCU role a voltage regulator.
            #
            #   'Embedded Processors & Controllers' is the CATEGORY those same
            #   parts carry. Since _filter_candidates matches category OR
            #   subcategory, keeping it would re-admit them however the
            #   subcategory list is pruned. Genuine MCUs filed under it also
            #   carry a precise subcategory ('Microcontrollers (MCU/MPU/SOC)',
            #   'Microcontroller Units (MCUs/MPUs/SOCs)'), so they survive on
            #   that instead and nothing real is lost.
            "Pre-ordered MCUs": "stock-state bucket; 5/5 sampled entries were not MCUs",
            "Embedded Processors & Controllers": (
                "broad category carrying the mislabelled parts; real MCUs match "
                "on their precise subcategory instead"
            ),
        },
    },
    "storage": {
        "labels": {
            "Memory": 2381,
            "EEPROM": 1218,
            "NOR FLASH": 575,
            "NAND FLASH": 134,
            "SRAM": 132,
            "FRAM": 56,
            "Non-Volatile Memory (ROM)": 22,
            "Memory Controllers": 3,
            "Random Access Memory (RAM)": 2,
            "IButton Memory": 2,
            "FLASH": 2,
            "Memory - Serial MCP (Multi Chip Package)": 1,
        },
        "excluded": {
            "SD Card / Memory Card Connector": "connector, not a memory device",
            "Memory Connector (DDR)": "connector, not a memory device",
        },
    },
    "security": {
        # The entire security vocabulary in this catalogue is one label. The
        # embedding path surrounded it with 15,459 rows of capacitors and ESD
        # parts, which is exactly the failure this entry removes.
        "labels": {
            "Security Verification / Encryption ICs": 48,
        },
        "excluded": {
            "Safety Capacitors": "passive capacitors, not security ICs",
            "ESD Protection Devices": "circuit protection, not security ICs",
            "Circuit Protection": "circuit protection, not security ICs",
            "Leakage Protection ICs": "power protection, not security ICs",
        },
    },
}

# A curated label is flagged when it disappears, or when its row count moves far
# enough to suggest the vocabulary was re-bucketed rather than merely restocked.
DRIFT_TOLERANCE = 0.5

RESOLUTION_CURATED = "curated"
RESOLUTION_EMBEDDING = "embedding"


def is_curated(category: str) -> bool:
    return str(category or "").strip().lower() in CURATED


def curated_labels(category: str) -> Optional[List[str]]:
    """Curated labels for a request category, or None when not curated."""
    entry = CURATED.get(str(category or "").strip().lower())
    if not entry:
        return None
    return list(entry["labels"].keys())


def verify(index_counts: Dict[str, int]) -> List[dict]:
    """Check every curated label against the CURRENT index.

    Returns structured findings rather than raising: a stale table must be
    visible, but must not stop a design run. Each finding carries `severity`
    so callers can distinguish "one label shrank" from "this category is gone".
    """
    findings: List[dict] = []
    lowered = {str(k).strip().lower(): int(v) for k, v in index_counts.items()}
    for category, entry in CURATED.items():
        labels: Dict[str, int] = entry["labels"]  # type: ignore[assignment]
        missing, drifted, present = [], [], 0
        for label, expected in labels.items():
            actual = lowered.get(label.strip().lower())
            if actual is None:
                missing.append(label)
                continue
            present += 1
            if expected > 0 and abs(actual - expected) / expected > DRIFT_TOLERANCE:
                drifted.append((label, expected, actual))
        if present == 0:
            findings.append({
                "severity": "error", "category": category, "kind": "category_vanished",
                "message": (
                    f"curated category '{category}': NONE of its {len(labels)} labels "
                    f"exist in the catalogue any more. The curated table is stale and "
                    f"this category is falling back to embedding resolution."
                ),
            })
            continue
        if missing:
            findings.append({
                "severity": "warning", "category": category, "kind": "labels_missing",
                "message": (
                    f"curated category '{category}': {len(missing)} of {len(labels)} "
                    f"labels no longer exist ({', '.join(missing[:4])}). Coverage is "
                    f"reduced; re-curate against the current catalogue."
                ),
            })
        if drifted:
            detail = ", ".join(f"{l} {e}->{a}" for l, e, a in drifted[:4])
            findings.append({
                "severity": "warning", "category": category, "kind": "row_counts_drifted",
                "message": (
                    f"curated category '{category}': row counts moved by more than "
                    f"{int(DRIFT_TOLERANCE * 100)}% ({detail}). The vocabulary may have "
                    f"been re-bucketed."
                ),
            })
    return findings


def resolve(category: str) -> Tuple[Optional[List[str]], str]:
    """(labels, source). Curated when covered, else (None, 'embedding')."""
    labels = curated_labels(category)
    if labels:
        return labels, RESOLUTION_CURATED
    return None, RESOLUTION_EMBEDDING
