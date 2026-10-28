import csv
import io

import pytest
from fastapi.testclient import TestClient

from backend.app import database, main


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "carbon.sqlite3")
    with TestClient(main.app) as test_client:
        yield test_client


def create_workspace(client):
    response = client.put(
        "/api/workspace",
        json={"name": "Demo campus", "account_type": "college", "region": "India"},
    )
    assert response.status_code == 200
    return response.json()


def create_factor(client, category="electricity", unit="kgCO2e/kWh", value=0.8):
    return client.post(
        "/api/factors",
        json={
            "category": category,
            "name": "Reviewed grid factor",
            "value": value,
            "unit": unit,
            "source_name": "Official factor publication",
            "source_url": "https://example.org/factors",
            "factor_year": 2025,
            "region": "India",
            "assumptions": "Use for grid electricity only.",
        },
    )


def test_activity_uses_matching_factor_and_dashboard_aggregates(client):
    create_workspace(client)
    factor = create_factor(client)
    assert factor.status_code == 201
    activity = client.post(
        "/api/activities",
        json={
            "category": "electricity",
            "description": "Campus electricity",
            "quantity": 100,
            "unit": "kWh",
            "period": "2026-10",
            "reporting_unit": "Library",
            "factor_id": factor.json()["id"],
        },
    )

    assert activity.status_code == 201
    assert activity.json()["emissions_kg"] == pytest.approx(80)
    dashboard = client.get("/api/dashboard?period=2026-10").json()
    assert dashboard["total_kg"] == pytest.approx(80)
    assert dashboard["activity_count"] == 1
    assert dashboard["categories"] == [{"category": "electricity", "emissions_kg": 80}]
    assert dashboard["contributors"][0]["reporting_unit"] == "Library"
    assert dashboard["trend"] == [{"period": "2026-10", "emissions_kg": 80}]


def test_activity_rejects_mismatched_category_and_incompatible_unit(client):
    create_workspace(client)
    factor = create_factor(client)
    base = {
        "category": "fuel",
        "description": "Diesel use",
        "quantity": 10,
        "unit": "L",
        "period": "2026-10",
        "factor_id": factor.json()["id"],
    }

    assert client.post("/api/activities", json=base).status_code == 422
    base["category"] = "electricity"
    assert client.post("/api/activities", json=base).status_code == 422


def test_dashboard_comparison_target_recommendations_and_csv(client):
    create_workspace(client)
    factor = create_factor(client, "fuel", "kgCO2e/L", 2.5).json()
    for period, quantity in [("2026-09", 20), ("2026-10", 10)]:
        response = client.post(
            "/api/activities",
            json={
                "category": "fuel",
                "description": "Generator fuel",
                "quantity": quantity,
                "unit": "L",
                "period": period,
                "factor_id": factor["id"],
            },
        )
        assert response.status_code == 201

    assert client.put("/api/targets", json={"monthly_target_kg": 40}).json() == {
        "monthly_target_kg": 40
    }
    dashboard = client.get("/api/dashboard?period=2026-10").json()
    assert dashboard["previous_total_kg"] == pytest.approx(50)
    assert dashboard["monthly_target_kg"] == 40
    assert dashboard["trend"] == [
        {"period": "2026-09", "emissions_kg": 50},
        {"period": "2026-10", "emissions_kg": 25},
    ]
    suggestion = client.get("/api/recommendations?period=2026-10").json()[0]
    assert suggestion["category"] == "fuel"
    assert suggestion["estimated_savings_kg"] is None

    report = client.get("/api/reports.csv?period=2026-10")
    rows = list(csv.reader(io.StringIO(report.text)))
    assert report.status_code == 200
    assert ["Account type", "college"] in rows
    header = rows.index(["Period", "Category", "Activity", "Reporting unit", "Quantity", "Unit",
                         "Emissions (kg CO2e)", "Factor name", "Factor value", "Factor unit",
                         "Factor year", "Factor region", "Factor source", "Factor source URL",
                         "Assumptions"])
    assert rows[header + 1][0] == "2026-10"
    assert rows[header + 1][6] == "25.0"
    assert rows[header + 1][12] == "Official factor publication"


def test_factor_requires_source_and_workspace(client):
    payload = {
        "category": "waste",
        "name": "Waste factor",
        "value": 1.2,
        "unit": "kgCO2e/kg",
        "source_name": "Reference",
        "source_url": "javascript:alert(1)",
        "factor_year": 2025,
        "region": "India",
    }
    assert client.post("/api/factors", json=payload).status_code == 422
    payload["source_url"] = "https://example.org"
    assert client.post("/api/factors", json=payload).status_code == 409


def test_non_finite_factors_are_rejected(client):
    create_workspace(client)
    response = client.post(
        "/api/factors",
        content='{"category":"electricity","name":"Invalid factor","value":NaN,'
        '"unit":"kgCO2e/kWh","source_name":"Reference",'
        '"source_url":"https://example.org","factor_year":2025,"region":"India"}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_csv_escapes_spreadsheet_formula_text(client):
    create_workspace(client)
    factor = create_factor(client).json()
    activity = client.post(
        "/api/activities",
        json={
            "category": "electricity",
            "description": "=HYPERLINK(\"https://example.org\")",
            "quantity": 1,
            "unit": "kWh",
            "period": "2026-10",
            "factor_id": factor["id"],
        },
    )
    assert activity.status_code == 201
    response = client.get("/api/reports.csv?period=2026-10")
    rows = list(csv.reader(io.StringIO(response.text)))
    header = rows.index(["Period", "Category", "Activity", "Reporting unit", "Quantity", "Unit",
                         "Emissions (kg CO2e)", "Factor name", "Factor value", "Factor unit",
                         "Factor year", "Factor region", "Factor source", "Factor source URL",
                         "Assumptions"])
    assert rows[header + 1][2].startswith("'=")
