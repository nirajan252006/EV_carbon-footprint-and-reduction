from pathlib import Path
from io import BytesIO
import re

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from backend.app import database
from backend.app import main
from backend.app.rag import (
    ProviderError,
    RagService,
    TextPage,
    chunk_pages,
    cosine_similarity,
    extract_pages,
)


def authenticate(client):
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "Test User",
            "email": "rag@example.com",
            "password": "test-password-123",
            "account_type": "individual",
            "location": "India",
        },
    )
    assert response.status_code == 201
    csrf = client.cookies.get(main.CSRF_COOKIE_NAME)
    if csrf:
        client.headers["X-CSRF-Token"] = csrf
    workspace = client.put(
        "/api/workspace",
        json={"name": "Test workspace", "account_type": "individual", "region": "India"},
    )
    assert workspace.status_code == 200


class FakeProvider:
    def __init__(self, answer: str = "[S1] Universities can use the standard.") -> None:
        self.answer_text = answer
        self.batch_sizes: list[int] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.batch_sizes.append(len(texts))
        return [
            [1.0, 0.0] if "universit" in text.lower() or "standard" in text.lower() else [0.0, 1.0]
            for text in texts
        ]

    def answer(self, question: str, context: str) -> str:
        assert "[S1]" in context
        assert "universit" in context.lower()
        return self.answer_text


@pytest.fixture
def temporary_database(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "test.sqlite3")
    database.initialize_database()


def test_extract_and_chunk_text_preserves_document_metadata():
    pages = extract_pages("guide.txt", b"  First\tpage.\nMore text.  ")
    chunks = chunk_pages(pages, chunk_size=14, overlap=3)

    assert len(chunks) > 1
    assert all(chunk["page_number"] is None for chunk in chunks)
    assert all(chunk["content"] for chunk in chunks)
    assert "First page." in str(chunks[0]["content"])


def test_pdf_validation_and_empty_documents():
    with pytest.raises(ValueError, match="valid PDF"):
        extract_pages("guide.pdf", b"not a pdf")
    with pytest.raises(ValueError, match="no extractable text"):
        extract_pages("empty.txt", b" \n\t ")
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    pdf = BytesIO()
    writer.write(pdf)
    with pytest.raises(ValueError, match="no extractable text"):
        extract_pages("blank.pdf", pdf.getvalue())


def test_chunking_rejects_invalid_overlap():
    with pytest.raises(ValueError, match="smaller than chunk size"):
        chunk_pages([TextPage(None, "text")], chunk_size=5, overlap=5)


def test_cosine_similarity_handles_empty_and_unequal_vectors():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity([1.0], [1.0, 0.0]) == 0.0
    assert cosine_similarity([0.0], [1.0]) == 0.0


def test_ingestion_retrieval_citations_and_duplicate_detection(temporary_database):
    service = RagService(FakeProvider())
    content = b"The GHG Protocol Corporate Standard can be used by universities."

    first = service.ingest("standard.txt", content, "https://example.org/standard")
    duplicate = service.ingest("renamed-copy.txt", content)
    response = service.chat("Can universities use the standard?")

    assert first["duplicate"] is False
    assert duplicate["duplicate"] is True
    assert duplicate["id"] == first["id"]
    assert response["insufficient_evidence"] is False
    assert response["sources"][0]["id"] == "S1"
    assert response["sources"][0]["source_url"] == "https://example.org/standard"


def test_generation_rejects_citations_not_in_retrieved_context(temporary_database):
    service = RagService(FakeProvider("[S2] Unsupported citation."))
    service.ingest("standard.txt", b"The standard applies to universities.")

    with pytest.raises(ProviderError, match="validated"):
        service.chat("Does the standard apply to universities?")


def test_irrelevant_question_returns_insufficient_evidence(temporary_database):
    service = RagService(FakeProvider())
    service.ingest("standard.txt", b"The standard applies to universities.")

    response = service.chat("How should I maintain a bicycle?")

    assert response["insufficient_evidence"] is True
    assert response["sources"] == []


