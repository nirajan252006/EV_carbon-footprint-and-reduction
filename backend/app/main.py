import logging
import csv
import io
import math
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import database
from .carbon import calculate_emissions_kg
from .config import MAX_UPLOAD_BYTES, OPENAI_API_KEY, ROOT_DIR
from .rag import ProviderError, ProviderUnavailable, RagService, is_provider_error

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize_database()
    yield


app = FastAPI(title="GreenTrack Carbon Platform", lifespan=lifespan)


def _json_safe(value: object) -> object:
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


@app.exception_handler(RequestValidationError)
async def validation_error_response(
    _request: Request, error: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(_json_safe(error.errors()))},
    )


class ChatRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class WorkspaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    account_type: str
    region: str = Field(min_length=2, max_length=120)

    @field_validator("account_type")
    @classmethod
    def valid_account_type(cls, value: str) -> str:
        if value not in {"individual", "college", "organization"}:
            raise ValueError("Choose individual, college, or organization.")
        return value


class FactorRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    category: str
    name: str = Field(min_length=2, max_length=120)
    value: float = Field(ge=0, le=1_000_000)
    unit: str = Field(min_length=5, max_length=40)
    source_name: str = Field(min_length=2, max_length=160)
    source_url: str = Field(min_length=8, max_length=2000)
    factor_year: int = Field(ge=1900, le=2100)
    region: str = Field(min_length=2, max_length=120)
    assumptions: str = Field(default="", max_length=1000)

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        if value not in {"electricity", "transport", "fuel", "waste"}:
            raise ValueError("Choose electricity, transport, fuel, or waste.")
        return value

    @field_validator("source_url")
    @classmethod
    def valid_source_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Factor source must be an HTTP or HTTPS URL.")
        return value

    @field_validator("unit")
    @classmethod
    def valid_factor_unit(cls, value: str) -> str:
        parts = value.split("/")
        if len(parts) != 2 or parts[0] != "kgCO2e" or not parts[1].strip():
            raise ValueError("Use a factor unit like kgCO2e/kWh or kgCO2e/L.")
        return value


class ActivityRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    category: str
    description: str = Field(min_length=2, max_length=160)
    quantity: float = Field(gt=0, le=1_000_000_000)
    unit: str = Field(min_length=1, max_length=20)
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    reporting_unit: str = Field(default="", max_length=120)
    factor_id: str = Field(min_length=1, max_length=64)

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        if value not in {"electricity", "transport", "fuel", "waste"}:
            raise ValueError("Choose electricity, transport, fuel, or waste.")
        return value


class TargetRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    monthly_target_kg: float | None = Field(default=None, gt=0, le=1_000_000_000)


def service() -> RagService:
    try:
        return RagService()
    except ProviderUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "ai_provider_configured": bool(OPENAI_API_KEY),
        "indexed_documents": database.count_documents(),
        "workspace_configured": database.get_workspace() is not None,
    }


@app.get("/api/workspace")
def workspace() -> dict[str, object] | None:
    return database.get_workspace()


@app.put("/api/workspace")
def configure_workspace(request: WorkspaceRequest) -> dict[str, object]:
    return database.save_workspace(request.name.strip(), request.account_type, request.region.strip())


@app.get("/api/factors")
def factors(category: str | None = Query(default=None)) -> list[dict[str, object]]:
    if category and category not in {"electricity", "transport", "fuel", "waste"}:
        raise HTTPException(status_code=422, detail="Invalid emissions category.")
    return database.list_factors(category)


@app.post("/api/factors", status_code=201)
def add_factor(request: FactorRequest) -> dict[str, object]:
    if not database.get_workspace():
        raise HTTPException(status_code=409, detail="Set up a workspace before adding factors.")
    return database.save_factor(
        request.category,
        request.name.strip(),
        request.value,
        request.unit,
        request.source_name.strip(),
        request.source_url,
        request.factor_year,
        request.region.strip(),
        request.assumptions.strip(),
    )


