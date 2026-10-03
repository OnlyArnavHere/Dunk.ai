"""Tests for catalogue-aware selection in ComponentRanker.rank_all.

    python ai_engine/agents/component_agent/test_catalogue_selection.py

No network: catalogue.verdict is replaced with a scripted answer per part, and
Ranker.rank with a pass-through, so only the selection walk is under test.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import catalogue  # noqa: E402
import ranking  # noqa: E402

failures = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global failures
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  -- ' + detail if detail else ''}")
    if not ok:
        failures += 1


def cand(part: str, number: str | None = None) -> dict:
    return {"mfr_part": part, "extra_params": ({"number": number} if number else {})}


def run(results, answers):
    """rank_all over pre-ranked results, with scripted catalogue verdicts."""
    seen = []

    def fake_verdict(part, lcsc=None):
        seen.append(part)
        answer = answers.get(part, "unknown")
        if answer == "unknown":
            return None, None
        if answer is False:
            return False, None
        return True, {"lcsc": answer, "mfr": part, "package": "X", "stock": 10}

    catalogue.verdict = fake_verdict
    ranker = ranking.ComponentRanker.__new__(ranking.ComponentRanker)
    ranker.rank = lambda r: {"ranked_candidates": r["candidates"], "best_candidate": r["candidates"][0]}
    return ranker.rank_all(results), seen


# ---- a part not in the catalogue is skipped for the next one that is -----------
out, _ = run(
    [{"candidates": [cand("HDC2010YPAR"), cand("SHT40-AD1B-R2"), cand("HDC1080DMBR")]}],
    {"HDC2010YPAR": False, "SHT40-AD1B-R2": "C2758152"},
)
check("absent part skipped for an orderable one", out[0]["best_candidate"]["mfr_part"] == "SHT40-AD1B-R2")
check("skip is recorded", out[0].get("catalogue_skipped") == ["HDC2010YPAR"])
check("catalogue number recorded for the board stage",
      out[0]["best_candidate"]["extra_params"].get("number") == "2758152")

# ---- unknown (offline) is never treated as absent -------------------------------
out, _ = run([{"candidates": [cand("MCU-A"), cand("MCU-B")]}], {})
check("unknown verdict keeps the top pick", out[0]["best_candidate"]["mfr_part"] == "MCU-A")

# ---- all absent: keep the old top pick rather than nothing -----------------------
out, _ = run([{"candidates": [cand("X1"), cand("X2")]}], {"X1": False, "X2": False})
check("all absent -> top pick kept", out[0]["best_candidate"]["mfr_part"] == "X1")
check("all absent -> skips recorded", out[0].get("catalogue_skipped") == ["X1", "X2"])

# ---- an existing catalogue number is not overwritten ------------------------------
out, _ = run([{"candidates": [cand("HDC1080DMBR", "82227")]}], {"HDC1080DMBR": "C99999"})
check("existing number kept", out[0]["best_candidate"]["extra_params"]["number"] == "82227")

# ---- the duplicate rule still applies before the catalogue walk ---------------------
out, seen = run(
    [{"candidates": [cand("SAME")]}, {"candidates": [cand("SAME"), cand("OTHER")]}],
    {"SAME": "C1", "OTHER": "C2"},
)
check("second subsystem does not reuse a part", out[1]["best_candidate"]["mfr_part"] == "OTHER")

print(f"\n{failures} FAILED" if failures else "\nall checks passed")
sys.exit(1 if failures else 0)
