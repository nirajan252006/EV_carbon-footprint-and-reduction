import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import database
from .config import MAX_UPLOAD_BYTES, OPENAI_API_KEY, ROOT_DIR
from .rag import ProviderError, ProviderUnavailable, RagService, is_provider_error

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize_database()
    yield


app = FastAPI(title="GreenTrack Sustainability Knowledge Assistant", lifespan=lifespan)


class ChatRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


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
    }


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


FRONTEND_DIR = ROOT_DIR / "frontend"
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")
