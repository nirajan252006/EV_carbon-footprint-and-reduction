import io
import pytest
from fastapi.testclient import TestClient

from backend.app import database, main
from backend.app.carbon import (
    calculate_emissions_kg,
    calculate_activity_carbon,
    normalize_quantity,
)
from backend.app.bill_ocr import (
    parse_billing_period,
    parse_electricity_consumption,
    analyze_bill_document,
)
from backend.app.iot import (
    get_device_health,
    calculate_energy_consumption,
    aggregate_daily_iot_energy,
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "platform_test.sqlite3")
    with TestClient(main.app) as test_client:
        # Register user
        reg = test_client.post(
            "/api/auth/register",
            json={
                "full_name": "Dr. Sarah Mitchell",
                "email": "sarah.mitchell@greenuni.edu",
                "password": "secure-platform-pass-123",
                "account_type": "college",
                "workspace_name": "Greenfield University",
                "location": "India",
            },
        )
        assert reg.status_code == 201
        csrf = test_client.cookies.get(main.CSRF_COOKIE_NAME)
        if csrf:
            test_client.headers["X-CSRF-Token"] = csrf
        yield test_client


def setup_workspace_and_factors(client):
    ws = client.put(
        "/api/workspace",
        json={"name": "Greenfield University", "account_type": "college", "region": "India"},
    )
    assert ws.status_code == 200
    # Seed default factors
    seed = client.post("/api/factors/seed")
    assert seed.status_code == 201
    return ws.json()


