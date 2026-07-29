"""dunkai Requirement Analysis Agent.

Pure LangChain + Groq module that turns a hardware project idea into a
validated ``HardwareRequirements`` object through a short (5-7 turn)
structured-output QA interview.

Design notes (kept deliberately strict to avoid wasting LLM calls):

* **No import-time side effects.** The Groq client and both LangChain
  chains are built lazily via ``@lru_cache``-backed factories. Importing
  this module (e.g. for its schema, or from a test) never opens a
  network client, and never raises just because ``GROQ_API_KEY`` isn't
  set yet -- that check only fires the first time a chain is actually
  used.
* **Singletons, not rebuilds.** The client/chains are constructed once
  per process and reused on every turn, instead of re-instantiating a
  ``ChatGroq`` client (and re-parsing the prompt templates) on every
  single call.
* **One LLM call per turn, by default.** ``run_interview`` makes exactly
  one structured-output call to the interview chain. It only makes a
  second call -- to backfill multiple-choice options -- when the model's
  own response was a question *and* it didn't already supply options.
  When the model already gave options (the common case, since the system
  prompt asks for them), there is no second call.
* **Bounded, capped history.** Conversation history sent to the model is
  trimmed to a fixed window (``HISTORY_WINDOW`` messages) so token cost
  per call doesn't grow unbounded over a long interview.
* **No UI or evaluation code lives here.** This module is pure agent
  logic so it can be imported by a Gradio app, an evaluation harness, or
  another agent without pulling in unrelated dependencies or launching a
  UI as a side effect.
"""

from __future__ import annotations

import ast
import json
import os
from functools import lru_cache
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_groq import ChatGroq
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

__all__ = [
    "HardwareRequirements",
    "InterviewResponse",
    "QuestionOptions",
    "run_interview",
    "respond",
    "to_langchain_history",
]

# ---------------------------------------------------------------------------
# Configuration (env-overridable; nothing here touches the network)
# ---------------------------------------------------------------------------

