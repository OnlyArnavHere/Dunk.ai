"""LangGraph node wrappers around existing dunkai agents.

Each node reads from ``CircuitState``, calls the underlying agent logic
without modifying it, and returns a partial state update.
"""

from __future__ import annotations

import json
import logging
import sys
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage

try:
    from .state import CircuitState
except ImportError:
    from state import CircuitState

logger = logging.getLogger(__name__)

AGENTS_ROOT = Path(__file__).resolve().parent.parent
COMPONENT_AGENT_DIR = AGENTS_ROOT / "component_agent"

if str(AGENTS_ROOT) not in sys.path:
    sys.path.insert(0, str(AGENTS_ROOT))


# ---------------------------------------------------------------------------
# Lazy imports for heavy / optional dependencies
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _component_agent_modules() -> dict[str, Any]:
    """Import component-agent modules from their package directory."""
    path = str(COMPONENT_AGENT_DIR)
    if path not in sys.path:
        sys.path.insert(0, path)

    import config as component_config
    from bom import BOMGenerator
    from parser import ArchitectureParser
    from ranking import ComponentRanker
    from retrieval import ComponentRetriever

    return {
        "config": component_config,
        "parser": ArchitectureParser(),
        "retriever": ComponentRetriever(),
        "ranker": ComponentRanker(),
        "bom_generator": BOMGenerator(),
    }


@lru_cache(maxsize=1)
def _eda_generator():
    path = str(COMPONENT_AGENT_DIR)
    if path not in sys.path:
        sys.path.insert(0, path)
    from eda import DynamicPCBIRGenerator

    return DynamicPCBIRGenerator()


@lru_cache(maxsize=1)
def _eda_dataset():
    mods = _component_agent_modules()
    return mods["config"].DATASET_DF


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _append_message(content: str) -> dict[str, Any]:
    return {"messages": [AIMessage(content=content)]}


def _error(message: str) -> dict[str, Any]:
    logger.error(message)
    return {"errors": [message], "workflow_status": "failed"}


def _requirements_from_state(state: CircuitState) -> dict[str, Any] | None:
    requirements = state.get("requirements")
    if isinstance(requirements, dict) and requirements:
        return requirements
    return None


def _architecture_from_state(state: CircuitState) -> dict[str, Any] | None:
    architecture = state.get("architecture")
    if isinstance(architecture, dict) and architecture:
        return architecture
    return None


def _bom_rows_from_state(state: CircuitState) -> list[dict[str, Any]]:
    bom = state.get("bom") or {}
    rows = bom.get("rows") or []
    return [row for row in rows if isinstance(row, dict)]


