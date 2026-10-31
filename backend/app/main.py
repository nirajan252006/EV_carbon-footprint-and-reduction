import logging
from typing import Any
import csv
import io
import math
import re
import secrets
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
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
from .auth import hash_password, hash_token, new_session_token, verify_password
from .carbon import calculate_emissions_kg, calculate_activity_carbon, REFERENCE_FACTORS
from . import bill_ocr
from . import iot as iot_service
from . import explainable_ai
from fastapi.middleware.cors import CORSMiddleware
from . import analytics as analytics_service
from .config import (
    COOKIE_SECURE,
    CSRF_COOKIE_NAME,
    MAX_UPLOAD_BYTES,
    OPENAI_API_KEY,
    ROOT_DIR,
    SESSION_COOKIE_NAME,
    SESSION_TTL_SECONDS,
)
from .rag import OpenAIProvider, ProviderError, ProviderUnavailable, RagService, is_provider_error

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize_database()
    yield


app = FastAPI(title="GreenTrack Carbon Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PUBLIC_API = {
    ("GET", "/api/health"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/iot/readings"),
}
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@app.middleware("http")
async def authenticate_api_requests(request: Request, call_next):
    if not request.url.path.startswith("/api/"):
        return await call_next(request)

    token = request.cookies.get(SESSION_COOKIE_NAME)
    session = None
    if token:
        session = database.get_session(hash_token(token), _utc_now().strftime("%Y-%m-%dT%H:%M:%SZ"))
        if session:
            request.state.principal = session

    if (request.method, request.url.path) in PUBLIC_API:
        return await call_next(request)

    # Allow IoT ingestion via device token or session
    if request.url.path == "/api/iot/readings" and request.method == "POST":
        device_token = request.headers.get("X-Device-Token") or request.headers.get("Authorization", "").replace("Bearer ", "")
        if device_token:
            request.state.device_token = device_token
            return await call_next(request)
        if session:
            return await call_next(request)
        # If no session and no device token, allow device registration/ingestion with default device header
        device_id_hdr = request.headers.get("X-Device-Id")
        if device_id_hdr:
            request.state.device_id_hdr = device_id_hdr
            return await call_next(request)

    if not session:
        return JSONResponse(status_code=401, content={"detail": "Sign in to continue."})

    if request.method in UNSAFE_METHODS and request.url.path != "/api/iot/readings":
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME, "")
        csrf_header = request.headers.get("X-CSRF-Token", "")
        if (
            not csrf_cookie
            or not csrf_header
            or not secrets.compare_digest(csrf_cookie, csrf_header)
            or not secrets.compare_digest(hash_token(csrf_cookie), session["csrf_hash"])
        ):
            return JSONResponse(status_code=403, content={"detail": "CSRF token is missing or invalid."})

    return await call_next(request)


def current_principal(request: Request) -> dict[str, object]:
    principal = getattr(request.state, "principal", None)
    if not principal:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return principal


def require_admin(request: Request) -> dict[str, object]:
    principal = current_principal(request)
    if principal["role"] not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Workspace administrator permission is required.")
    return principal


def require_onboarding(principal: dict[str, object]) -> str:
    if not principal["onboarding_complete"]:
        raise HTTPException(status_code=409, detail="Complete onboarding before using this feature.")
    return str(principal["workspace_id"])


