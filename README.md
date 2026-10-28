# GreenTrack — Carbon Footprint Tracking

GreenTrack is a React + TypeScript sustainability tracking prototype backed by
FastAPI and SQLite. Its visual direction and household-first activity flow are
based on the preserved `GreenTrack_redesigned.pptx` deck.

## Features

- Individual, College, and Organization workspace onboarding.
- Electricity, transport, fuel, and waste activity entry.
- Deterministic `quantity × factor` calculation with category and unit checks.
- Emission factors retain name, value, unit, publication, URL, year, region, and
  assumptions; each activity stores an immutable factor snapshot.
- Persisted monthly totals, category mix, trend, largest contributors, a monthly
  target, qualitative recommendations, and CSV export.
- Document RAG assistant for PDF, TXT, and Markdown sources: extraction,
  chunking, OpenAI embeddings, SQLite vector persistence, similarity retrieval,
  cited answer generation, and an insufficient-evidence response.
- React Router page navigation, responsive Tailwind styling, Framer Motion
  transitions, Recharts analytics, and Lucide icons.

## Scope and limitations

- This is a **single local workspace prototype**, not an authenticated or
  multi-user service. Workspace type selection is onboarding, not sign-in. There
  are no user accounts, roles, tenant boundaries, or access controls. Uploaded
  RAG sources are shared by the local instance; do not use private documents or
  deploy this as a multi-organization service without adding authorization.
- Emission factors are not preloaded. This repository does not bundle a verified,
  current, region-specific factor set. Add values only after checking their
  original source; the application does not independently verify user-submitted
  factors and does not silently substitute generic values. Factor units use
  `kgCO2e/<activity unit>`, for example `kgCO2e/kWh`.
- Recommendations are deterministic qualitative prompts based on recorded
  categories. They do not claim or quantify savings. Targets and period changes
  are not proof that reductions were achieved.
- CSV export is implemented; PDF export and challenges/rewards are not.
- RAG is for questions grounded in guidance documents, not carbon calculations.
  Retrieved passages enter generation as untrusted evidence, and responses must
  cite sources returned by retrieval. RAG requires an OpenAI key; carbon tracking
  works without it.

## Architecture

```text
React + TypeScript + Vite
  ├─ centralized typed API client ── /api (Vite proxy in development)
  └─ onboarding, dashboard, activity, factors, assistant routes
                │
FastAPI        ├─ carbon calculation service → SQLite
                └─ RAG ingestion → embeddings → similarity retrieval
                     → evidence context in LLM prompt → cited response
```

Core records are stored in SQLite tables `workspace`, `emission_factors`, and
`activities`. Activity records keep the input, result, period, and factor source
snapshot. RAG documents and chunks are stored in `documents` and `chunks`.
FastAPI serves the production React build from `frontend/dist`.

## Run locally

Requirements: Python 3.10+ and Node.js 20+.

### Backend

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8000
```

SQLite tables are initialized on startup. Add an OpenAI key to the **backend
environment only** to enable RAG:

```powershell
$env:OPENAI_API_KEY = "your-key"
```

### React frontend

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the Vite URL (normally `http://127.0.0.1:5173`). Requests to `/api` are
proxied to `http://127.0.0.1:8000`; set `GREENTRACK_API_URL` before starting Vite
to use another backend address. For a production frontend, run `npm run build`
from `frontend`, then start FastAPI; the backend serves the compiled app and
React routes from its root.

`VITE_API_BASE_URL` can be set in a frontend `.env.local` for a separately hosted
API. It is a public API URL, not a place for secrets.

Optional backend environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `GREENTRACK_DATABASE` | `greentrack.sqlite3` in the repository root | SQLite database path |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | RAG embedding model |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | RAG answer model |
| `RAG_TOP_K` | `4` | Maximum retrieved chunks |
| `RAG_SIMILARITY_THRESHOLD` | `0.3` | Minimum cosine similarity |
| `RAG_CHUNK_SIZE` | `900` | Chunk length in characters |
| `RAG_CHUNK_OVERLAP` | `120` | Overlap between chunks |

## API summary

Carbon tracking:

- `GET/PUT /api/workspace` — read or configure the local profile.
- `GET/POST /api/factors` — list or add source-documented factors.
- `GET/POST /api/activities` — list or calculate and save activities.
- `DELETE /api/activities/{id}` — delete an activity.
- `GET /api/dashboard?period=YYYY-MM` — totals, category distribution, and trend.
- `GET /api/recommendations?period=YYYY-MM` — qualitative category guidance.
- `PUT /api/targets` — configure the monthly target.
- `GET /api/reports.csv?period=YYYY-MM` — period-scoped source-rich CSV.

Knowledge assistant:

- `GET /api/health` — application, provider, workspace, and document status.
- `GET /api/documents` — list indexed source metadata.
- `POST /api/documents` — upload multipart `file`, optional `source_url`.
- `POST /api/documents/sample` — index bundled GHG Protocol source notes.
- `DELETE /api/documents/{id}` — remove a document and its chunks.
- `POST /api/chat` — JSON `{"question":"..."}`; returns answer, citations, and
  an insufficient-evidence flag.

Uploads accept PDF, TXT, and Markdown up to 10 MB. Image-only PDFs are not
OCR'd. Duplicate content is detected by SHA-256.

## Advanced analytics

The role-aware advanced analytics page is available at `/<role>/analytics` for Individual, College and Organization workspaces. It provides trend, category, contributor, Pareto, treemap, heatmap, scenario, quality, anomaly and benchmark views with URL-synchronized period/category/department filters, CSV tables, fullscreen/chart actions, calculation inspection and print/PDF export.

FastAPI analytics endpoints are exposed at `GET /api/analytics/{metric}`, where `metric` is `summary`, `timeseries`, `breakdown`, `top_contributors`, `compare`, `forecast`, `anomalies`, `what_if`, `correlation`, `heatmap`, `abatement`, `pathway`, `data_quality`, or `benchmark`. Supported filters are `period`, `category`, `department`, `months`, `change_pct`, `switch_mode`, and `add_solar_kwh`. All responses include role/period metadata, factor-name/version/source information, cache TTL metadata, and an illustrative-demo-data flag. Forecasts, scenarios, benchmarks and absent data integrations are explicitly labeled estimated or proposed.

## Verification

```powershell
python -m pytest backend\tests -q
cd frontend
npm run build
npm audit
```

Backend tests cover factor/unit validation, calculation correctness, dashboard
aggregation, trends, targets, CSV data, document ingestion/retrieval, source
citations, duplicate uploads, deletion, and missing AI credentials. Provider
calls are tested with a fake provider. Live embeddings and LLM generation need
credentials and were not verified in the test suite.
