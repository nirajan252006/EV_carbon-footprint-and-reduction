from typing import Any


def calculate_emissions_kg(
    quantity: float,
    activity_unit: str,
    category: str,
    factor: dict[str, Any],
) -> float:
    if category != factor["category"]:
        raise ValueError("Emission factor category does not match the activity.")
    factor_unit = str(factor["unit"]).rsplit("/", 1)[-1]
    if factor_unit != activity_unit:
        raise ValueError(f"This factor requires {factor_unit}; received {activity_unit}.")
    return round(quantity * float(factor["value"]), 6)
