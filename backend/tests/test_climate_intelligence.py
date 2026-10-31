import pytest
from starlette.testclient import TestClient

from backend.app import main, database
from backend.app.carbon import (
    calculate_haversine_distance,
    filter_gps_track,
    classify_scope,
    calculate_impact_equivalents,
)
from backend.app.explainable_ai import detect_anomalies, forecast_next_period


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "climate_test.sqlite3")
    database.initialize_database()
    with TestClient(main.app) as test_client:
        # Register user
        reg = test_client.post(
            "/api/auth/register",
            json={
                "full_name": "Climate Researcher",
                "email": "climate_researcher@greentrack.ai",
                "password": "SecurePassword123!",
                "account_type": "college",
                "workspace_name": "GreenTech Campus",
                "location": "Bengaluru",
            },
        )
        assert reg.status_code == 201
        csrf = test_client.cookies.get(main.CSRF_COOKIE_NAME)
        if csrf:
            test_client.headers["X-CSRF-Token"] = csrf

        # Setup onboarding workspace
        ws = test_client.put(
            "/api/workspace",
            json={"name": "GreenTech Campus", "account_type": "college", "region": "India"},
        )
        assert ws.status_code == 200

        # Seed reference factors
        seed = test_client.post("/api/factors/seed")
        assert seed.status_code == 201

        yield test_client


def test_gps_distance_and_filtering():
    # Bengaluru MG Road to Indiranagar (~4.2 km)
    lat1, lon1 = 12.9753, 77.6067
    lat2, lon2 = 12.9784, 77.6408
    dist = calculate_haversine_distance(lat1, lon1, lat2, lon2)
    assert 3.5 < dist < 4.5

    # Filter accuracy points
    points = [
        {"latitude": 12.9753, "longitude": 77.6067, "accuracy": 12.0, "timestamp": 1700000000},
        {"latitude": 12.9760, "longitude": 77.6150, "accuracy": 150.0, "timestamp": 1700000060},  # noisy jump
        {"latitude": 12.9784, "longitude": 77.6408, "accuracy": 15.0, "timestamp": 1700000300},
    ]
    total_km, cleaned = filter_gps_track(points, max_accuracy_m=50.0)
    assert len(cleaned) == 2
    assert total_km > 0.0


def test_ghg_scope_classification():
    assert classify_scope("fuel", "Diesel Combustion") == "scope_1"
    assert classify_scope("fuel", "LPG Cylinder") == "scope_1"
    assert classify_scope("electricity", "Grid Electricity") == "scope_2"
    assert classify_scope("transport", "City Transit Bus") == "scope_3"
    assert classify_scope("waste", "Food Waste") == "scope_3"
    assert classify_scope("waste", "Municipal Water Supply") == "scope_3"


def test_anomaly_detection_and_forecasting():
    daily = [
        {"activity_date": "2026-10-01", "emissions_kg": 15.0},
        {"activity_date": "2026-10-02", "emissions_kg": 16.5},
        {"activity_date": "2026-10-03", "emissions_kg": 14.8},
        {"activity_date": "2026-10-04", "emissions_kg": 95.0},  # Massive Spike!
        {"activity_date": "2026-10-05", "emissions_kg": 15.2},
    ]
    anomalies = detect_anomalies(daily)
    assert len(anomalies) >= 1
    assert anomalies[0]["date"] == "2026-10-04"
    assert anomalies[0]["severity"] == "high"

    forecast = forecast_next_period(
        total_kg=150.0,
        prev_total_kg=160.0,
        trend_list=[{"emissions_kg": 180.0}, {"emissions_kg": 165.0}, {"emissions_kg": 150.0}],
    )
    assert forecast["projected_kg"] > 0
    assert forecast["confidence"] >= 0.70


def test_impact_equivalents():
    eq = calculate_impact_equivalents(emissions_kg=220.0, avoided_kg=44.0)
    assert eq["trees_absorption_needed"] == 10.0  # 220 / 22
    assert eq["trees_preserved"] == 2.0  # 44 / 22
    assert eq["money_saved_inr"] > 0


def test_trips_and_campus_endpoints(client):
    # 1. GPS Trip Flow
    trip_start = client.post(
        "/api/trips/start",
        json={"mode": "car", "initial_point": {"latitude": 12.97, "longitude": 77.60, "accuracy": 10.0}},
    )
    assert trip_start.status_code == 201
    trip_id = trip_start.json()["id"]

    # Add points
    add_pts = client.post(
        f"/api/trips/{trip_id}/points",
        json={"points": [{"latitude": 12.99, "longitude": 77.64, "accuracy": 15.0, "timestamp": 1700000300}]},
    )
    assert add_pts.status_code == 200

    # Stop trip
    trip_stop = client.post(
        f"/api/trips/{trip_id}/stop",
        json={"factor_value": 0.170, "factor_name": "Passenger Car"},
    )
    assert trip_stop.status_code == 200
    assert trip_stop.json()["status"] == "completed"

    # List trips
    trips = client.get("/api/trips")
    assert trips.status_code == 200
    assert len(trips.json()) >= 1

    # 2. Campus Food Waste Flow
    cw = client.post(
        "/api/college/food-waste",
        json={
            "date": "2026-10-15",
            "canteen_name": "Central Mess A",
            "meal_type": "Dinner",
            "waste_kg": 45.0,
            "diverted_compost_kg": 15.0,
        },
    )
    assert cw.status_code == 201
    assert cw.json()["emissions_kg"] > 0

    list_cw = client.get("/api/college/food-waste")
    assert list_cw.status_code == 200
    assert len(list_cw.json()) >= 1

    # 3. Campus Bus Flow
    bus = client.post(
        "/api/college/buses",
        json={
            "route_name": "Route 4 - City Center",
            "bus_number": "KA-01-F-1234",
            "distance_km": 35.0,
            "avg_occupancy": 48,
            "fuel_type": "diesel",
        },
    )
    assert bus.status_code == 201
    assert bus.json()["daily_emissions_kg"] > 0

    # 4. Green Challenges & Leaderboard
    ch = client.post(
        "/api/college/challenges",
        json={
            "title": "Hostel Energy Conservation Month",
            "description": "Reduce hostel wing electricity draw by 10% through smart scheduling",
            "category": "electricity",
            "target_reduction_pct": 10.0,
            "start_date": "2026-10-01",
            "end_date": "2026-10-31",
        },
    )
    assert ch.status_code == 201
    ch_id = ch.json()["id"]

    join_ch = client.post(
        f"/api/college/challenges/{ch_id}/join",
        json={"student_name": "Aarav Sharma", "department_or_hostel": "Aryabhatta Hostel Block A"},
    )
    assert join_ch.status_code == 201

    leaderboard = client.get("/api/college/leaderboard")
    assert leaderboard.status_code == 200
    assert len(leaderboard.json()) >= 1

    # 5. Organization Endpoints
    scopes = client.get("/api/organization/scopes")
    assert scopes.status_code == 200
    assert len(scopes.json()) == 3

    advisor = client.get("/api/organization/advisor")
    assert advisor.status_code == 200
