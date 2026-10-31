import uuid
import requests

s = requests.Session()
base = 'http://127.0.0.1:8001'

# 1. Register test user
user_email = f"alan.{uuid.uuid4().hex[:6]}@carbonintel.org"
reg = s.post(f"{base}/api/auth/register", json={
    "full_name": "Dr. Alan Turing",
    "email": user_email,
    "password": "super-secure-pass-1234",
    "account_type": "college",
    "workspace_name": "Alan Turing Institute of Sustainability",
    "location": "UK"
})
print("1. Register status:", reg.status_code)
assert reg.status_code == 201

csrf = s.cookies.get("greentrack_csrf")
if csrf:
    s.headers["X-CSRF-Token"] = csrf

# 2. Configure workspace
ws = s.put(f"{base}/api/workspace", json={
    "name": "Alan Turing Institute of Sustainability",
    "account_type": "college",
    "region": "Global",
    "profile_name": "Campus Main",
    "profile_detail": "Engineering Wing"
})
print("2. Workspace status:", ws.status_code)
assert ws.status_code == 200

# 3. Seed reference factors
seed = s.post(f"{base}/api/factors/seed")
print("3. Seed factors status:", seed.status_code, seed.json())
assert seed.status_code == 201

# 4. Calculate electricity bill
elec = s.post(f"{base}/api/electricity/calculate", json={
    "quantity": 450.0,
    "period": "2026-10",
    "description": "Main Campus Electrical Bill",
    "reporting_unit": "Campus Main"
})
print("4. Electricity calculate status:", elec.status_code, "Emissions kg:", elec.json()["emissions_kg"])
assert elec.status_code == 201
assert elec.json()["emissions_kg"] > 0

# 5. Ingest IoT reading
iot_read = s.post(f"{base}/api/iot/readings", json={
    "device_id": "esp32-campus-meter",
    "voltage": 230.2,
    "current": 4.15,
    "power": 955.3,
    "energy_kwh": 120.4,
    "temperature": 24.8,
    "humidity": 52.0
})
print("5. IoT ingest status:", iot_read.status_code, "Health:", iot_read.json()["device_health"]["status"])
assert iot_read.status_code == 201
assert iot_read.json()["device_health"]["status"] == "online"

# 6. Fetch Explainable AI
xai = s.get(f"{base}/api/explainable-ai?period=2026-10")
print("6. Explainable AI status:", xai.status_code)
assert xai.status_code == 200
x_data = xai.json()
print("   What Happened:", x_data["what_happened"][:120] + "...")
print("   Largest Contributor:", x_data["largest_contributor"])
print("   Recommendations count:", len(x_data["recommendations"]))

# 7. Create reduction goal
goal = s.post(f"{base}/api/goals", json={
    "title": "Campus 15% Electricity Reduction Goal",
    "category": "electricity",
    "baseline_period": "2026-10",
    "baseline_emissions_kg": x_data["total_emissions_kg"],
    "target_reduction_pct": 15.0,
    "target_period": "2026-12"
})
print("7. Goal create status:", goal.status_code, "Target kg:", goal.json()["target_emissions_kg"])
assert goal.status_code == 201

# 8. Fetch IoT latest
latest = s.get(f"{base}/api/iot/latest")
print("8. IoT Latest status:", latest.status_code, "Device:", latest.json()["latest_reading"]["device_id"])
assert latest.status_code == 200
assert latest.json()["latest_reading"]["device_id"] == "esp32-campus-meter"

print("\n>>> ALL 8 END-TO-END FLOWS VERIFIED SUCCESSFULLY ON RUNNING SYSTEM! <<<")
