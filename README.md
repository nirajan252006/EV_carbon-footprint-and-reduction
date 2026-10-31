# GreenTrack — Carbon Intelligence Platform
## Reliable Calculations + Explainable AI + Bill OCR + IoT Monitoring + Progress Analytics

GreenTrack is a full-stack sustainability tracking and reduction platform designed for **Individuals, Colleges, and Organizations**. Built with **React 18 + TypeScript + Vite + TailwindCSS** on the frontend and **FastAPI + SQLite + PyMuPDF** on the backend.

---

## 1. Five Major Platform Capabilities

1. **Reliable Carbon Footprint Engine**:
   - Single reusable backend calculation service (`backend/app/carbon.py`).
   - Formula: $\text{Emissions in kg CO}_2\text{e} = \text{Activity quantity} \times \text{Applicable emission factor}$.
   - Automatic unit normalization:
     - Electricity: `kWh`, `MWh` ($1000\times$), `Wh` ($0.001\times$)
     - Transportation: `km`, `miles` ($1.609\times$), `passenger-km`
     - Fuel: `L`, `gallons` ($3.785\times$), `kg`, LPG cylinders ($14.2\text{ kg}$)
     - Waste: `kg`, `tonnes` ($1000\times$), `grams`, `lbs`
   - Sourced and traceable reference factor registry (CEA Grid 0.710 kgCO2e/kWh, EPA Petrol/Diesel, DEFRA Passenger Transit, WARM Waste).

2. **Explainable AI (XAI) Intelligence**:
   - Transparent formula inspection for every activity (`quantity × factor = emissions`).
   - Grounded natural-language synthesis (deterministic offline template fallback + optional OpenAI narrative).
   - Largest contributor ranking and percentage of total emissions.
   - Period-over-period comparison ($((B - C)/B) \times 100$) without manufactured data.
   - Scenario-based reduction opportunities with explicit math (e.g. $15\% \times 350\text{ kg} = 52.5\text{ kg CO}_2\text{e}$ avoided).
   - Uncertainty, factor reliability, and data origin disclosures.

3. **Electricity Bill Scanner & OCR**:
   - Accepts PDF, JPG, PNG, TIFF, and BMP utility bills (up to 10 MB).
   - Dual-engine architecture: extracts selectable text using **PyMuPDF / pypdf**, with portable **Tesseract OCR** fallback for scanned documents and images.
   - High-precision regex filters: isolates billed units (kWh) and billing period ($YYYY-MM$) while rejecting meter IDs, account numbers, and currency amounts.
   - Interactive verification UI with confidence scoring, evidence snippets, and manual confirmation.

4. **IoT Household Energy & Environmental Monitoring**:
   - Live ingestion endpoint: `POST /api/iot/readings` with device credential/token support.
   - Validates Voltage (V), Current (A), Power (W), Cumulative Energy (kWh), Temperature (°C), Humidity (%).
   - True interval energy calculation from consecutive readings: $\Delta\text{kWh} = \text{current} - \text{previous}$ with meter rollover & reset handling (no cumulative summation errors).
   - Honest device health tracking: `Online` ($\le 5\text{m}$), `Stale` ($5-30\text{m}$), `Offline` ($>30\text{m}$), plus reading age.
   - Built-in simulation mode (`POST /api/iot/simulate`) for interactive demonstration without physical hardware.

5. **Historical Analytics & Reduction Goals**:
   - Goal management: baseline period, baseline emissions, target reduction %, calculated target kg, target deadline, and status tracking.
   - Time-series trend analytics, category breakdown charts, and CSV report export.

---

## 2. IoT Hardware Integration Guide (ESP32)

### Supported Hardware
- **Microcontroller**: ESP32 DevKit (or ESP8266 / Raspberry Pi Pico W)
- **Power Sensor**: PZEM-004T (V3.0) or ACS712 / CT Current Clamp
- **Environment Sensor**: DHT11 / DHT22 (Temperature & Humidity)

