"""Experimental offline intake and deterministic recommendations; no providers."""
from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class Intake:
    goal: str
    sensitivity: str
    external_processing_allowed: bool
    existing_tools: tuple[str, ...]
    users: int
    monthly_budget_brl: int | None


def parse_intake(data: Mapping[str, Any]) -> Intake:
    """Reject unlisted fields, including credentials, and coerced values."""
    required = {"goal", "sensitivity", "external_processing_allowed",
                "existing_tools", "users", "monthly_budget_brl"}
    if not isinstance(data, Mapping) or set(data) != required:
        raise ValueError("Intake requires exactly the six documented fields")
    if data["goal"] not in ("process", "support", "documents"):
        raise ValueError("Invalid goal")
    if data["sensitivity"] not in ("normal", "restricted"):
        raise ValueError("Invalid sensitivity")
    if type(data["external_processing_allowed"]) is not bool:
        raise ValueError("External-processing choice must be boolean")
    tools = data["existing_tools"]
    if (not isinstance(tools, list) or len(tools) > 30
            or any(type(t) is not str or not t.strip() or len(t) > 80 for t in tools)):
        raise ValueError("Existing tools must be up to 30 short names")
    if type(data["users"]) is not int or not 1 <= data["users"] <= 100_000:
        raise ValueError("Users must be a positive integer, at most 100000")
    budget = data["monthly_budget_brl"]
    if budget is not None and (type(budget) is not int or budget < 0):
        raise ValueError("Budget must be a nonnegative integer or null")
    return Intake(data["goal"], data["sensitivity"],
                  data["external_processing_allowed"],
                  tuple(t.strip() for t in tools), data["users"], budget)


def diagnose(intake: Intake) -> dict[str, Any]:
    tracks = {"documents": "document_search", "process": "process_automation",
              "support": "assisted_support"}
    permitted = (intake.sensitivity == "normal"
                 and intake.external_processing_allowed)
    gaps = ["Verify existing infrastructure", "Validate tenant isolation",
            "Select authorized pilot data", "Agree on acceptance criteria"]
    if not permitted:
        gaps.append("Select private processing; provider-specific consent is not implemented")
    if intake.monthly_budget_brl is None:
        gaps.append("Agree on pilot spending ceiling")
    elif intake.monthly_budget_brl == 0:
        gaps.append("Restrict pilot to offline evaluation until spending is authorized")
    return {"service_track": tracks[intake.goal],
            "external_processing": "permitted" if permitted else "blocked",
            "gaps": gaps, "human_review": True,
            "status": "offline_reference", "estimated_cost_brl": None}
