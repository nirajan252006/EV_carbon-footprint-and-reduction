from datetime import datetime, timezone
from typing import Any

# Standard unit normalization conversions to canonical base units
# Canonical base units: electricity -> kWh, fuel -> L, transport -> km, waste -> kg
UNIT_CONVERSIONS: dict[str, dict[str, float]] = {
    "electricity": {
        "kwh": 1.0,
        "mwh": 1000.0,
        "wh": 0.001,
    },
    "fuel": {
        "l": 1.0,
        "litre": 1.0,
        "litres": 1.0,
        "liter": 1.0,
        "liters": 1.0,
        "gal": 3.785411784,
        "gallon": 3.785411784,
        "gallons": 3.785411784,
        "kg": 1.0, # for LPG cylinders or solid fuels
        "cylinder": 14.2, # standard domestic LPG cylinder = 14.2 kg
        "cylinders": 14.2,
    },
    "transport": {
        "km": 1.0,
        "mi": 1.609344,
        "mile": 1.609344,
        "miles": 1.609344,
        "pkm": 1.0, # passenger-km
        "passenger-km": 1.0,
    },
    "waste": {
        "kg": 1.0,
        "tonne": 1000.0,
        "tonnes": 1000.0,
        "t": 1000.0,
        "g": 0.001,
        "gram": 0.001,
        "grams": 0.001,
        "lb": 0.45359237,
        "lbs": 0.45359237,
    },
}

# Standard reference factor registry with traceable public methodologies
REFERENCE_FACTORS = [
    {
        "category": "electricity",
        "name": "CEA National Grid Electricity Baseline",
        "value": 0.710,
        "unit": "kgCO2e/kWh",
        "source_name": "Central Electricity Authority (CEA), Ministry of Power, Govt of India",
        "source_url": "https://cea.nic.in/cdm-co2-baseline-database",
        "factor_year": 2024,
        "region": "India",
        "assumptions": "Weighted average grid emission factor for combined margin grid mix. Illustrative configured reference factor.",
    },
    {
        "category": "transport",
        "name": "Passenger Car (Petrol / Gasoline)",
        "value": 0.170,
        "unit": "kgCO2e/km",
        "source_name": "UK Department for Environment, Food & Rural Affairs (DEFRA) / GHG Protocol",
        "source_url": "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
        "factor_year": 2024,
        "region": "Global Average",
        "assumptions": "Average mid-size passenger gasoline car per vehicle-km.",
    },
    {
        "category": "transport",
        "name": "Public Transit Bus (Per Passenger)",
        "value": 0.089,
        "unit": "kgCO2e/km",
        "source_name": "UK Department for Environment, Food & Rural Affairs (DEFRA)",
        "source_url": "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
        "factor_year": 2024,
        "region": "Global Average",
        "assumptions": "Average local transit bus occupancy per passenger-km.",
    },
    {
        "category": "fuel",
        "name": "Motor Gasoline / Petrol Fuel",
        "value": 2.310,
        "unit": "kgCO2e/L",
        "source_name": "US Environmental Protection Agency (EPA) GHG Emission Factors Hub",
        "source_url": "https://www.epa.gov/climateleadership/ghg-emission-factors-hub",
        "factor_year": 2024,
        "region": "Global",
        "assumptions": "Combustion emissions per litre of motor fuel.",
    },
    {
        "category": "fuel",
        "name": "Diesel Fuel Combustion",
        "value": 2.680,
        "unit": "kgCO2e/L",
        "source_name": "US Environmental Protection Agency (EPA) GHG Emission Factors Hub",
        "source_url": "https://www.epa.gov/climateleadership/ghg-emission-factors-hub",
        "factor_year": 2024,
        "region": "Global",
        "assumptions": "Direct tailpipe emissions per litre of automotive diesel.",
    },
    {
        "category": "fuel",
        "name": "LPG Household Cooking Gas",
        "value": 2.980,
        "unit": "kgCO2e/kg",
        "source_name": "IPCC Guidelines for National Greenhouse Gas Inventories & DEFRA",
        "source_url": "https://www.ipcc-nggip.iges.or.jp",
        "factor_year": 2024,
        "region": "Global",
        "assumptions": "Household liquefied petroleum gas combustion per kg (1 cylinder = 14.2 kg = 42.3 kg CO2e).",
    },
    {
        "category": "waste",
        "name": "Municipal Solid Waste (Mixed Landfill)",
        "value": 0.520,
        "unit": "kgCO2e/kg",
        "source_name": "US EPA Waste Reduction Model (WARM) / IPCC",
        "source_url": "https://www.epa.gov/warm",
        "factor_year": 2024,
        "region": "Global Average",
        "assumptions": "Average municipal mixed solid waste disposed in landfill with standard methane capture.",
    },
]