def _project_name(state: CircuitState) -> str:
    requirements = _requirements_from_state(state) or {}
    name = requirements.get("project_name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    if state.get("design_name"):
        return str(state["design_name"])
    return "dunkai_design"


# ---------------------------------------------------------------------------
# Supervisor
# ---------------------------------------------------------------------------

def supervisor_node(state: CircuitState) -> dict[str, Any]:
    """Entry node: records workflow start and passes control downstream."""
    project = _project_name(state)
    return {
        "current_node": "supervisor",
        "design_name": state.get("design_name") or project,
        "workflow_status": "running",
        **_append_message(f"Supervisor started workflow for '{project}'."),
    }


# ---------------------------------------------------------------------------
# Requirements Agent (existing requirement_agent.py)
# ---------------------------------------------------------------------------

def requirements_node(state: CircuitState) -> dict[str, Any]:
    """Parse user requirements via the existing Requirement Agent."""
    existing = _requirements_from_state(state)
    if existing:
        return {
            "current_node": "requirements",
            "interview_status": "complete",
            **_append_message("Requirements already present — skipping interview."),
        }

    user_input = (state.get("user_input") or "").strip()
    if not user_input:
        return _error("Requirements node needs user_input or pre-filled requirements.")

    from requirement_agent import run_interview

    try:
        result = run_interview(user_input, state.get("interview_history"))
    except Exception as exc:
        return _error(f"Requirement Agent failed: {exc}")

    if result.status == "question":
        question = result.question or "Please provide one more project detail."
        return {
            "current_node": "requirements",
            "interview_status": "question",
            "interview_question": question,
            "interview_options": result.options,
            "workflow_status": "awaiting_input",
            **_append_message(question),
        }

    if result.requirements is None:
        return _error("Requirement Agent returned complete status without requirements.")

    requirements = result.requirements.model_dump(mode="json", exclude_none=True)
    return {
        "current_node": "requirements",
        "requirements": requirements,
        "interview_status": "complete",
        "interview_question": None,
        "interview_options": None,
        **_append_message(
            f"Requirements captured for project '{requirements.get('project_name', 'unnamed')}'."
        ),
    }


# ---------------------------------------------------------------------------
# Architecture Agent (existing architecture_agent.py)
# ---------------------------------------------------------------------------

def architecture_node(state: CircuitState) -> dict[str, Any]:
    """Generate subsystem graph via the existing Architecture Agent."""
    requirements = _requirements_from_state(state)
    if not requirements:
        return _error("Architecture node requires structured requirements.")

    from architecture_agent import build_architecture

    try:
        architecture = build_architecture(requirements)
    except Exception as exc:
        return _error(f"Architecture Agent failed: {exc}")

    node_count = len(architecture.get("architecture_graph", {}).get("nodes", []))
    return {
        "current_node": "architecture",
        "architecture": architecture,
        **_append_message(f"Architecture graph generated with {node_count} subsystem node(s)."),
    }


# ---------------------------------------------------------------------------
# Component Agent (existing component_agent pipeline)
# ---------------------------------------------------------------------------

def component_node(state: CircuitState) -> dict[str, Any]:
    """Retrieve components and produce BOM via the existing Component Agent."""
    architecture = _architecture_from_state(state)
    if not architecture:
        return _error("Component node requires architecture output.")

    try:
        mods = _component_agent_modules()
        parser = mods["parser"]
        retriever = mods["retriever"]
        ranker = mods["ranker"]
        bom_generator = mods["bom_generator"]
        build_quantity = max(1, int(state.get("build_quantity") or mods["config"].DEFAULT_QTY))

        requests = parser.parse(architecture)
        if not requests:
            return _error("Component Agent parsed zero subsystem requests from architecture.")

        for request in requests:
            request["build_quantity"] = build_quantity

        retrieval_results = retriever.retrieve_all(requests)
        ranked_results = ranker.rank_all(retrieval_results)
        rows = bom_generator.generate(ranked_results)
        summary = bom_generator.summary(rows)

        tmp_dir = Path(tempfile.gettempdir())
        csv_path = tmp_dir / "circuitmind_bom.csv"
        bom_generator.to_csv(rows, str(csv_path))

        bom = {
            "rows": rows,
            "summary": summary,
            "ranked_results": ranked_results,
            "build_quantity": build_quantity,
        }
    except Exception as exc:
        return _error(f"Component Agent failed: {exc}")

    return {
        "current_node": "component",
        "bom": bom,
        "bom_csv_path": str(csv_path),
        **_append_message(
            f"BOM generated with {summary.get('total_line_items', len(rows))} line item(s)."
        ),
    }


# ---------------------------------------------------------------------------
# EDA Enrichment (join BOM + dataset on mfr_part)
# ---------------------------------------------------------------------------

def _parse_json_field(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return value
    return value


def _lookup_eda_record(dataset, mfr_part: str) -> dict[str, Any] | None:
    if not mfr_part:
        return None
    part = str(mfr_part).strip()
    if not part:
        return None

    if "mfr_part" not in dataset.columns:
        return None

    matches = dataset[dataset["mfr_part"].astype(str).str.strip().str.lower() == part.lower()]
    if matches.empty:
        return None
    return matches.iloc[0].to_dict()


def eda_enrichment_node(state: CircuitState) -> dict[str, Any]:
    """Join BOM rows with the EDA dataset using ``mfr_part``."""
    rows = _bom_rows_from_state(state)
    if not rows:
        return _error("EDA enrichment requires BOM rows.")

    try:
        dataset = _eda_dataset()
    except Exception as exc:
        return _error(f"EDA dataset unavailable: {exc}")

    enriched_items: list[dict[str, Any]] = []
    missing_parts: list[str] = []

    for row in rows:
        mfr_part = row.get("mfr_part")
        record = _lookup_eda_record(dataset, str(mfr_part or ""))

        item = {
            "reference": row.get("reference"),
            "subsystem": row.get("subsystem"),
            "category": row.get("category"),
            "manufacturer": row.get("manufacturer"),
            "mfr_part": mfr_part,
            "package": row.get("package"),
            "status": row.get("status"),
        }

        if record is None:
            missing_parts.append(str(row.get("reference") or mfr_part or "?"))
            item.update({"symbol": None, "footprint": row.get("package"), "pins_json": None})
            enriched_items.append(item)
            continue

        extra = _parse_json_field(record.get("extra_params")) or {}
        attributes = extra.get("attributes") if isinstance(extra, dict) else {}

        symbol = record.get("symbol")
        if symbol is None and isinstance(attributes, dict):
            symbol = attributes.get("symbol")

        footprint = record.get("footprint") or record.get("package") or row.get("package")
        if footprint is None and isinstance(attributes, dict):
            footprint = attributes.get("footprint") or attributes.get("package")

        pins_json = (
            record.get("pins_json")
            or record.get("pinout")
            or (extra.get("pins_json") if isinstance(extra, dict) else None)
            or (attributes.get("pins_json") if isinstance(attributes, dict) else None)
        )
        pins_json = _parse_json_field(pins_json)

        item.update(
            {
                "symbol": symbol,
                "footprint": footprint,
                "pins_json": pins_json,
                "description": record.get("description") or row.get("description"),
                "datasheet_url": record.get("datasheet_url") or row.get("datasheet_url"),
            }
        )
        enriched_items.append(item)

    eda_data = {
        "items": enriched_items,
        "missing_dataset_matches": missing_parts,
        "enriched_count": sum(1 for item in enriched_items if item.get("symbol") or item.get("pins_json")),
    }

    return {
        "current_node": "eda_enrichment",
        "eda_data": eda_data,
        **_append_message(
            f"EDA enrichment joined {len(enriched_items)} BOM row(s); "
            f"{len(missing_parts)} without dataset match."
        ),
    }


# ---------------------------------------------------------------------------
# PCB Agent (rule-based PCB IR using existing eda.py generator)
# ---------------------------------------------------------------------------

def _interface_pin_name(interface: str, index: int = 0) -> str:
    mapping = {
        "I2C": ("SCL", "SDA"),
        "SPI": ("SCK", "MOSI", "MISO", "CS"),
        "UART": ("TX", "RX"),
        "USB": ("D+", "D-"),
        "Power": ("VDD", "VCC", "3V3"),
        "GPIO": (f"GPIO{index + 1}",),
        "BLE": ("ANT", "TX", "RX"),
        "WiFi": ("ANT", "TX", "RX"),
        "CAN": ("CANH", "CANL"),
        "Ethernet": ("TX+", "TX-", "RX+", "RX-"),
    }
    names = mapping.get(interface, (interface.upper(),))
    return names[min(index, len(names) - 1)]


def _build_nets_from_architecture(
    architecture: dict[str, Any],
    references: list[str],
) -> list[dict[str, Any]]:
    graph = architecture.get("architecture_graph") or {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []

    ref_by_node_id: dict[str, str] = {}
    for index, node in enumerate(nodes):
        node_id = node.get("id")
        if not node_id:
            continue
        ref_by_node_id[node_id] = references[index] if index < len(references) else f"U{index + 1}"

    nets: list[dict[str, Any]] = []
    if references:
        nets.append(
            {
                "name": "GND",
                "connections": [f"{ref}.GND" for ref in references],
                "net_class": "ground",
            }
        )
        nets.append(
            {
                "name": "POWER_RAIL_3V3",
                "connections": [f"{ref}.VDD" for ref in references],
                "net_class": "power",
            }
        )

    for edge_index, edge in enumerate(edges):
        interface = edge.get("data", {}).get("interface") or "signal"
        source = ref_by_node_id.get(edge.get("source"))
        target = ref_by_node_id.get(edge.get("target"))
        if not source or not target:
            continue

        pin_a = _interface_pin_name(interface, 0)
        pin_b = _interface_pin_name(interface, 1 if interface in {"I2C", "UART", "SPI"} else 0)
        net_name = f"{interface}_{edge_index + 1}".upper()
        nets.append(
            {
                "name": net_name,
                "connections": [f"{source}.{pin_a}", f"{target}.{pin_b}"],
                "net_class": "power" if interface == "Power" else "signal",
            }
        )

    return nets


def pcb_node(state: CircuitState) -> dict[str, Any]:
    """Generate PCB IR from BOM + architecture connectivity."""
    rows = _bom_rows_from_state(state)
    csv_path = state.get("bom_csv_path")
    architecture = _architecture_from_state(state) or {}

    if not rows:
        return _error("PCB node requires BOM rows.")
    if not csv_path:
        return _error("PCB node requires bom_csv_path from the Component Agent.")

    references = [str(row.get("reference")) for row in rows if row.get("reference")]
    net_connections = _build_nets_from_architecture(architecture, references)

    try:
        generator = _eda_generator()
        pcb_ir = generator.build_pcb_ir(
            design_name=_project_name(state),
            bom_csv_path=csv_path,
            net_connections=net_connections,
        )
    except Exception as exc:
        return _error(f"PCB Agent failed: {exc}")

    return {
        "current_node": "pcb",
        "pcb_ir": pcb_ir,
        **_append_message(
            f"PCB IR generated with {len(pcb_ir.get('components', []))} component(s) "
            f"and {len(pcb_ir.get('nets', []))} net(s)."
        ),
    }


# ---------------------------------------------------------------------------
# Validation Agent (rule-based checks)
# ---------------------------------------------------------------------------

def validation_node(state: CircuitState) -> dict[str, Any]:
    """Validate symbols, footprints, pins, and connectivity."""
    eda_items = (state.get("eda_data") or {}).get("items") or []
    pcb_ir = state.get("pcb_ir") or {}
    bom_summary = (state.get("bom") or {}).get("summary") or {}

    issues: list[dict[str, str]] = []

    # MISSING_SYMBOL / MISSING_FOOTPRINT / MISSING_PINS are ERRORS, not warnings.
    #
    # `passed` below is computed as "no issue has severity == error", so while
    # these three were warnings a design could report validation.passed = True
    # with no symbol, no footprint and no pinout for a SINGLE component -- let
    # alone all of them. That is not a hypothetical: the first real end-to-end
    # capture (2026-08-20, 11 components) reported passed = True carrying 11x
    # MISSING_SYMBOL and 11x MISSING_PINS, i.e. every component in the design.
    # The downstream PCB module independently rated the same design
    # compilable = false with 22 errors.
    #
    # These three share one shape: each fires on essentially every component on
    # every run, because the backing dataset has no pinout data at all (0 of
    # 490,894 rows carry pins_json/pinout/symbol). Flipping only one of them
    # would leave passed = True reachable through the other two, so all three
    # move together.
    #
    # A design missing symbols, footprints or pin mappings cannot be
    # manufactured. Reporting it as passed is self-certification, not
    # validation.
    for item in eda_items:
        ref = str(item.get("reference") or "?")
        if not item.get("symbol"):
            issues.append(
                {
                    "severity": "error",
                    "code": "MISSING_SYMBOL",
                    "message": f"{ref}: no KiCad/EasyEDA symbol found in EDA dataset.",
                }
            )
        if not item.get("footprint"):
            issues.append(
                {
                    "severity": "error",
                    "code": "MISSING_FOOTPRINT",
                    "message": f"{ref}: no PCB footprint resolved.",
                }
            )
        if not item.get("pins_json"):
            issues.append(
                {
                    "severity": "error",
                    "code": "MISSING_PINS",
                    "message": f"{ref}: pinout (pins_json) unavailable.",
                }
            )

    for ref in bom_summary.get("unfilled_references") or []:
        issues.append(
            {
                "severity": "error",
                "code": "UNFILLED_BOM",
                "message": f"{ref}: no component selected in BOM.",
            }
        )

    components = pcb_ir.get("components") or []
    nets = pcb_ir.get("nets") or []
    declared_refs = {c.get("ref_id") for c in components}

    for net in nets:
        for conn in net.get("connections") or []:
            ref_id = str(conn).split(".")[0]
            if ref_id and ref_id not in declared_refs:
                issues.append(
                    {
                        "severity": "error",
                        "code": "ORPHAN_NET_CONNECTION",
                        "message": f"Net '{net.get('name')}' references unknown ref '{ref_id}'.",
                    }
                )

    passed = not any(issue["severity"] == "error" for issue in issues)
    validation = {
        "passed": passed,
        "issue_count": len(issues),
        "issues": issues,
        "checks_run": [
            "symbol_availability",
            "footprint_availability",
            "pinout_availability",
            "bom_completeness",
            "net_connectivity",
        ],
    }

    status = "passed" if passed else "failed"
    return {
        "current_node": "validation",
        "validation": validation,
        "workflow_status": "completed" if passed else "completed_with_warnings",
        **_append_message(f"Validation {status} with {len(issues)} issue(s)."),
    }


# ---------------------------------------------------------------------------
# Documentation Agent (rule-based reports from pipeline state)
# ---------------------------------------------------------------------------

def documentation_node(state: CircuitState) -> dict[str, Any]:
    """Generate BOM report, design summary, and engineering documentation."""
    requirements = _requirements_from_state(state) or {}
    architecture = _architecture_from_state(state) or {}
    bom = state.get("bom") or {}
    validation = state.get("validation") or {}
    pcb_ir = state.get("pcb_ir") or {}

    summary = bom.get("summary") or {}
    rows = bom.get("rows") or []
    arch_model = architecture.get("architecture_model") or {}
    graph = architecture.get("architecture_graph") or {}

    bom_lines = ["| Reference | Part | Package | Status |", "|---|---|---|---|"]
    for row in rows:
        bom_lines.append(
            f"| {row.get('reference', '?')} | {row.get('manufacturer', '?')} "
            f"{row.get('mfr_part', '?')} | {row.get('package', '?')} | {row.get('status', '?')} |"
        )

    design_summary = "\n".join(
        [
            f"# Design Summary: {_project_name(state)}",
            "",
            f"**Objective:** {requirements.get('objective') or 'Not specified'}",
            f"**Category:** {requirements.get('category') or 'Not specified'}",
            f"**Processing unit:** {arch_model.get('processing_unit') or 'TBD'}",
            f"**Interfaces:** {', '.join(arch_model.get('interfaces') or []) or 'none'}",
            f"**Subsystems:** {len(graph.get('nodes') or [])}",
            f"**BOM line items:** {summary.get('total_line_items', len(rows))}",
            f"**Estimated cost (USD):** ${float(summary.get('total_cost_usd') or 0):.2f}",
            f"**Validation:** {'passed' if validation.get('passed') else 'needs review'}",
        ]
    )

    engineering_docs = "\n".join(
        [
            f"# Engineering Documentation: {_project_name(state)}",
            "",
            "## Architecture assumptions",
            "\n".join(f"- {item}" for item in architecture.get("assumptions") or []) or "- none",
            "",
            "## Architecture warnings",
            "\n".join(f"- {item}" for item in architecture.get("warnings") or []) or "- none",
            "",
            "## PCB IR",
            f"- Components: {len(pcb_ir.get('components') or [])}",
            f"- Nets: {len(pcb_ir.get('nets') or [])}",
            f"- Layers: {(pcb_ir.get('constraints') or {}).get('layer_count', 'TBD')}",
            "",
            "## Validation issues",
            "\n".join(
                f"- [{issue.get('severity')}] {issue.get('message')}"
                for issue in validation.get("issues") or []
            )
            or "- none",
        ]
    )

    documentation = {
        "bom_report": "\n".join(bom_lines),
        "design_summary": design_summary,
        "engineering_docs": engineering_docs,
    }

    return {
        "current_node": "documentation",
        "documentation": documentation,
        "workflow_status": state.get("workflow_status") or "completed",
        **_append_message("Documentation package generated."),
    }
