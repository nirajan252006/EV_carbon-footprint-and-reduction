import math
from datetime import datetime, timezone
from typing import Any

# Standard unit normalization conversions to canonical base units
# Canonical base units: electricity -> kWh, fuel -> L, transport -> km, waste -> kg, water -> L
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
        "kg": 1.0,  # for LPG or CNG
        "cylinder": 14.2,  # standard domestic LPG cylinder = 14.2 kg
        "cylinders": 14.2,
        "m3": 0.75,  # Natural gas approx 0.75 kg/m3
        "scm": 0.75,  # Standard cubic metre
    },
    "transport": {
        "km": 1.0,
        "mi": 1.609344,
        "mile": 1.609344,
        "miles": 1.609344,
        "pkm": 1.0,  # passenger-km
        "passenger-km": 1.0,
        "m": 0.001,
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
    "water": {
        "l": 1.0,
        "litre": 1.0,
        "litres": 1.0,
        "liter": 1.0,
        "liters": 1.0,
        "m3": 1000.0,
        "kl": 1000.0,
        "gal": 3.785411784,
        "gallon": 3.785411784,
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
        "name": "Motorcycle / Two-Wheeler (Petrol)",
        "value": 0.045,
        "unit": "kgCO2e/km",
        "source_name": "Automotive Research Association of India (ARAI) & DEFRA",
        "source_url": "https://www.araiindia.com",
        "factor_year": 2024,
        "region": "India / Global",
        "assumptions": "Standard 100-150cc commuter motorcycle / scooter per km.",
    },
    {
        "category": "transport",
        "name": "Electric Vehicle (Grid Charged EV)",
        "value": 0.053,
        "unit": "kgCO2e/km",
        "source_name": "Bureau of Energy Efficiency (BEE) & CEA India Grid",
        "source_url": "https://beeindia.gov.in",
        "factor_year": 2024,
        "region": "India",
        "assumptions": "Indirect emissions per km assuming 0.71 kgCO2e/kWh grid electricity and 0.075 kWh/km efficiency.",
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
        "category": "transport",
        "name": "Metro Rail / Suburban Electric Train",
        "value": 0.035,
        "unit": "kgCO2e/km",
        "source_name": "Delhi Metro Rail Corporation (DMRC) / DEFRA",
        "source_url": "https://www.delhimetrorail.com",
        "factor_year": 2024,
        "region": "India",
        "assumptions": "Mass rapid electric urban transit per passenger-km.",
    },
    {
        "category": "transport",
        "name": "Walking / Bicycling (Active Travel)",
        "value": 0.000,
        "unit": "kgCO2e/km",
        "source_name": "GHG Protocol Corporate Standard",
        "source_url": "https://ghgprotocol.org",
        "factor_year": 2024,
        "region": "Global",
        "assumptions": "Zero direct tailpipe emissions from active human-powered mobility.",
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
        "name": "Compressed Natural Gas (CNG)",
        "value": 2.750,
        "unit": "kgCO2e/kg",
        "source_name": "DEFRA & IPCC Guidelines for National GHG Inventories",
        "source_url": "https://www.ipcc-nggip.iges.or.jp",
        "factor_year": 2024,
        "region": "Global",
        "assumptions": "Direct combustion emissions per kg of CNG vehicular / industrial fuel.",
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
    {
        "category": "waste",
        "name": "Canteen & Kitchen Food Waste (Organic)",
        "value": 0.625,
        "unit": "kgCO2e/kg",
        "source_name": "US EPA WARM Food Waste Model & FAO",
        "source_url": "https://www.epa.gov/warm",
        "factor_year": 2024,
        "region": "Global",
        "assumptions": "Anaerobic decomposition emissions of uneaten food in landfill.",
    },
    {
        "category": "waste",
        "name": "Electronic Waste (E-Waste)",
        "value": 18.500,
        "unit": "kgCO2e/kg",
        "source_name": "United Nations Global E-waste Monitor & WEEE Forum",
        "source_url": "https://ewastemonitor.info",
        "factor_year": 2024,
        "region": "Global",
        "assumptions": "Embodied extraction and improper disposal emissions per kg of electronic components.",
    },
    {
        "category": "waste",
        "name": "Municipal Water Supply",
        "value": 0.000344,
        "unit": "kgCO2e/L",
        "source_name": "UK DEFRA & Central Pollution Control Board (CPCB)",
        "source_url": "https://cpcb.nic.in",
        "factor_year": 2024,
        "region": "India / Global",
        "assumptions": "Energy required for municipal treatment and pumped distribution per litre (0.344 kgCO2e/m3).",
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
        base_value = float(quantity) * cat_conversions[inp]
        converted = base_value / cat_conversions[tgt]
        return converted

    # Check cross-category for waste/water
    if category in ("waste", "water"):
        for alt_cat in ("waste", "water"):
            alt_conv = UNIT_CONVERSIONS.get(alt_cat, {})
            if inp in alt_conv and tgt in alt_conv:
                base_value = float(quantity) * alt_conv[inp]
                return base_value / alt_conv[tgt]

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
    """
    if category != factor.get("category"):
        raise ValueError("Emission factor category does not match the activity.")

    factor_unit_raw = str(factor.get("unit", ""))
    factor_activity_unit = extract_factor_activity_unit(factor_unit_raw)

    if factor_activity_unit == activity_unit:
        return round(float(quantity) * float(factor["value"]), 6)

    try:
        normalized_qty = normalize_quantity(quantity, activity_unit, factor_activity_unit, category)
        return round(normalized_qty * float(factor["value"]), 6)
    except ValueError:
        raise ValueError(f"This factor requires {factor_activity_unit}; received {activity_unit}.")


def classify_scope(category: str, description: str = "", factor_name: str = "") -> str:
    """
    Categorizes carbon activities into GHG Protocol scopes:
    - Scope 1: Direct emissions from fuel combustion (petrol, diesel, CNG, LPG, generators)
    - Scope 2: Indirect emissions from purchased electricity / steam
    - Scope 3: Indirect value chain (commute, flights, public transit, waste, water, logistics)
    """
    cat = category.lower().strip()
    desc = (description + " " + factor_name).lower()

    if cat == "electricity":
        return "scope_2"

    if cat == "fuel":
        return "scope_1"

    if cat == "transport":
        if "car" in desc or "motorcycle" in desc or "fleet" in desc or "diesel" in desc:
            return "scope_1"
        return "scope_3"  # Bus, metro, train, flight, active travel

    if cat in ("waste", "water"):
        return "scope_3"

    return "scope_3"


def calculate_activity_carbon(
    quantity: float,
    activity_unit: str,
    category: str,
    factor: dict[str, Any],
    data_origin: str = "manual",
) -> dict[str, Any]:
    """
    Full transparent calculation returning formula, factor trace, normalized quantity,
    GHG Protocol Scope, and metadata for explainable intelligence.
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

    scope = classify_scope(category, factor.get("name", ""), factor.get("name", ""))

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
        "scope": scope,
        "data_origin": data_origin,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
    }


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle distance between two GPS coordinates in kilometres using Haversine formula.
    """
    r = 6371.0  # Earth's radius in kilometres
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def filter_gps_track(
    points: list[dict[str, Any]],
    max_accuracy_m: float = 50.0,
    max_speed_kmh: float = 300.0,
) -> tuple[float, list[dict[str, Any]]]:
    """
    Applies accuracy filtering and speed outlier removal to GPS track points.
    Returns: (total_distance_km, filtered_points)
    """
    if len(points) < 2:
        return 0.0, points

    valid_points = []
    for p in points:
        accuracy = float(p.get("accuracy", 10.0))
        if accuracy <= max_accuracy_m:
            valid_points.append(p)

    if len(valid_points) < 2:
        valid_points = points

    total_dist_km = 0.0
    cleaned_points = [valid_points[0]]

    for i in range(1, len(valid_points)):
        p_prev = cleaned_points[-1]
        p_curr = valid_points[i]

        d = calculate_haversine_distance(
            p_prev["latitude"], p_prev["longitude"],
            p_curr["latitude"], p_curr["longitude"]
        )

        t_prev = p_prev.get("timestamp")
        t_curr = p_curr.get("timestamp")
        is_realistic = True
        if t_prev and t_curr:
            try:
                dt_sec = abs(float(t_curr) - float(t_prev))
                if dt_sec > 0:
                    speed_kmh = (d / (dt_sec / 3600.0))
                    if speed_kmh > max_speed_kmh:
                        is_realistic = False
            except Exception:
                pass

        if is_realistic:
            total_dist_km += d
            cleaned_points.append(p_curr)

    return round(total_dist_km, 3), cleaned_points


def calculate_impact_equivalents(emissions_kg: float, avoided_kg: float = 0.0) -> dict[str, Any]:
    """
    Computes environmental, social, and financial impact metrics with transparent conversion factors:
    - 1 Mature Tree absorbs ~22 kg CO2e / year (~1.83 kg/month)
    - Average electricity cost in India ~ ₹8.00 / kWh (or $0.10/kWh)
    - Average fuel cost ~ ₹100 / L
    - Landfill diversion savings
    """
    trees_needed_annual = round(emissions_kg / 22.0, 1)
    trees_preserved = round(avoided_kg / 22.0, 1) if avoided_kg > 0 else 0.0
    money_saved_inr = round(avoided_kg * (8.0 / 0.71), 2) if avoided_kg > 0 else 0.0
    water_litres_saved = round(avoided_kg * 120.0, 1) if avoided_kg > 0 else 0.0

    return {
        "emissions_kg": emissions_kg,
        "avoided_kg": avoided_kg,
        "trees_absorption_needed": trees_needed_annual,
        "trees_preserved": trees_preserved,
        "money_saved_inr": money_saved_inr,
        "water_litres_saved": water_litres_saved,
    }