def test_bundled_ghg_protocol_source_produces_a_verifiable_citation(temporary_database):
    sample_path = (
        Path(__file__).resolve().parents[1]
        / "seed_documents"
        / "ghg-protocol-corporate-standard.md"
    )
    service = RagService(FakeProvider())
    service.ingest(
        sample_path.name,
        sample_path.read_bytes(),
        "https://ghgprotocol.org/corporate-standard",
    )

    response = service.chat("Who can use the GHG Protocol Corporate Standard?")

    assert response["sources"][0]["filename"] == sample_path.name
    assert response["sources"][0]["source_url"] == "https://ghgprotocol.org/corporate-standard"
    assert response["answer"].startswith("[S1]")


def test_embedding_requests_are_batched_and_storage_persists(temporary_database):
    provider = FakeProvider()
    service = RagService(provider)
    content = ("ordinary words " * 7000).encode()

    service.ingest("long.txt", content)
    database.initialize_database()

    assert len(provider.batch_sizes) > 1
    assert max(provider.batch_sizes) <= 64
    assert database.list_documents()[0]["chunk_count"] > 64


def test_document_deletion_removes_chunks(temporary_database):
    service = RagService(FakeProvider())
    document = service.ingest("standard.txt", b"The standard applies to universities.")

    assert database.delete_document(str(document["id"])) is True
    assert database.search_chunks([1.0, 0.0]) == []
    assert database.delete_document(str(document["id"])) is False


def test_http_upload_chat_and_source_citation(temporary_database, monkeypatch):
    monkeypatch.setattr(main, "service", lambda _workspace_id=None: RagService(FakeProvider()))

    with TestClient(main.app) as client:
        authenticate(client)
        upload = client.post(
            "/api/documents",
            files={"file": ("standard.txt", b"The standard applies to universities.", "text/plain")},
            data={"source_url": "https://example.org/standard"},
        )
        answer = client.post(
            "/api/chat",
            json={"question": "Does the standard apply to universities?"},
        )

    assert upload.status_code == 201
    assert upload.json()["chunk_count"] == 1
    assert answer.status_code == 200
    assert answer.json()["sources"][0]["source_url"] == "https://example.org/standard"


def test_health_ui_and_missing_credentials(temporary_database, monkeypatch):
    monkeypatch.setattr(main, "OPENAI_API_KEY", None)

    with TestClient(main.app) as client:
        authenticate(client)
        health = client.get("/api/health")
        page = client.get("/")
        style_path = re.search(r'href="([^"]+\.css)"', page.text)
        stylesheet = client.get(style_path.group(1)) if style_path else None
        chat = client.post("/api/chat", json={"question": "Explain sustainability guidance"})
        sample = client.post("/api/documents/sample")
        blank_question = client.post("/api/chat", json={"question": "   "})

    assert health.status_code == 200
    assert health.json()["ai_provider_configured"] is False
    assert page.status_code == 200
    assert "GreenTrack" in page.text
    assert 'id="root"' in page.text
    assert stylesheet is None or stylesheet.status_code == 200
    assert chat.status_code == 503
    assert sample.status_code == 503
    assert blank_question.status_code == 422


def test_upload_rejects_bad_source_url(temporary_database):
    with TestClient(main.app) as client:
        authenticate(client)
        response = client.post(
            "/api/documents",
            files={"file": ("standard.txt", b"sample content", "text/plain")},
            data={"source_url": "javascript:alert(1)"},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Source URL must use HTTP or HTTPS."


def test_upload_rejects_unsupported_type_and_oversize_content(temporary_database):
    with TestClient(main.app) as client:
        authenticate(client)
        unsupported = client.post(
            "/api/documents",
            files={"file": ("instructions.exe", b"sample content", "application/octet-stream")},
        )
        too_large = client.post(
            "/api/documents",
            files={
                "file": (
                    "large.txt",
                    b"x" * (main.MAX_UPLOAD_BYTES + 1),
                    "text/plain",
                )
            },
        )

    assert unsupported.status_code == 415
    assert too_large.status_code == 413