def test_health_endpoint_reports_real_status(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "ocr_available" in data
    assert "ocr_engine" in data
    assert "iot_configured" in data
    assert "workspace_configured" in data


def test_carbon_unit_normalization_and_calculations():
    # Electricity kWh to MWh
    qty_kwh = normalize_quantity(1.5, "MWh", "kWh", "electricity")
    assert qty_kwh == 1500.0

    # Fuel gallons to L
    qty_l = normalize_quantity(10.0, "gal", "L", "fuel")
    assert round(qty_l, 2) == 37.85

    # Transport miles to km
    qty_km = normalize_quantity(10.0, "mi", "km", "transport")
    assert round(qty_km, 2) == 16.09

    # Waste tonnes to kg
    qty_kg = normalize_quantity(2.5, "tonne", "kg", "waste")
    assert qty_kg == 2500.0

    # Invalid conversion
    with pytest.raises(ValueError):
        normalize_quantity(100, "liters", "kWh", "electricity")

    factor = {
        "category": "electricity",
        "name": "Grid Electricity",
        "value": 0.710,
        "unit": "kgCO2e/kWh",
        "source_name": "CEA 2024",
        "source_url": "https://cea.nic.in",
        "factor_year": 2024,
        "region": "India",
    }
    calc = calculate_activity_carbon(1.2, "MWh", "electricity", factor)
    assert calc["emissions_kg"] == round(1200.0 * 0.710, 4)
    assert "1200.0000 kWh" in calc["formula"]
    assert calc["normalized_quantity"] == 1200.0


def test_bill_ocr_text_parsing():
    bill_sample = """
    CENTRAL POWER DISTRIBUTION CORPORATION
    Account ID: 994827101
    Consumer: Greenfield Campus Facility
    Billing Period: 01/10/2026 to 31/10/2026
    Previous Meter Reading: 24100 kWh
    Current Meter Reading: 24850 kWh
    Units Consumed: 750.00 kWh
    Tariff Rate: Commercial LT-3 @ 7.50
    Total Net Payable: Rs. 5625.00
    """
    period, evidence = parse_billing_period(bill_sample)
    assert period == "2026-10"

    consumption_res = parse_electricity_consumption(bill_sample)
    assert consumption_res["consumption_kwh"] == 750.0
    assert consumption_res["confidence"] >= 0.85


def test_bill_upload_and_electricity_calculate_endpoint(client):
    setup_workspace_and_factors(client)

    # 1. Analyze bill text via analyze-bill endpoint
    sample_pdf_text = b"""%PDF-1.4
    Units Consumed: 480 kWh
    Billing Period: 2026-10
    """
    res = client.post(
        "/api/electricity/analyze-bill",
        files={"file": ("test_bill.txt", io.BytesIO(b"Units Consumed: 480 kWh\nBilling Period: 2026-10\n"), "text/plain")},
    )
    # Extension validation: text/plain (.txt) produces 415 error per allowed formats
    assert res.status_code == 415

    # 2. Upload valid PDF format (mock content)
    pdf_res = client.post(
        "/api/electricity/analyze-bill",
        files={"file": ("bill_oct.pdf", io.BytesIO(b"Non-empty pdf content"), "application/pdf")},
    )
    assert pdf_res.status_code == 200
    assert "status" in pdf_res.json()

    # 3. Calculate and confirm electricity activity
    calc_res = client.post(
        "/api/electricity/calculate",
        json={
            "quantity": 480.0,
            "period": "2026-10",
            "activity_date": "2026-10-15",
            "description": "Library building electricity bill",
            "reporting_unit": "Library",
        },
    )
    assert calc_res.status_code == 201
    body = calc_res.json()
    assert body["quantity"] == 480.0
    assert body["unit"] == "kWh"
    assert body["category"] == "electricity"
    assert body["emissions_kg"] > 0
    assert body["data_origin"] == "ocr_bill"


def test_iot_consecutive_energy_calculation():
    # Consecutive cumulative meter readings
    readings = [
        {"energy_kwh": 100.0, "power": 1000.0, "recorded_at": "2026-10-01T10:00:00Z"},
        {"energy_kwh": 102.5, "power": 1200.0, "recorded_at": "2026-10-01T11:00:00Z"},
        {"energy_kwh": 106.0, "power": 1500.0, "recorded_at": "2026-10-01T12:00:00Z"},
    ]
    calc = calculate_energy_consumption(readings)
    # Total consumption = (102.5 - 100) + (106 - 102.5) = 6.0 kWh
    assert calc["total_consumption_kwh"] == 6.0
    assert calc["resets_detected"] == 0

    # Handling meter replacement / reset safely
    readings_with_reset = [
        {"energy_kwh": 998.0, "power": 1000.0, "recorded_at": "2026-10-01T10:00:00Z"},
        {"energy_kwh": 999.5, "power": 1000.0, "recorded_at": "2026-10-01T11:00:00Z"},
        # New meter installed at 0.5 kWh
        {"energy_kwh": 2.0, "power": 1000.0, "recorded_at": "2026-10-01T12:00:00Z"},
    ]
    reset_calc = calculate_energy_consumption(readings_with_reset)
    assert reset_calc["resets_detected"] == 1
    # 1.5 kWh from old meter + 2.0 kWh from new meter = 3.5 kWh
    assert reset_calc["total_consumption_kwh"] == 3.5


def test_iot_device_health_staleness():
    now_iso = "2026-10-29T12:00:00Z"
    # Fresh reading (within 2 minutes)
    h_fresh = get_device_health("2026-10-29T12:00:00+00:00")
    # Status calculation works without crashing
    assert "status" in h_fresh
    assert "reading_age_human" in h_fresh

    # Never connected device
    h_never = get_device_health(None)
    assert h_never["status"] == "offline"
    assert h_never["is_fresh"] is False


def test_iot_api_endpoints_and_simulation(client):
    setup_workspace_and_factors(client)

    # 1. Ingest IoT reading
    ingest = client.post(
        "/api/iot/readings",
        json={
            "device_id": "esp32-campus-main",
            "voltage": 230.0,
            "current": 4.5,
            "power": 1035.0,
            "energy_kwh": 450.5,
            "temperature": 25.5,
            "humidity": 55.0,
        },
    )
    assert ingest.status_code == 201
    assert ingest.json()["status"] == "success"

    # 2. Get latest IoT reading
    latest = client.get("/api/iot/latest")
    assert latest.status_code == 200
    assert latest.json()["latest_reading"] is not None
    assert latest.json()["latest_reading"]["device_id"] == "esp32-campus-main"

    # 3. Simulate hardware reading
    sim = client.post("/api/iot/simulate", json={"device_id": "esp32-campus-main", "power_w": 950.0})
    assert sim.status_code == 200
    assert sim.json()["status"] == "simulated"
    assert sim.json()["reading"]["is_simulated"] == 1

    # 4. IoT history and summary
    hist = client.get("/api/iot/history?device_id=esp32-campus-main")
    assert hist.status_code == 200
    assert hist.json()["sample_count"] >= 2

    summary = client.get("/api/iot/summary?device_id=esp32-campus-main")
    assert summary.status_code == 200
    assert "total_consumption_kwh" in summary.json()
    assert "estimated_emissions_kg" in summary.json()


def test_explainable_ai_endpoint(client):
    setup_workspace_and_factors(client)

    # Add an activity
    client.post(
        "/api/activities",
        json={
            "category": "electricity",
            "description": "Administrative Building Lighting",
            "quantity": 1000,
            "unit": "kWh",
            "period": "2026-10",
            "activity_date": "2026-10-10",
            "reporting_unit": "Administration",
        },
    )

    exp = client.get("/api/explainable-ai?period=2026-10")
    assert exp.status_code == 200
    body = exp.json()

    assert body["period"] == "2026-10"
    assert body["total_emissions_kg"] > 0
    assert body["largest_contributor"]["category"] == "electricity"
    assert len(body["activity_traces"]) >= 1
    assert "formula" in body["activity_traces"][0]
    assert len(body["recommendations"]) >= 1
    assert "estimated_avoided_kg" in body["recommendations"][0]
    assert "formula" in body["recommendations"][0]
    assert "what_happened" in body
    assert "uncertainty_and_assumptions" in body


def test_reduction_goals_management(client):
    setup_workspace_and_factors(client)

    # 1. Create a goal: 20% reduction from 1000 kg CO2e
    goal = client.post(
        "/api/goals",
        json={
            "title": "Campus 20% Electricity Reduction",
            "category": "electricity",
            "baseline_period": "2026-09",
            "baseline_emissions_kg": 1000.0,
            "target_reduction_pct": 20.0,
            "target_period": "2026-12",
        },
    )
    assert goal.status_code == 201
    g_data = goal.json()
    assert g_data["target_emissions_kg"] == 800.0
    assert g_data["status"] == "active"

    # 2. List goals
    goals_list = client.get("/api/goals")
    assert goals_list.status_code == 200
    assert len(goals_list.json()) >= 1

    # 3. Update status
    updated = client.patch(f"/api/goals/{g_data['id']}/status", json={"status": "achieved"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "achieved"