MODEL_NAME = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
TEMPERATURE = float(os.getenv("REQUIREMENT_AGENT_TEMPERATURE", "0.2"))
MIN_INTERVIEW_TURNS = int(os.getenv("REQUIREMENT_AGENT_MIN_TURNS", "0"))
MAX_INTERVIEW_TURNS = int(os.getenv("REQUIREMENT_AGENT_MAX_TURNS", "3"))
# How many recent chat messages to send back to the model each turn. Keeps
# per-call token cost (and therefore $ and latency) bounded on long interviews.
HISTORY_WINDOW = int(os.getenv("REQUIREMENT_AGENT_HISTORY_WINDOW", "14"))


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class HardwareRequirements(BaseModel):
    """Architecture-oriented requirements for the user's hardware project."""

    model_config = ConfigDict(extra="forbid")

    project_name: str | None = Field(default=None, description="Name of the user's hardware project")
    category: str | None = None
    objective: str | None = None
    # The unions keep Groq's tool schema tolerant of scalar/dict variants.
    # Validators below normalize them into the clean list/string output.
    target_users: list[str] | str | dict[str, Any] | None = None
    functional_requirements: list[str] | str | dict[str, Any] | None = None
    hardware_inputs: list[str] | str | dict[str, Any] | None = None
    hardware_outputs: list[str] | str | dict[str, Any] | None = None
    connectivity: list[str] | str | dict[str, Any] | None = None
    supported_platforms: list[str] | str | dict[str, Any] | None = None
    power_requirements: str | list[str] | dict[str, Any] | None = None
    physical_constraints: list[str] | str | dict[str, Any] | None = None
    performance_requirements: list[str] | str | dict[str, Any] | None = None
    safety_compliance: list[str] | str | dict[str, Any] | None = None
    budget: str | int | float | None = None

    @field_validator("project_name", "category", "objective", "power_requirements", "budget", mode="before")
    @classmethod
    def normalize_scalar(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            if text.lower() in {"", "null", "none", "unknown"}:
                return None
            if text.startswith("[") and text.endswith("]"):
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    try:
                        parsed = ast.literal_eval(text)
                    except (ValueError, SyntaxError):
                        parsed = text
                if isinstance(parsed, list):
                    return str(parsed[0]) if parsed and parsed[0] is not None else None
        return str(value)

    @field_validator(
        "target_users", "functional_requirements", "hardware_inputs",
        "hardware_outputs", "connectivity", "supported_platforms",
        "physical_constraints",
        "performance_requirements", "safety_compliance", mode="before"
    )
    @classmethod
    def normalize_list(cls, value):
        if value is None:
            return None
        if isinstance(value, dict):
            value = [f"{key}: {item}" for key, item in value.items() if item is not None]
        elif isinstance(value, str):
            text = value.strip()
            if text.lower() in {"", "null", "none", "unknown", "[]"}:
                return None
            if text.startswith("[") and text.endswith("]"):
                try:
                    value = json.loads(text)
                except json.JSONDecodeError:
                    try:
                        value = ast.literal_eval(text)
                    except (ValueError, SyntaxError):
                        value = [text]
            else:
                value = [text]
        values = [str(item).strip() for item in value if item is not None and str(item).strip()]
        return values or None


class InterviewResponse(BaseModel):
    """One question or the final validated requirements object."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["question", "complete"]
    question: str | None = None
    options: list[str] | None = None
    requirements: HardwareRequirements | None = None

    @model_validator(mode="before")
    @classmethod
    def infer_status(cls, data: dict) -> dict:
        if "status" not in data:
            data["status"] = "complete" if data.get("requirements") else "question"
        return data


class QuestionOptions(BaseModel):
    options: list[str] = Field(min_length=2, max_length=4)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT_TEMPLATE = """
For every question, provide 2-4 concise options whenever reasonable, especially for power, budget, connectivity, platform, and performance. Use null options only for genuinely open-ended questions.

You are dunkai's Requirement Analysis Agent. dunkai is the software product, not the user's hardware project.

Architecture-first completion rule: conduct at least {min_turns} and at most {max_turns} useful interview turns before status complete. Use high-yield grouped questions instead of one question per schema field. Cover: (1) user workflow and main functions, (2) physical inputs and sensing, (3) physical outputs and interaction, (4) connectivity, processing location, and host platforms, and (5) power, battery life, physical constraints, performance, and safety. Combine related topics into one concise project-specific question. Do not invent exact components or specifications.

Conduct a {min_turns}-{max_turns} turn, project-specific requirements interview. Ask exactly one concise grouped follow-up question per turn. A grouped question may ask several closely related details that together affect architecture. Do not repeat questions or ask narrow low-value questions. Treat the entire conversation as cumulative state: preserve every fact from earlier user answers, merge the latest answer into the existing requirements, and never replace known values with null. Map answers explicitly into the appropriate fields, especially hardware_inputs, hardware_outputs, functional_requirements, connectivity, and power_requirements. Only return complete after the minimum {min_turns} interview turns, unless the conversation already contains {min_turns} clear user answers. When a question has common discrete answers, provide 2-4 concise options; otherwise set options to null. The user may always provide a custom answer.

Ask only about information that can affect architecture, hardware inputs/outputs, connectivity, supported platforms, power, physical constraints, performance, safety, or budget. Do not ask generic questions when a project-specific question is possible. Do not repeat answered questions. If the latest answer is vague or does not answer the previous question, clarify it instead of changing the project.

Never hallucinate. Do not change the project domain. Unknown values must be null. Do not recommend components, design circuits, or generate firmware. Ask at least {min_turns} and no more than {max_turns} questions total.

Return only the structured response represented by the Pydantic schema. For complete responses, set question and options to null.
"""

SYSTEM_PROMPT = _SYSTEM_PROMPT_TEMPLATE.format(min_turns=MIN_INTERVIEW_TURNS, max_turns=MAX_INTERVIEW_TURNS)

_OPTION_SYSTEM_PROMPT = (
    "Generate 2 to 4 useful answer choices for the question. Choices must be "
    "specific to the hardware project and question. Do not answer the "
    "question. Return only the options field."
)


# ---------------------------------------------------------------------------
# Lazy, cached client/chain construction
#
# Nothing below runs at import time. Each factory is memoized so the Groq
# client and prompt/chain objects are built exactly once per process and
# reused on every subsequent call, no matter how many times run_interview()
# is invoked.
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _get_llm() -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError("Set GROQ_API_KEY before running the Requirement Agent.")
    return ChatGroq(model=MODEL_NAME, groq_api_key=api_key, temperature=TEMPERATURE, max_retries=2)


@lru_cache(maxsize=1)
def _get_interview_chain():
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder("history"),
        ("human", "{input}"),
    ])
    return prompt | _get_llm().with_structured_output(InterviewResponse)


@lru_cache(maxsize=1)
def _get_option_chain():
    option_prompt = ChatPromptTemplate.from_messages([
        ("system", _OPTION_SYSTEM_PROMPT),
        ("human", "Question: {question}"),
    ])
    return option_prompt | _get_llm().with_structured_output(QuestionOptions)


# ---------------------------------------------------------------------------
# History helpers
# ---------------------------------------------------------------------------

def to_langchain_history(history: list[Any] | None) -> list[Any]:
    """Convert Gradio-style history (dicts or (user, bot) tuples) to LangChain messages.

    Trimmed to the last ``HISTORY_WINDOW`` messages to bound token cost.
    """
    messages: list[Any] = []
    for item in history or []:
        if isinstance(item, dict):
            role, content = item.get("role"), item.get("content")
            if role == "user" and content:
                messages.append(HumanMessage(content=str(content)))
            elif role == "assistant" and content:
                messages.append(AIMessage(content=str(content)))
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            if item[0]:
                messages.append(HumanMessage(content=str(item[0])))
            if item[1]:
                messages.append(AIMessage(content=str(item[1])))
    return messages[-HISTORY_WINDOW:]


def _asked_question_count(history: list[Any] | None) -> int:
    """Count prior assistant turns that were questions (not final JSON)."""
    count = 0
    for item in history or []:
        content = (
            item.get("content") if isinstance(item, dict) and item.get("role") == "assistant"
            else (item[1] if isinstance(item, (list, tuple)) and len(item) == 2 else None)
        )
        if isinstance(content, str) and content.strip() and not content.lstrip().startswith("{"):
            count += 1
    return count


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_interview(user_input: str, history: list[Any] | None = None) -> InterviewResponse:
    """Advance the interview by one turn.

    Makes exactly one LLM call to the interview chain. Makes a second call
    -- to backfill multiple-choice options -- only if the model asked a
    question but didn't already supply options itself.
    """
    if not user_input or not user_input.strip():
        raise ValueError("Please enter a hardware project idea.")

    try:
        asked = _asked_question_count(history)
        turn_instruction = (
            f"This is follow-up question {asked + 1} of {MIN_INTERVIEW_TURNS} minimum. "
            "Ask a grouped architecture question; do not complete yet.\n"
            if asked < MIN_INTERVIEW_TURNS
            else f"The minimum {MIN_INTERVIEW_TURNS} questions have been asked; complete only if "
                 "architecture-critical details are sufficient.\n"
        )
        current_input = turn_instruction + "\nCURRENT USER ANSWER:\n" + user_input.strip()

        result = _get_interview_chain().invoke({
            "history": to_langchain_history(history),
            "input": current_input,
        })
        response = InterviewResponse.model_validate(result)

        if response.status == "question" and response.question and not response.options:
            try:
                generated = _get_option_chain().invoke({"question": response.question})
                response = response.model_copy(
                    update={"options": QuestionOptions.model_validate(generated).options}
                )
            except Exception:
                # Backfilling options is a nice-to-have, not a hard requirement --
                # fall back to no options rather than failing the whole turn.
                pass

        return response
    except ValidationError:
        raise
    except Exception as exc:
        raise RuntimeError(f"LangChain/Groq interview failed: {exc}") from exc


def respond(user_input: str, history: list[Any] | None = None) -> str:
    """Convenience wrapper returning plain text: the next question, or final JSON."""
    result = run_interview(user_input, history)
    if result.status == "question":
        return result.question or "Please provide one more project detail."
    assert result.requirements is not None
    return result.requirements.model_dump_json(indent=2, exclude_none=True)