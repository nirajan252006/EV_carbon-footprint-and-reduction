import pytest

from app import database
from app.rag import (
    ProviderError,
    RagService,
    TextPage,
    chunk_pages,
    cosine_similarity,
    extract_pages,
)


class FakeProvider:
    def __init__(self, answer: str = "[S1] Universities can use the standard.") -> None:
        self.answer_text = answer

    def embed(self, texts: list[str]) -> list[list[float]]:
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
    chunks = chunk_pages(pages, chunk_size=10, overlap=2)

    assert len(chunks) > 1
    assert all(chunk["page_number"] is None for chunk in chunks)
    assert "".join(str(chunk["content"]) for chunk in chunks).replace(" ", "")
    assert "First page." in str(chunks[0]["content"])


def test_pdf_validation_and_empty_documents():
    with pytest.raises(ValueError, match="valid PDF"):
        extract_pages("guide.pdf", b"not a pdf")
    with pytest.raises(ValueError, match="no extractable text"):
        extract_pages("empty.txt", b" \n\t ")


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


def test_document_deletion_removes_chunks(temporary_database):
    service = RagService(FakeProvider())
    document = service.ingest("standard.txt", b"The standard applies to universities.")

    assert database.delete_document(str(document["id"])) is True
    assert database.search_chunks([1.0, 0.0]) == []
    assert database.delete_document(str(document["id"])) is False
