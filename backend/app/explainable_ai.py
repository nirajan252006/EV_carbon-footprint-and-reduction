from datetime import datetime
from typing import Any

from .config import OPENAI_API_KEY
from .rag import OpenAIProvider


def generate_explainable_intelligence(
    workspace: dict[str, Any],
    period: str,
    dashboard_data: dict[str, Any],
    activities: list[dict[str, Any]],
    previous_dashboard_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Builds transparent, explainable carbon intelligence for the workspace and period.
    Deterministic, mathematical, and grounded in verified activity and factor records.
    """
    total_kg = float(dashboard_data.get("total_kg", 0.0))
    categories = dashboard_data.get("categories", [])
    activity_count = len(activities)

    # 1. Activity Traces (Section A: Explain each calculation)
    activity_traces = []
    for act in activities:
        qty = float(act.get("quantity", 0.0))
        unit = str(act.get("unit", ""))
        factor_val = float(act.get("factor_value", 0.0))
        factor_unit = str(act.get("factor_unit", ""))
        factor_name = str(act.get("factor_name", "Unverified factor"))
        factor_src = str(act.get("factor_source", "Not specified"))
        factor_year = act.get("factor_year")
        emissions = float(act.get("emissions_kg", 0.0))
        category = str(act.get("category", ""))
        origin = act.get("data_origin", "manual")

        explanation_text = (
            f"Your recorded {category} activity was {qty:g} {unit}. "
            f"Using the documented factor '{factor_name}' ({factor_val} {factor_unit}, {factor_src} {factor_year or ''}), "
            f"the calculated emissions are {emissions:.2f} kg CO2e."
        )

        activity_traces.append({
            "id": act.get("id"),
            "category": category,
            "description": act.get("description", ""),
            "activity_date": act.get("activity_date") or f"{period}-01",
            "quantity": qty,
            "unit": unit,
            "factor_name": factor_name,
            "factor_value": factor_val,
            "factor_unit": factor_unit,
            "factor_source": factor_src,
            "factor_source_url": act.get("factor_source_url", ""),
            "factor_year": factor_year,
            "emissions_kg": round(emissions, 4),
            "formula": f"{qty:g} {unit} × {factor_val} {factor_unit} = {emissions:.4f} kg CO2e",
            "explanation": explanation_text,
            "data_origin": origin,
            "is_measured": origin in {"iot_sensor", "ocr_bill", "manual"},
        })

    # 2. Largest Contributors & Category Ranking (Section B)
    sorted_categories = sorted(categories, key=lambda c: float(c["emissions_kg"]), reverse=True)
    ranked_contributors = []
    for cat in sorted_categories:
        c_kg = float(cat["emissions_kg"])
        pct = round((c_kg / total_kg * 100), 1) if total_kg > 0 else 0.0
        ranked_contributors.append({
            "category": cat["category"],
            "emissions_kg": round(c_kg, 2),
            "percentage_of_total": pct,
        })

    largest_contributor = None
    if ranked_contributors and total_kg > 0:
        top = ranked_contributors[0]
        largest_contributor = {
            "category": top["category"],
            "emissions_kg": top["emissions_kg"],
            "percentage_of_total": top["percentage_of_total"],
            "summary": (
                f"{top['category'].title()} is your largest emissions source, contributing "
                f"{top['emissions_kg']} kg CO2e ({top['percentage_of_total']}% of your monthly total)."
            ),
        }

    # 3. Period-over-period comparison (Section B & C)
    prev_total = float(dashboard_data.get("previous_total_kg", 0.0))
    prev_period = dashboard_data.get("previous_period")
    period_comparison = {
        "current_period": period,
        "current_total_kg": round(total_kg, 2),
        "previous_period": prev_period,
        "previous_total_kg": round(prev_total, 2),
        "change_kg": round(total_kg - prev_total, 2) if prev_total > 0 else None,
        "change_pct": round(((total_kg - prev_total) / prev_total) * 100, 1) if prev_total > 0 else None,
        "has_prior_baseline": prev_total > 0,
        "note": (
            f"Comparing with {prev_period}: emissions changed by "
            f"{round(((total_kg - prev_total) / prev_total) * 100, 1)}% ({round(total_kg - prev_total, 2)} kg CO2e)."
            if prev_total > 0
            else "Insufficient prior-period baseline to calculate comparative trend."
        ),
    }

    # 4. Transparent Recommendations with Math (Section D)
    recommendations = []
    reduction_suggestions = {
        "electricity": {
            "action": "Implement smart equipment scheduling, LED conversion, and optimize peak-load air conditioning.",
            "target_reduction_pct": 15.0,
            "difficulty": "Moderate",
            "priority": "High" if largest_contributor and largest_contributor["category"] == "electricity" else "Medium",
            "assumption": "Assumes a 15% reduction in electricity consumption through scheduling and behavioral efficiency.",
        },
        "transport": {
            "action": "Consolidate travel routes, increase carpooling, or substitute personal motor trips with transit/cycling.",
            "target_reduction_pct": 20.0,
            "difficulty": "Moderate",
            "priority": "High" if largest_contributor and largest_contributor["category"] == "transport" else "Medium",
            "assumption": "Assumes substituting 20% of private vehicle passenger-km with active or mass transit.",
        },
        "fuel": {
            "action": "Service thermal equipment, reduce avoidable engine idling, and check fuel combustion efficiency.",
            "target_reduction_pct": 10.0,
            "difficulty": "Low",
            "priority": "Medium",
            "assumption": "Assumes a 10% fuel saving via maintenance, route optimization, or clean cooking practices.",
        },
        "waste": {
            "action": "Enhance segregation at source, compost organic matter, and divert recyclable streams from landfill.",
            "target_reduction_pct": 25.0,
            "difficulty": "Low",
            "priority": "Medium",
            "assumption": "Assumes 25% of mixed municipal waste is diverted to composting or recycling.",
        },
    }

    for cat in sorted_categories:
        cat_name = str(cat["category"])
        cat_kg = float(cat["emissions_kg"])
        if cat_kg <= 0:
            continue
        cfg = reduction_suggestions.get(cat_name, {
            "action": f"Review {cat_name} intensity and establish conservation protocols.",
            "target_reduction_pct": 10.0,
            "difficulty": "Moderate",
            "priority": "Low",
            "assumption": "Scenario target of 10% reduction in category emissions.",
        })

        target_pct = cfg["target_reduction_pct"]
        avoided_kg = round(cat_kg * (target_pct / 100.0), 2)

        recommendations.append({
            "category": cat_name,
            "current_emissions_kg": round(cat_kg, 2),
            "proposed_action": cfg["action"],
            "scenario_reduction_pct": target_pct,
            "estimated_avoided_kg": avoided_kg,
            "formula": f"{cat_kg:.2f} kg × {target_pct}% = {avoided_kg:.2f} kg CO2e avoided",
            "assumptions": cfg["assumption"],
            "difficulty": cfg["difficulty"],
            "priority": cfg["priority"],
            "disclaimer": "Scenario estimate based on category activity; not a measured or guaranteed reduction.",
        })

    # 5. Uncertainty and Assumptions (Section F)
    unverified_factors_count = sum(1 for a in activities if a.get("factor_value", 0) == 0 or "no verified" in str(a.get("factor_name", "")).lower())
    bill_activities_count = sum(1 for a in activities if a.get("data_origin") == "ocr_bill")
    iot_activities_count = sum(1 for a in activities if a.get("data_origin") == "iot_sensor")

    uncertainty_notes = []
    if unverified_factors_count > 0:
        uncertainty_notes.append(f"{unverified_factors_count} activity record(s) lack a verified emission factor and are calculated as 0 kg CO2e until verified.")
    if bill_activities_count > 0:
        uncertainty_notes.append("Monthly electricity bill entries represent aggregate billing cycle totals; daily distributions for bills are evenly allocated unless IoT readings are available.")
    if not period_comparison["has_prior_baseline"]:
        uncertainty_notes.append("Prior period baseline data is absent; percentage reductions and trends will activate after two consecutive reporting months.")

    # 6. Natural-language explanation (Section E)
    deterministic_explanation = (
        f"For reporting month {period}, your workspace '{workspace.get('name', 'Workspace')}' recorded a total of "
        f"{total_kg:.2f} kg CO2e across {activity_count} activity entry(ies). "
    )
    if largest_contributor:
        deterministic_explanation += (
            f"The primary driver is {largest_contributor['category'].title()} ({largest_contributor['emissions_kg']} kg CO2e, "
            f"{largest_contributor['percentage_of_total']}% of total). "
        )
    if period_comparison["has_prior_baseline"]:
        deterministic_explanation += (
            f"Compared to {prev_period} ({prev_total} kg CO2e), your footprint is "
            f"{'down' if period_comparison['change_kg'] <= 0 else 'up'} by {abs(period_comparison['change_pct'])}%. "
        )
    else:
        deterministic_explanation += "This establishes your baseline period for subsequent reduction tracking. "

    if recommendations:
        top_rec = recommendations[0]
        deterministic_explanation += (
            f"Key reduction scenario: {top_rec['proposed_action']} could avoid up to {top_rec['estimated_avoided_kg']} kg CO2e "
            f"({top_rec['scenario_reduction_pct']}% of {top_rec['category']} emissions)."
        )

    ai_narrative = None
    ai_generated = False
    if OPENAI_API_KEY:
        try:
            facts = (
                f"Reporting Month: {period}. Total Footprint: {total_kg:.2f} kg CO2e. "
                f"Contributors: {', '.join(f'{r.category}: {r.emissions_kg} kg' for r in ranked_contributors)}. "
                f"Top Source: {largest_contributor['category'] if largest_contributor else 'None'}. "
                f"Trend: {period_comparison['note']}. "
                "Explain the results concisely and transparently. Do not alter numbers or make up unrecorded facts."
            )
            ai_narrative = OpenAIProvider().explain(facts)
            ai_generated = bool(ai_narrative)
        except Exception:
            ai_narrative = None

    final_explanation = ai_narrative if ai_narrative else deterministic_explanation

    return {
        "period": period,
        "workspace_name": workspace.get("name"),
        "account_type": workspace.get("account_type"),
        "total_emissions_kg": round(total_kg, 2),
        "activity_count": activity_count,
        "what_happened": final_explanation,
        "largest_contributor": largest_contributor,
        "category_rankings": ranked_contributors,
        "period_comparison": period_comparison,
        "activity_traces": activity_traces,
        "recommendations": recommendations,
        "uncertainty_and_assumptions": uncertainty_notes,
        "ai_generated": ai_generated,
        "daily_distribution": dashboard_data.get("daily", []),
        "generated_at": datetime.now().isoformat(),
    }

