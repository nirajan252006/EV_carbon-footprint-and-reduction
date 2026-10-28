import logging
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
from .carbon import calculate_emissions_kg
from .config import (
    COOKIE_SECURE,
    CSRF_COOKIE_NAME,
    MAX_UPLOAD_BYTES,
    OPENAI_API_KEY,
    ROOT_DIR,
    SESSION_COOKIE_NAME,
    SESSION_TTL_SECONDS,
)
from .rag import ProviderError, ProviderUnavailable, RagService, is_provider_error

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize_database()
    yield


app = FastAPI(title="GreenTrack Carbon Platform", lifespan=lifespan)

PUBLIC_API = {
    ("GET", "/api/health"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
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

    if not session:
        return JSONResponse(status_code=401, content={"detail": "Sign in to continue."})

    if request.method in UNSAFE_METHODS:
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


@app.post("/api/auth/register", status_code=201)
def register(request: RegisterRequest, response: Response) -> dict[str, object]:
    try:
        user = database.create_account(
            request.email,
            request.full_name,
            request.account_type,
            hash_password(request.password),
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
    return {
        "status": "ok",
        "ai_provider_configured": bool(OPENAI_API_KEY),
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
    factor = database.get_factor(request.factor_id, workspace_id)
    if not factor:
        raise HTTPException(status_code=404, detail="Emission factor not found.")
    try:
        emissions_kg = calculate_emissions_kg(
            request.quantity, request.unit, request.category, factor
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return database.save_activity(
        workspace_id,
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
            "estimated_savings_kg": None,
            "savings_note": "No savings estimate is shown because activity-specific reduction evidence is not available.",
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