@app.get("/api/activities")
def activities(period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")) -> list[dict[str, object]]:
    return database.list_activities(period)


@app.post("/api/activities", status_code=201)
def add_activity(request: ActivityRequest) -> dict[str, object]:
    if not database.get_workspace():
        raise HTTPException(status_code=409, detail="Set up a workspace before recording activity.")
    factor = database.get_factor(request.factor_id)
    if not factor:
        raise HTTPException(status_code=404, detail="Emission factor not found.")
    try:
        emissions_kg = calculate_emissions_kg(
            request.quantity, request.unit, request.category, factor
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return database.save_activity(
        request.category,
        request.description.strip(),
        request.quantity,
        request.unit,
        request.period,
        request.reporting_unit.strip(),
        factor,
        emissions_kg,
    )


@app.delete("/api/activities/{activity_id}", status_code=204)
def remove_activity(activity_id: str) -> None:
    if not database.delete_activity(activity_id):
        raise HTTPException(status_code=404, detail="Activity record not found.")


@app.get("/api/dashboard")
def dashboard(period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")) -> dict[str, object]:
    selected_period = period or datetime.now().strftime("%Y-%m")
    return database.get_dashboard(selected_period)


@app.put("/api/targets")
def update_target(request: TargetRequest) -> dict[str, float | None]:
    if not database.get_workspace():
        raise HTTPException(status_code=409, detail="Set up a workspace before setting a target.")
    database.set_monthly_target(request.monthly_target_kg)
    return {"monthly_target_kg": request.monthly_target_kg}


@app.get("/api/recommendations")
def recommendations(period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")) -> list[dict[str, object]]:
    data = database.get_dashboard(period or datetime.now().strftime("%Y-%m"))
    suggestions = {
        "electricity": "Review high-load equipment schedules and prioritize efficiency improvements.",
        "transport": "Review frequent trips and consider shared, public, or lower-emission travel options.",
        "fuel": "Review fuel-consuming operations, maintenance, and avoidable idling.",
        "waste": "Measure waste streams and improve reduction, reuse, and segregation practices.",
    }
    return [
        {
            "category": row["category"],
            "reason": f"{row['category'].title()} is a measured emissions contributor this period.",
            "action": suggestions[str(row["category"])],
            "estimated_savings_kg": None,
            "savings_note": "No savings estimate is shown because activity-specific reduction evidence is not available.",
        }
        for row in data["categories"]
    ]


@app.get("/api/reports.csv")
def report_csv(period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")) -> StreamingResponse:
    selected_period = period or datetime.now().strftime("%Y-%m")
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    workspace = database.get_workspace()
    if workspace:
        writer.writerow(["Workspace", _safe_csv_text(workspace["name"])])
        writer.writerow(["Account type", workspace["account_type"]])
        writer.writerow(["Region", _safe_csv_text(workspace["region"])])
    writer.writerow(["Reporting period", selected_period])
    writer.writerow([])
    writer.writerow([
        "Period", "Category", "Activity", "Reporting unit", "Quantity", "Unit",
        "Emissions (kg CO2e)", "Factor name", "Factor value", "Factor unit", "Factor year",
        "Factor region", "Factor source", "Factor source URL", "Assumptions",
    ])
    for row in database.list_activities(selected_period):
        writer.writerow([
            row["period"], row["category"], _safe_csv_text(row["description"]),
            _safe_csv_text(row["reporting_unit"]),
            row["quantity"], row["unit"], row["emissions_kg"],
            _safe_csv_text(row["factor_name"]), row["factor_value"],
            row["factor_unit"], row["factor_year"], _safe_csv_text(row["factor_region"]),
            _safe_csv_text(row["factor_source"]), _safe_csv_text(row["factor_source_url"]),
            _safe_csv_text(row["assumptions"]),
        ])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="greentrack-{selected_period}.csv"'},
    )


def _safe_csv_text(value: object) -> str:
    text = str(value)
    if text.lstrip().startswith(("=", "+", "-", "@")):
        return f"'{text}"
    return text


@app.get("/api/documents")
def documents() -> list[dict[str, object]]:
    return database.list_documents()


@app.post("/api/documents", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    source_url: str | None = Form(default=None, max_length=2000),
) -> dict[str, object]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required.")
    if Path(file.filename).suffix.lower() not in {".pdf", ".txt", ".md"}:
        raise HTTPException(status_code=415, detail="Only PDF, TXT, and Markdown files are supported.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The upload exceeds the 10 MB limit.")
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded document is empty.")
    if source_url:
        parsed_url = urlparse(source_url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise HTTPException(status_code=400, detail="Source URL must use HTTP or HTTPS.")

    rag = service()
    try:
        return await run_in_threadpool(rag.ingest, file.filename, content, source_url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        if is_provider_error(error):
            logger.exception("Document embedding failed.")
            raise HTTPException(
                status_code=502,
                detail="Document embedding failed. Check provider availability and try again.",
            ) from error
        raise


@app.post("/api/documents/sample", status_code=201)
def add_sample_document() -> dict[str, object]:
    sample_path = Path(__file__).resolve().parents[1] / "seed_documents" / "ghg-protocol-corporate-standard.md"
    rag = service()
    try:
        return rag.ingest(
            sample_path.name,
            sample_path.read_bytes(),
            "https://ghgprotocol.org/corporate-standard",
        )
    except OSError as error:
        logger.exception("Bundled source document could not be read.")
        raise HTTPException(status_code=500, detail="The bundled source document is unavailable.") from error
    except Exception as error:
        if is_provider_error(error):
            logger.exception("Bundled source document embedding failed.")
            raise HTTPException(
                status_code=502,
                detail="Document embedding failed. Check provider availability and try again.",
            ) from error
        raise


@app.delete("/api/documents/{document_id}", status_code=204)
def remove_document(document_id: str) -> None:
    if not database.delete_document(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict[str, object]:
    question = request.question.strip()
    if len(question) < 3:
        raise HTTPException(status_code=422, detail="Question must contain at least 3 non-space characters.")
    rag = service()
    try:
        return rag.chat(question)
    except Exception as error:
        if is_provider_error(error):
            logger.exception("Knowledge assistant request failed.")
            raise HTTPException(
                status_code=502,
                detail="The AI provider could not complete this request. Please try again.",
            ) from error
        raise


FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"
if FRONTEND_ASSETS.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS), name="assets")


@app.get("/", include_in_schema=False)
def index() -> Response:
    built_index = FRONTEND_DIST / "index.html"
    if built_index.is_file():
        return FileResponse(built_index)
    return HTMLResponse(
        "<!doctype html><title>GreenTrack</title><p>Build the React frontend with "
        "<code>cd frontend; npm install; npm run build</code>.</p>"
    )


@app.get("/{frontend_path:path}", include_in_schema=False)
def frontend_route(frontend_path: str) -> Response:
    if frontend_path == "api" or frontend_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found.")
    return index()