def create_authenticated_session(
    response: Response, user_id: str
) -> tuple[str, str]:
    session_token = new_session_token()
    csrf_token = new_session_token()
    expiry = (_utc_now() + timedelta(seconds=SESSION_TTL_SECONDS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    database.create_session(
        hash_token(session_token), hash_token(csrf_token), user_id, expiry
    )
    cookie_options = {
        "httponly": True,
        "secure": COOKIE_SECURE,
        "samesite": "strict",
        "path": "/",
        "max_age": SESSION_TTL_SECONDS,
    }
    response.set_cookie(SESSION_COOKIE_NAME, session_token, **cookie_options)
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
        max_age=SESSION_TTL_SECONDS,
    )
    return session_token, csrf_token


def auth_payload(principal: dict[str, object]) -> dict[str, object]:
    return {
        "user": {
            "id": principal["user_id"],
            "email": principal["email"],
            "full_name": principal["full_name"],
            "account_type": principal["account_type"],
            "role": principal["role"],
        },
        "workspace": database.get_workspace(str(principal["workspace_id"])),
        "onboarding_complete": bool(principal["onboarding_complete"]),
    }


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


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=128)
    account_type: str
    workspace_name: str | None = Field(default=None, min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("full_name")
    @classmethod
    def nonempty_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Name must contain at least 2 non-space characters.")
        return cleaned

    @field_validator("account_type")
    @classmethod
    def valid_account_type(cls, value: str) -> str:
        if value not in {"individual", "college", "organization"}:
            raise ValueError("Choose individual, college, or organization.")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalized_email(cls, value: str) -> str:
        return value.strip().lower()


class WorkspaceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    account_type: str
    region: str = Field(min_length=2, max_length=120)
    profile_name: str = Field(default="", max_length=160)
    profile_detail: str = Field(default="", max_length=160)

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
    description: str = Field(default="", max_length=160)
    quantity: float = Field(gt=0, le=1_000_000_000)
    unit: str = Field(min_length=1, max_length=20)
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    activity_date: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
    reporting_unit: str = Field(default="", max_length=120)
    factor_id: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        if value not in {"electricity", "transport", "fuel", "waste"}:
            raise ValueError("Choose electricity, transport, fuel, or waste.")
        return value

    @field_validator("activity_date")
    @classmethod
    def valid_activity_date(cls, value: str | None) -> str | None:
        if value:
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError as error:
                raise ValueError("Activity date must be a valid calendar date.") from error
        return value


class TargetRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    monthly_target_kg: float | None = Field(default=None, gt=0, le=1_000_000_000)


class TripStartRequest(BaseModel):
    mode: str = Field(default="car", max_length=40)
    initial_point: dict[str, Any] | None = None


class TripPointsBatchRequest(BaseModel):
    points: list[dict[str, Any]]


class TripStopRequest(BaseModel):
    factor_value: float | None = None
    factor_name: str | None = None


class FacilityCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    site_type: str = Field(default="academic", max_length=40)
    area_sqft: float = Field(default=0.0, ge=0)
    baseline_kwh: float = Field(default=0.0, ge=0)
    baseline_water_l: float = Field(default=0.0, ge=0)


class FoodWasteCreateRequest(BaseModel):
    date: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
    canteen_name: str = Field(min_length=2, max_length=100)
    meal_type: str = Field(default="Lunch", max_length=40)
    waste_kg: float = Field(gt=0, le=50000)
    diverted_compost_kg: float = Field(default=0.0, ge=0)


class CampusBusCreateRequest(BaseModel):
    route_name: str = Field(min_length=2, max_length=120)
    bus_number: str = Field(min_length=1, max_length=40)
    distance_km: float = Field(gt=0, le=1000)
    avg_occupancy: int = Field(gt=0, le=150)
    fuel_type: str = Field(default="diesel", max_length=30)


class EventEmissionCreateRequest(BaseModel):
    event_name: str = Field(min_length=2, max_length=160)
    event_date: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
    attendees: int = Field(gt=0, le=100000)
    duration_hours: float = Field(gt=0, le=240)
    generator_kwh: float = Field(default=0.0, ge=0)
    meals_served: int = Field(default=0, ge=0)
    travel_km: float = Field(default=0.0, ge=0)


class GreenChallengeCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=5, max_length=500)
    category: str = Field(max_length=40)
    target_reduction_pct: float = Field(gt=0, le=100)
    start_date: str
    end_date: str


class ChallengeJoinRequest(BaseModel):
    student_name: str = Field(min_length=2, max_length=120)
    department_or_hostel: str = Field(min_length=2, max_length=120)


class BulkImportRow(BaseModel):
    category: str
    description: str
    quantity: float
    unit: str
    period: str
    reporting_unit: str = ""


class BulkImportRequest(BaseModel):
    rows: list[BulkImportRow]


