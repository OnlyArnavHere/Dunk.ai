"""Shared LangGraph state for the dunkai circuit design pipeline."""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages


def _merge_errors(existing: list[str] | None, new: list[str] | None) -> list[str]:
    merged = list(existing or [])
    for item in new or []:
        if item and item not in merged:
            merged.append(item)
    return merged


class CircuitState(TypedDict, total=False):
    """Single shared state object read and updated by every pipeline node."""

    requirements: dict[str, Any]
    architecture: dict[str, Any]
    bom: dict[str, Any]
    eda_data: dict[str, Any]
    pcb_ir: dict[str, Any]
    # Schema 1.0 only: "does this look buildable?" -- carries `passed`.
    validation: dict[str, Any]
    # Schema 2.0: "is this a well-formed handoff?" -- carries `well_formed`, never
    # `passed` or `compilable`. Deliberately a DIFFERENT key from `validation` so
    # that reading `.validation.passed` off a v2 payload yields None and fails
    # loudly, rather than silently returning a value that means something else.
    # Buildability is decided downstream by the PCB module, and only there.
    handoff_validation: dict[str, Any]
    documentation: dict[str, Any]
    code_generation: dict[str, Any]
    # Generated board artifacts (dunkai-designer output): URLs, sizes and build
    # stats. Deliberately NOT merged into `pcb_ir` — pcb_ir is dunkai's handoff,
    # and a consumer must be able to tell "what we asked for" from "what was
    # actually built", including when the build succeeded with DRC errors.
    board: dict[str, Any]
    messages: Annotated[list[Any], add_messages]
    errors: Annotated[list[str], _merge_errors]

    # Workflow control (optional; populated by the HTTP supervisor layer)
    user_input: str
    interview_history: list[Any]
    interview_status: str
    interview_question: str | None
    interview_options: list[str] | None
    interview_selection_mode: str
    build_quantity: int
    # Which dunkai-designer provider generates the board, chosen per request in
    # the UI. Kept in state rather than passed as an argument so the streaming
    # (stream_board) and non-streaming (board_node) paths read it the same way.
    # Unset means "fall back to DESIGNER_PROVIDER, then claude-code".
    designer_provider: str
    designer_model: str
    llm_model: str
    bom_csv_path: str
    design_name: str
    current_node: str
    workflow_status: str