> [!CAUTION]
> **Electrical Safety Warning**: Mains electricity AC (110V/230V) carries lethal voltages. All physical current transformers and mains connections must only be installed by a qualified electrician or tested with safe low-voltage simulation.

### Hardware Connection & Network Configuration
1. Connect ESP32 to your local Wi-Fi network.
2. Target the host machine's LAN IP address (e.g., `http://192.168.1.50:8001/api/iot/readings`).
   - Do **NOT** use `127.0.0.1` on the ESP32, as it refers to the microcontroller itself.
3. Transmit JSON payloads via HTTP POST:

```json
POST /api/iot/readings HTTP/1.1
Host: 192.168.1.50:8001
Content-Type: application/json
X-Device-Token: esp32-device-secret-token

{
  "device_id": "esp32-household-01",
  "voltage": 230.2,
  "current": 4.15,
  "power": 955.3,
  "energy_kwh": 120.45,
  "temperature": 25.6,
  "humidity": 52.0
}
```

---

## 3. Running Locally on Windows

### Prerequisites
- Python 3.10+ (tested on Python 3.11)
- Node.js 20+ and npm

### Backend Startup

From the project root:

```powershell
# 1. Install dependencies
python -m pip install -r backend\requirements.txt

# 2. Start FastAPI on port 8001
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8001
```

Backend will be live at `http://127.0.0.1:8001`.

### Frontend Startup

In a separate terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL: `http://127.0.0.1:5173`.
Vite dev server proxies `/api` directly to `http://127.0.0.1:8001`.

---

## 4. API Endpoints Reference

### Health & Status
- `GET /api/health` — Application availability, database connection, OCR engine info, IoT status, AI status.

### Carbon Tracking & Factors
- `GET/PUT /api/workspace` — Read or configure workspace profile.
- `GET/POST /api/factors` — Sourced emission factors with traceability URLs.
- `POST /api/factors/seed` — Initialize verified reference factor set (CEA, EPA, DEFRA).
- `GET/POST /api/activities` — Log and calculate activity records.
- `DELETE /api/activities/{id}` — Remove activity record.
- `GET /api/dashboard?period=YYYY-MM` — Dashboard totals, trend, category mix.
- `GET /api/reports.csv?period=YYYY-MM` — Period-scoped CSV export with factor provenance.

### Bill OCR & Electricity
- `POST /api/electricity/analyze-bill` — Multipart bill upload (PDF, PNG, JPG, TIFF, BMP), extracts units and period.
- `POST /api/electricity/calculate` — Confirms and records bill electricity consumption (`data_origin = 'ocr_bill'`).

### Explainable AI & Reduction Intelligence
- `GET /api/explainable-ai?period=YYYY-MM` — Structured XAI breakdown: what happened, largest contributor, activity traces, recommendations with math, and uncertainty notes.
- `GET /api/carbon-explanation?period=YYYY-MM` — Narrative explanation endpoint.

### IoT Household Monitoring
- `POST /api/iot/readings` — Device telemetry ingestion.
- `GET /api/iot/latest?device_id=...` — Most recent reading, device health, and freshness.
- `GET /api/iot/history?device_id=...&hours=24` — Time-series reading history.
- `GET /api/iot/summary?device_id=...&period=YYYY-MM` — Consecutive delta kWh calculation and emissions.
- `POST /api/iot/simulate` — Injects realistic simulated ESP32 reading for testing/demonstration.

### Reduction Goals
- `GET /api/goals` — List active reduction goals.
- `POST /api/goals` — Commit to reduction target: calculates target kg from baseline.
- `PATCH /api/goals/{id}/status` — Update goal status (`achieved`, `active`, `cancelled`).

---

## 5. Automated Verification

Run backend unit and integration test suite:

```powershell
python -m pytest backend\tests -v
```

Run frontend production build and security audit:

```powershell
cd frontend
npm run build
npm audit
```