def extract_factor_activity_unit(factor_unit: str) -> str:
    """Extracts the denominator unit from a factor unit like kgCO2e/kWh -> kWh."""
    return factor_unit.rsplit("/", 1)[-1].strip()


def normalize_quantity(quantity: float, input_unit: str, target_unit: str, category: str) -> float:
    """
    Normalizes quantity from input_unit to target_unit within the category.
    Raises ValueError if conversion is not defined.
    """
    inp = input_unit.lower().strip()
    tgt = target_unit.lower().strip()
    if inp == tgt:
        return float(quantity)

    cat_conversions = UNIT_CONVERSIONS.get(category, {})
    if inp in cat_conversions and tgt in cat_conversions:
        # Convert to category base unit, then to target unit
        base_value = float(quantity) * cat_conversions[inp]
        converted = base_value / cat_conversions[tgt]
        return converted

    raise ValueError(f"Cannot convert unit '{input_unit}' to '{target_unit}' for category '{category}'.")


def calculate_emissions_kg(
    quantity: float,
    activity_unit: str,
    category: str,
    factor: dict[str, Any],
) -> float:
    """
    Deterministic calculation: Emissions in kg CO2e = Activity quantity * Emission factor.
    Maintains backward compatibility with existing tests.
    Normalizes compatible units (e.g. MWh to kWh, mi to km, gallons to L, tonnes to kg)
    or validates direct unit match.
    """
    if category != factor.get("category"):
        raise ValueError("Emission factor category does not match the activity.")

    factor_unit_raw = str(factor.get("unit", ""))
    factor_activity_unit = extract_factor_activity_unit(factor_unit_raw)

    # First check exact match
    if factor_activity_unit == activity_unit:
        return round(float(quantity) * float(factor["value"]), 6)

    # Try unit normalization if available
    try:
        normalized_qty = normalize_quantity(quantity, activity_unit, factor_activity_unit, category)
        return round(normalized_qty * float(factor["value"]), 6)
    except ValueError:
        raise ValueError(f"This factor requires {factor_activity_unit}; received {activity_unit}.")


def calculate_activity_carbon(
    quantity: float,
    activity_unit: str,
    category: str,
    factor: dict[str, Any],
    data_origin: str = "manual",
) -> dict[str, Any]:
    """
    Full transparent calculation returning formula, factor trace, normalized quantity,
    and metadata for explainable intelligence.
    """
    if category != factor.get("category"):
        raise ValueError("Emission factor category does not match the activity.")

    factor_unit_raw = str(factor.get("unit", ""))
    factor_activity_unit = extract_factor_activity_unit(factor_unit_raw)
    factor_value = float(factor.get("value", 0.0))

    if factor_activity_unit == activity_unit:
        normalized_qty = float(quantity)
    else:
        normalized_qty = normalize_quantity(quantity, activity_unit, factor_activity_unit, category)

    emissions_kg = round(normalized_qty * factor_value, 6)

    formula = (
        f"{normalized_qty:.4f} {factor_activity_unit} × {factor_value:.4f} {factor_unit_raw} "
        f"= {emissions_kg:.4f} kg CO2e"
    )
    if activity_unit != factor_activity_unit:
        formula = f"{quantity:.4f} {activity_unit} ({normalized_qty:.4f} {factor_activity_unit}) × {factor_value} {factor_unit_raw} = {emissions_kg:.4f} kg CO2e"

    return {
        "category": category,
        "input_quantity": float(quantity),
        "input_unit": activity_unit,
        "normalized_quantity": round(normalized_qty, 6),
        "calculation_unit": factor_activity_unit,
        "factor_id": factor.get("id"),
        "factor_name": factor.get("name"),
        "factor_value": factor_value,
        "factor_unit": factor_unit_raw,
        "factor_source": factor.get("source_name"),
        "factor_source_url": factor.get("source_url"),
        "factor_year": factor.get("factor_year"),
        "factor_region": factor.get("region"),
        "assumptions": factor.get("assumptions", ""),
        "emissions_kg": emissions_kg,
        "formula": formula,
        "data_origin": data_origin,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
    }