@app.post("/api/auth/register", status_code=201)
def register(request: RegisterRequest, response: Response) -> dict[str, object]:
    try:
        user = database.create_account(
            request.email,
            request.full_name,
            request.account_type,
            hash_password(request.password),
            request.workspace_name,
            request.location,
        )
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        if isinstance(error, sqlite3.IntegrityError):
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists.",
            ) from error
        raise
    session_token, _ = create_authenticated_session(response, str(user["id"]))
    session = database.get_session(
        hash_token(session_token), _utc_now().strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    if not session:
        raise HTTPException(status_code=500, detail="The account session could not be created.")
    return auth_payload(session)


@app.post("/api/auth/login")
def login(request: LoginRequest, response: Response) -> dict[str, object]:
    user = database.get_user_by_email(request.email)
    if not user or not verify_password(request.password, str(user["password_hash"])):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    session_token, _ = create_authenticated_session(response, str(user["id"]))
    session = database.get_session(
        hash_token(session_token), _utc_now().strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    if not session:
        raise HTTPException(status_code=500, detail="The login session could not be created.")
    return auth_payload(session)


@app.get("/api/auth/me")
def authenticated_user(request: Request) -> dict[str, object]:
    return auth_payload(current_principal(request))


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response) -> Response:
    current_principal(request)
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        database.delete_session(hash_token(token))
    response.delete_cookie(
        SESSION_COOKIE_NAME, path="/", secure=COOKIE_SECURE, httponly=True, samesite="strict"
    )
    response.delete_cookie(
        CSRF_COOKIE_NAME, path="/", secure=COOKIE_SECURE, httponly=False, samesite="strict"
    )
    response.status_code = 204
    return response


def service(workspace_id: str) -> RagService:
    try:
        return RagService(workspace_id)
    except ProviderUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/health")
def health(request: Request) -> dict[str, object]:
    principal = getattr(request.state, "principal", None)
    workspace_id = str(principal["workspace_id"]) if principal else None
    ocr_info = bill_ocr.get_ocr_engine_info()
    active_iot = len(database.list_iot_devices(workspace_id)) if workspace_id else 0
    return {
        "status": "ok",
        "database": "connected",
        "ai_provider_configured": bool(OPENAI_API_KEY),
        "ocr_available": bool(ocr_info["pymupdf_available"] or ocr_info["pypdf_available"]),
        "ocr_engine": "tesseract" if ocr_info["tesseract_installed"] else ("pdf_text_extractor" if ocr_info["pymupdf_available"] else "none"),
        "tesseract_installed": ocr_info["tesseract_installed"],
        "iot_configured": active_iot > 0,
        "iot_active_devices": active_iot,
        "indexed_documents": database.count_documents(workspace_id) if workspace_id else 0,
        "workspace_configured": bool(principal and principal["onboarding_complete"]),
    }


@app.get("/api/workspace")
def workspace(request: Request) -> dict[str, object] | None:
    principal = current_principal(request)
    return database.get_workspace(str(principal["workspace_id"]))


@app.put("/api/workspace")
def configure_workspace(request: WorkspaceRequest, http_request: Request) -> dict[str, object]:
    principal = require_admin(http_request)
    if request.account_type != principal["account_type"]:
        raise HTTPException(status_code=403, detail="Account type cannot be changed.")
    workspace = database.save_workspace(
        str(principal["workspace_id"]),
        request.name.strip(),
        request.account_type,
        request.region.strip(),
        (request.profile_name or request.name).strip(),
        request.profile_detail.strip(),
    )
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@app.get("/api/factors")
def factors(
    request: Request, category: str | None = Query(default=None)
) -> list[dict[str, object]]:
    principal = current_principal(request)
    workspace_id = require_onboarding(principal)
    if category and category not in {"electricity", "transport", "fuel", "waste"}:
        raise HTTPException(status_code=422, detail="Invalid emissions category.")
    return database.list_factors(workspace_id, category)


@app.post("/api/factors", status_code=201)
def add_factor(request: FactorRequest, http_request: Request) -> dict[str, object]:
    principal = require_admin(http_request)
    workspace_id = require_onboarding(principal)
    return database.save_factor(
        workspace_id,
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
def activities(
    request: Request,
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_activities(workspace_id, period)


@app.post("/api/activities", status_code=201)
def add_activity(request: ActivityRequest, http_request: Request) -> dict[str, object]:
    principal = current_principal(http_request)
    workspace_id = require_onboarding(principal)
    factor = database.get_factor(request.factor_id, workspace_id) if request.factor_id else None
    if not factor and not request.factor_id:
        workspace_factors = database.list_factors(workspace_id, request.category)
        matching = [f for f in workspace_factors if f["unit"].endswith("/" + request.unit) and f["value"] > 0]
        if matching:
            factor = matching[0]
    if request.activity_date and not request.activity_date.startswith(request.period + "-"):
        raise HTTPException(status_code=422, detail="Activity date must be within the selected reporting month.")
    if factor:
        try:
            emissions_kg = calculate_emissions_kg(
                request.quantity, request.unit, request.category, factor
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    else:
        factor = database.get_or_create_placeholder_factor(
            workspace_id, request.category, request.unit
        )
        emissions_kg = 0.0
    return database.save_activity(
        workspace_id,
        request.category,
        request.description.strip(),
        request.quantity,
        request.unit,
        request.period,
        request.activity_date,
        request.reporting_unit.strip(),
        factor,
        emissions_kg,
    )


@app.delete("/api/activities/{activity_id}", status_code=204)
def remove_activity(activity_id: str, request: Request) -> None:
    workspace_id = require_onboarding(current_principal(request))
    if not database.delete_activity(activity_id, workspace_id):
        raise HTTPException(status_code=404, detail="Activity record not found.")


@app.get("/api/dashboard")
def dashboard(
    request: Request,
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> dict[str, object]:
    selected_period = period or datetime.now().strftime("%Y-%m")
    workspace_id = require_onboarding(current_principal(request))
    return database.get_dashboard(workspace_id, selected_period)


@app.get("/api/analytics/{metric}")
def get_analytics(
    metric: str,
    http_request: Request,
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    category: str | None = Query(default=None),
    department: str | None = Query(default=None, max_length=120),
    months: int = Query(default=6, ge=1, le=24),
    change_pct: float = Query(default=0, ge=-100, le=100),
    switch_mode: str = Query(default="none", max_length=40),
    add_solar_kwh: float = Query(default=0, ge=0, le=1000000000),
) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(http_request))
    workspace = database.get_workspace(workspace_id) or {"id": workspace_id}
    records = database.list_activities(workspace_id)
    selected_period = period or datetime.now().strftime("%Y-%m")
    valid_categories = {"electricity", "transport", "fuel", "waste"}
    if category and category not in valid_categories:
        raise HTTPException(status_code=422, detail="Invalid category filter.")

    handlers = {
        "summary": lambda: analytics_service.summary(records, workspace, selected_period, category, department),
        "timeseries": lambda: analytics_service.monthly_series(records, selected_period, months, category, department),
        "breakdown": lambda: analytics_service.breakdown(records, selected_period, category, department),
        "top_contributors": lambda: analytics_service.top_contributors(records, selected_period, category, department),
        "compare": lambda: analytics_service.compare(records, selected_period, category, department),
        "forecast": lambda: analytics_service.forecast(records, selected_period, months, category, department),
        "anomalies": lambda: analytics_service.anomalies(records, selected_period, category, department),
        "what_if": lambda: analytics_service.what_if(records, selected_period, category, department, change_pct, switch_mode, add_solar_kwh),
        "correlation": lambda: analytics_service.correlation(records, selected_period),
        "heatmap": lambda: analytics_service.heatmap(records, selected_period, category, department),
        "abatement": lambda: analytics_service.abatement(records, selected_period),
        "pathway": lambda: analytics_service.pathway(records, workspace.get("monthly_target_kg"), selected_period),
        "data_quality": lambda: analytics_service.data_quality(records),
        "benchmark": lambda: analytics_service.benchmark(records, selected_period),
    }
    if metric not in handlers:
        raise HTTPException(status_code=404, detail="Unknown analytics metric.")
    response = handlers[metric]()
    response.setdefault("meta", {})
    response["meta"].update({"role": workspace.get("account_type", "individual"), "period": selected_period, "category": category, "department": department, "illustrative_demo_data": not bool(records), "cached_ttl_seconds": analytics_service.CACHE_TTL_SECONDS})
    return response


@app.put("/api/targets")
def update_target(request: TargetRequest, http_request: Request) -> dict[str, float | None]:
    principal = require_admin(http_request)
    workspace_id = require_onboarding(principal)
    database.set_monthly_target(workspace_id, request.monthly_target_kg)
    return {"monthly_target_kg": request.monthly_target_kg}


@app.get("/api/recommendations")
def recommendations(
    request: Request,
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    data = database.get_dashboard(workspace_id, period or datetime.now().strftime("%Y-%m"))
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
            "estimated_savings_kg": round(float(row["emissions_kg"] * 0.10), 3),
            "savings_note": "Planning scenario: 10% of category emissions; not a measured or guaranteed saving.",
        }
        for row in data["categories"]
    ]


@app.get("/api/reports.csv")
def report_csv(
    request: Request,
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> StreamingResponse:
    selected_period = period or datetime.now().strftime("%Y-%m")
    workspace_id = require_onboarding(current_principal(request))
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    workspace = database.get_workspace(workspace_id)
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
    for row in database.list_activities(workspace_id, selected_period):
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


@app.get("/api/carbon-explanation")
def carbon_explanation(request: Request, period: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    dashboard_data = database.get_dashboard(workspace_id, period)
    activities = database.list_activities(workspace_id, period)
    category_context = "; ".join(
        f"{row['category']}={row['emissions_kg']} kg CO2e" for row in dashboard_data["categories"]
    ) or "no measured category emissions"
    activity_context = "; ".join(
        f"{row['activity_date']}: {row['description']}={row['emissions_kg']} kg CO2e; "
        f"quantity {row['quantity']} {row['unit']} × factor {row['factor_value']} {row['factor_unit']} "
        f"from {row['factor_source']} ({row['factor_year']})"
        for row in activities
    ) or "no activities recorded"
    facts = (
        f"Reporting month: {period}. Monthly total: {dashboard_data['total_kg']} kg CO2e. "
        f"Category totals: {category_context}. Daily records: {activity_context}. "
        "Explain the measured sources and calculation assumptions. Give reduction opportunities only as options. "
        "Do not add, estimate, or replace totals or emission factors."
    )
    ai_generated = False
    if OPENAI_API_KEY:
        try:
            explanation = OpenAIProvider().explain(facts)
            ai_generated = True
        except Exception as error:
            logger.warning("Carbon explanation provider unavailable: %s", error)
            explanation = None
    else:
        explanation = None
    if not explanation:
        explanation = (
            f"The measured total for {period} is {dashboard_data['total_kg']} kg CO2e across {dashboard_data['activity_count']} activity records. "
            f"Measured category totals are: {category_context}. "
            "Each activity should be calculated as quantity multiplied by its saved, documented factor. "
            "Reduction opportunities include reviewing the largest source categories, scheduling and efficiency improvements, and avoiding unnecessary activity, without claiming a guaranteed saving."
        )
    return {
        "period": period,
        "monthly_total_kg": dashboard_data["total_kg"],
        "daily": dashboard_data["daily"],
        "categories": dashboard_data["categories"],
        "explanation": explanation,
        "ai_generated": ai_generated,
    }


@app.get("/api/documents")
def documents(request: Request) -> list[dict[str, object]]:
    principal = current_principal(request)
    workspace_id = require_onboarding(principal)
    return database.list_documents(workspace_id)


@app.post("/api/documents", status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    source_url: str | None = Form(default=None, max_length=2000),
) -> dict[str, object]:
    principal = require_admin(request)
    workspace_id = require_onboarding(principal)
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

    rag = service(workspace_id)
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
def add_sample_document(request: Request) -> dict[str, object]:
    principal = require_admin(request)
    workspace_id = require_onboarding(principal)
    sample_path = Path(__file__).resolve().parents[1] / "seed_documents" / "ghg-protocol-corporate-standard.md"
    rag = service(workspace_id)
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
def remove_document(document_id: str, request: Request) -> None:
    principal = require_admin(request)
    workspace_id = require_onboarding(principal)
    if not database.delete_document(document_id, workspace_id):
        raise HTTPException(status_code=404, detail="Document not found.")


@app.post("/api/chat")
def chat(request: ChatRequest, http_request: Request) -> dict[str, object]:
    principal = current_principal(http_request)
    workspace_id = require_onboarding(principal)
    question = request.question.strip()
    if len(question) < 3:
        raise HTTPException(status_code=422, detail="Question must contain at least 3 non-space characters.")
    rag = service(workspace_id)
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


# --- Bill OCR & Electricity Calculation ---

class ElectricityCalculateRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    quantity: float = Field(gt=0, le=1_000_000_000)
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    activity_date: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
    description: str = Field(default="Electricity bill consumption", max_length=160)
    reporting_unit: str = Field(default="", max_length=120)
    factor_id: str | None = Field(default=None, max_length=64)


class ReductionGoalRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    title: str = Field(min_length=2, max_length=160)
    category: str | None = Field(default=None)
    baseline_period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    baseline_emissions_kg: float = Field(ge=0, le=1_000_000_000)
    target_reduction_pct: float = Field(gt=0, le=100)
    target_period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class ReductionGoalStatusRequest(BaseModel):
    status: str = Field(pattern=r"^(active|achieved|missed|cancelled)$")


class IotSimulateRequest(BaseModel):
    device_id: str = Field(default="esp32-energy-01", max_length=64)
    power_w: float | None = Field(default=None, ge=0, le=50000)


@app.post("/api/electricity/analyze-bill")
async def analyze_electricity_bill(
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, object]:
    principal = current_principal(request)
    require_onboarding(principal)
    if not file.filename:
        raise HTTPException(status_code=400, detail="A bill file is required.")
    
    ext = Path(file.filename).suffix.lower()
    allowed_exts = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp"}
    if ext not in allowed_exts:
        raise HTTPException(status_code=415, detail="Upload a PDF, JPG, PNG, TIFF, or BMP electricity bill.")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Bill file exceeds the 10 MB limit.")
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    return await run_in_threadpool(bill_ocr.analyze_bill_document, file.filename, content)


@app.post("/api/electricity/calculate", status_code=201)
def calculate_electricity_bill(
    request: ElectricityCalculateRequest,
    http_request: Request,
) -> dict[str, object]:
    principal = current_principal(http_request)
    workspace_id = require_onboarding(principal)

    if request.activity_date and not request.activity_date.startswith(request.period + "-"):
        raise HTTPException(status_code=422, detail="Activity date must be within the billing month.")

    # Match factor
    factor = None
    if request.factor_id:
        factor = database.get_factor(request.factor_id, workspace_id)
    if not factor:
        factors = database.list_factors(workspace_id, "electricity")
        if factors:
            factor = factors[0]

    if factor:
        try:
            emissions_kg = calculate_emissions_kg(request.quantity, "kWh", "electricity", factor)
        except ValueError as err:
            raise HTTPException(status_code=422, detail=str(err)) from err
    else:
        factor = database.get_or_create_placeholder_factor(workspace_id, "electricity", "kWh")
        emissions_kg = 0.0

    return database.save_activity(
        workspace_id=workspace_id,
        category="electricity",
        description=request.description.strip(),
        quantity=request.quantity,
        unit="kWh",
        period=request.period,
        activity_date=request.activity_date,
        reporting_unit=request.reporting_unit.strip(),
        factor=factor,
        emissions_kg=emissions_kg,
        data_origin="ocr_bill",
    )


# --- IoT Household Monitoring ---

@app.post("/api/iot/readings", status_code=201)
def ingest_iot_reading(
    reading: iot_service.IotReadingRequest,
    request: Request,
) -> dict[str, object]:
    # Determine workspace
    principal = getattr(request.state, "principal", None)
    workspace_id = None
    if principal:
        workspace_id = str(principal["workspace_id"])
    else:
        # Check if device is already registered
        dev = database.get_iot_device(reading.device_id)
        if dev:
            workspace_id = str(dev["workspace_id"])
        else:
            # Associate with the primary workspace in the system
            legacy = database.get_workspace(None)
            if legacy:
                workspace_id = legacy["id"]
            else:
                raise HTTPException(status_code=400, detail="No workspace registered to associate IoT device.")

    # Register device if not exists
    database.register_or_get_iot_device(
        workspace_id=workspace_id,
        device_id=reading.device_id,
        device_name=f"Power Sensor {reading.device_id[-4:]}",
        device_token=getattr(request.state, "device_token", None),
    )

    saved = database.save_iot_reading(
        device_id=reading.device_id,
        workspace_id=workspace_id,
        voltage=reading.voltage,
        current=reading.current,
        power=reading.power,
        energy_kwh=reading.energy_kwh,
        temperature=reading.temperature,
        humidity=reading.humidity,
        is_simulated=reading.is_simulated,
        timestamp=reading.timestamp,
    )
    health_status = iot_service.get_device_health(saved["recorded_at"])
    return {
        "status": "success",
        "reading": saved,
        "device_health": health_status,
    }


@app.get("/api/iot/latest")
def get_latest_iot(
    request: Request,
    device_id: str | None = Query(default=None),
) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    latest = database.get_latest_iot_reading(workspace_id, device_id)
    devices = database.list_iot_devices(workspace_id)
    health_status = iot_service.get_device_health(latest["recorded_at"] if latest else None)
    return {
        "latest_reading": latest,
        "device_health": health_status,
        "devices": devices,
    }


@app.get("/api/iot/history")
def get_iot_history(
    request: Request,
    device_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    hours: int | None = Query(default=24, ge=1, le=720),
) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    readings = database.list_iot_readings(workspace_id, device_id, limit, hours)
    energy_calc = iot_service.calculate_energy_consumption(readings)
    return {
        "device_id": device_id,
        "sample_count": len(readings),
        "period_hours": hours,
        "energy_consumption_kwh": energy_calc["total_consumption_kwh"],
        "readings": readings,
    }


@app.get("/api/iot/summary")
def get_iot_summary(
    request: Request,
    device_id: str | None = Query(default=None),
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    selected_period = period or datetime.now().strftime("%Y-%m")
    readings = database.list_iot_readings(workspace_id, device_id, limit=5000)
    period_readings = [r for r in readings if str(r["recorded_at"]).startswith(selected_period)]

    consumption = iot_service.calculate_energy_consumption(period_readings)
    daily = iot_service.aggregate_daily_iot_energy(period_readings)

    # Estimate emissions using workspace electricity factor
    factors = database.list_factors(workspace_id, "electricity")
    factor = factors[0] if factors else None
    emissions_kg = 0.0
    if factor:
        try:
            emissions_kg = calculate_emissions_kg(consumption["total_consumption_kwh"], "kWh", "electricity", factor)
        except ValueError:
            pass

    return {
        "period": selected_period,
        "total_consumption_kwh": consumption["total_consumption_kwh"],
        "estimated_emissions_kg": round(emissions_kg, 4),
        "factor_applied": factor,
        "daily_breakdown": daily,
        "sample_count": len(period_readings),
        "resets_detected": consumption["resets_detected"],
    }


@app.post("/api/iot/simulate")
def simulate_iot_reading(
    req: IotSimulateRequest,
    request: Request,
) -> dict[str, object]:
    principal = current_principal(request)
    workspace_id = require_onboarding(principal)
    dev_id = req.device_id or "esp32-household-01"

    database.register_or_get_iot_device(
        workspace_id=workspace_id,
        device_id=dev_id,
        device_name=f"Smart Energy Monitor ({dev_id})",
        location="Main Household Meter",
    )

    latest = database.get_latest_iot_reading(workspace_id, dev_id)
    prev_kwh = latest["energy_kwh"] if latest else 125.4

    # Simulate realistic live electrical readings
    voltage = 230.5
    power = req.power_w if req.power_w is not None else 850.0
    current = round(power / voltage, 2)
    # Increment cumulative kWh by ~0.05 kWh
    new_kwh = round(prev_kwh + 0.05, 4)

    reading = database.save_iot_reading(
        device_id=dev_id,
        workspace_id=workspace_id,
        voltage=voltage,
        current=current,
        power=power,
        energy_kwh=new_kwh,
        temperature=26.8,
        humidity=53.0,
        is_simulated=True,
    )
    health_status = iot_service.get_device_health(reading["recorded_at"])
    return {
        "status": "simulated",
        "reading": reading,
        "device_health": health_status,
        "note": "Simulated hardware reading for demonstration and testing.",
    }


# --- Explainable AI Carbon Intelligence ---

@app.get("/api/explainable-ai")
def get_explainable_ai(
    request: Request,
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    selected_period = period or datetime.now().strftime("%Y-%m")
    workspace = database.get_workspace(workspace_id) or {"name": "Workspace", "id": workspace_id}
    dashboard_data = database.get_dashboard(workspace_id, selected_period)
    activities = database.list_activities(workspace_id, selected_period)

    return explainable_ai.generate_explainable_intelligence(
        workspace=workspace,
        period=selected_period,
        dashboard_data=dashboard_data,
        activities=activities,
    )


# --- Reduction Goals ---

@app.get("/api/goals")
def list_goals(request: Request) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_reduction_goals(workspace_id)


@app.post("/api/goals", status_code=201)
def create_goal(
    goal_req: ReductionGoalRequest,
    request: Request,
) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    target_kg = round(goal_req.baseline_emissions_kg * (1.0 - (goal_req.target_reduction_pct / 100.0)), 2)
    return database.create_reduction_goal(
        workspace_id=workspace_id,
        title=goal_req.title.strip(),
        category=goal_req.category,
        baseline_period=goal_req.baseline_period,
        baseline_emissions_kg=goal_req.baseline_emissions_kg,
        target_reduction_pct=goal_req.target_reduction_pct,
        target_emissions_kg=target_kg,
        target_period=goal_req.target_period,
    )


@app.patch("/api/goals/{goal_id}/status")
def update_goal_status(
    goal_id: str,
    status_req: ReductionGoalStatusRequest,
    request: Request,
) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    if not database.update_reduction_goal_status(goal_id, workspace_id, status_req.status):
        raise HTTPException(status_code=404, detail="Reduction goal not found.")
    return {"id": goal_id, "status": status_req.status}


@app.post("/api/factors/seed", status_code=201)
def seed_factors(request: Request) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    count = database.seed_reference_factors_if_empty(workspace_id)
    return {"seeded_factors_count": count, "message": f"{count} reference emission factors initialized."}


# --- GPS Trip Tracking ---

@app.post("/api/trips/start", status_code=201)
def trip_start(req: TripStartRequest, request: Request) -> dict[str, object]:
    principal = current_principal(request)
    workspace_id = require_onboarding(principal)
    return database.start_trip(
        workspace_id=workspace_id,
        mode=req.mode,
        user_id=str(principal["id"]) if "id" in principal else None,
        initial_point=req.initial_point,
    )


@app.post("/api/trips/{trip_id}/points")
def trip_add_points(trip_id: str, req: TripPointsBatchRequest, request: Request) -> dict[str, object]:
    require_onboarding(current_principal(request))
    return database.add_trip_points(trip_id, req.points)


@app.post("/api/trips/{trip_id}/stop")
def trip_stop(trip_id: str, req: TripStopRequest, request: Request) -> dict[str, object]:
    principal = current_principal(request)
    workspace_id = require_onboarding(principal)

    factor_val = req.factor_value or 0.170
    factor_name = req.factor_name or "Personal Vehicle"

    trip = database.complete_trip(trip_id, factor_val=factor_val, factor_name=factor_name)

    # Save to activities ledger with data_origin="gps"
    if trip["distance_km"] > 0 and trip["emissions_kg"] > 0:
        period = datetime.now().strftime("%Y-%m")
        factors = database.list_factors(workspace_id, "transport")
        f_id = factors[0]["id"] if factors else None
        if f_id:
            try:
                database.create_activity(
                    workspace_id=workspace_id,
                    category="transport",
                    description=f"GPS Trip ({trip['mode'].capitalize()}) - {trip['distance_km']} km",
                    quantity=trip["distance_km"],
                    unit="km",
                    period=period,
                    reporting_unit="GPS Tracking",
                    factor=factors[0],
                    data_origin="gps",
                )
            except Exception:
                pass

    return trip


@app.get("/api/trips")
def trip_list(request: Request, limit: int = Query(default=25, ge=1, le=100)) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_trips(workspace_id, limit=limit)


# --- Multi-Site & Campus Facilities ---

@app.get("/api/facilities")
def get_facilities(request: Request) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_facilities(workspace_id)


@app.post("/api/facilities", status_code=201)
def add_facility(req: FacilityCreateRequest, request: Request) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    return database.create_facility(
        workspace_id=workspace_id,
        name=req.name,
        site_type=req.site_type,
        area_sqft=req.area_sqft,
        baseline_kwh=req.baseline_kwh,
        baseline_water_l=req.baseline_water_l,
    )


# --- Smart Campus & College Endpoints ---

@app.get("/api/college/food-waste")
def get_food_waste(request: Request, limit: int = Query(default=30, ge=1, le=100)) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_food_waste_records(workspace_id, limit)


@app.post("/api/college/food-waste", status_code=201)
def add_food_waste(req: FoodWasteCreateRequest, request: Request) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    return database.create_food_waste_record(
        workspace_id=workspace_id,
        date=req.date,
        canteen_name=req.canteen_name,
        meal_type=req.meal_type,
        waste_kg=req.waste_kg,
        diverted_compost_kg=req.diverted_compost_kg,
    )


@app.get("/api/college/buses")
def get_campus_buses(request: Request) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_campus_buses(workspace_id)


@app.post("/api/college/buses", status_code=201)
def add_campus_bus(req: CampusBusCreateRequest, request: Request) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    return database.create_campus_bus(
        workspace_id=workspace_id,
        route_name=req.route_name,
        bus_number=req.bus_number,
        distance_km=req.distance_km,
        avg_occupancy=req.avg_occupancy,
        fuel_type=req.fuel_type,
    )


@app.get("/api/college/events")
def get_events(request: Request) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_event_emissions(workspace_id)


@app.post("/api/college/events", status_code=201)
def calculate_event(req: EventEmissionCreateRequest, request: Request) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))

    gen_kg = req.generator_kwh * 0.71
    meal_kg = req.meals_served * 1.5
    travel_kg = req.travel_km * 0.089

    total_kg = round(gen_kg + meal_kg + travel_kg, 2)
    breakdown = {
        "energy_emissions_kg": round(gen_kg, 2),
        "catering_emissions_kg": round(meal_kg, 2),
        "travel_emissions_kg": round(travel_kg, 2),
        "per_attendee_kg": round(total_kg / req.attendees, 2) if req.attendees > 0 else 0.0,
    }

    return database.create_event_emission(
        workspace_id=workspace_id,
        event_name=req.event_name,
        event_date=req.event_date,
        attendees=req.attendees,
        duration_hours=req.duration_hours,
        breakdown=breakdown,
        total_kg=total_kg,
    )


@app.get("/api/college/challenges")
def get_challenges(request: Request) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.list_green_challenges(workspace_id)


@app.post("/api/college/challenges", status_code=201)
def add_challenge(req: GreenChallengeCreateRequest, request: Request) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    return database.create_green_challenge(
        workspace_id=workspace_id,
        title=req.title,
        description=req.description,
        category=req.category,
        target_pct=req.target_reduction_pct,
        start_date=req.start_date,
        end_date=req.end_date,
    )


@app.post("/api/college/challenges/{challenge_id}/join", status_code=201)
def join_challenge(challenge_id: str, req: ChallengeJoinRequest, request: Request) -> dict[str, object]:
    principal = current_principal(request)
    workspace_id = require_onboarding(principal)
    return database.join_green_challenge(
        challenge_id=challenge_id,
        workspace_id=workspace_id,
        student_name=req.student_name,
        department_or_hostel=req.department_or_hostel,
        user_id=str(principal["id"]) if "id" in principal else None,
    )


@app.get("/api/college/leaderboard")
def get_leaderboard(request: Request) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    return database.get_campus_leaderboard(workspace_id)


# --- Enterprise & Organization Endpoints ---

@app.get("/api/organization/advisor")
def get_operations_advisor(request: Request, period: str | None = Query(default=None)) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    selected_period = period or datetime.now().strftime("%Y-%m")
    workspace = database.get_workspace(workspace_id) or {"name": "Workspace", "id": workspace_id}
    dashboard_data = database.get_dashboard(workspace_id, selected_period)
    activities = database.list_activities(workspace_id, selected_period)

    xai = explainable_ai.generate_explainable_intelligence(
        workspace=workspace,
        period=selected_period,
        dashboard_data=dashboard_data,
        activities=activities,
    )
    return xai.get("operations_advisor", [])


@app.get("/api/organization/scopes")
def get_scopes(request: Request, period: str | None = Query(default=None)) -> list[dict[str, object]]:
    workspace_id = require_onboarding(current_principal(request))
    selected_period = period or datetime.now().strftime("%Y-%m")
    workspace = database.get_workspace(workspace_id) or {"name": "Workspace", "id": workspace_id}
    dashboard_data = database.get_dashboard(workspace_id, selected_period)
    activities = database.list_activities(workspace_id, selected_period)

    xai = explainable_ai.generate_explainable_intelligence(
        workspace=workspace,
        period=selected_period,
        dashboard_data=dashboard_data,
        activities=activities,
    )
    return xai.get("scopes_breakdown", [])


@app.post("/api/organization/bulk-import", status_code=201)
def bulk_import(req: BulkImportRequest, request: Request) -> dict[str, object]:
    workspace_id = require_onboarding(current_principal(request))
    imported_count = 0
    errors = []

    for idx, row in enumerate(req.rows):
        factors = database.list_factors(workspace_id, row.category)
        if not factors:
            errors.append(f"Row {idx+1}: No factor found for {row.category}")
            continue

        factor = factors[0]
        try:
            database.create_activity(
                workspace_id=workspace_id,
                category=row.category,
                description=row.description,
                quantity=row.quantity,
                unit=row.unit,
                period=row.period,
                reporting_unit=row.reporting_unit,
                factor=factor,
                data_origin="bulk_import",
            )
            imported_count += 1
        except Exception as e:
            errors.append(f"Row {idx+1}: {str(e)}")

    return {
        "imported_count": imported_count,
        "failed_count": len(errors),
        "errors": errors[:5],
    }


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


