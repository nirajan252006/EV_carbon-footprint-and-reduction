# GreenTrack — Sustainability Knowledge Assistant

GreenTrack's sustainability assistant uses retrieval-augmented generation (RAG)
for questions about sustainability standards and guidance. RAG is appropriate
here because answers should be grounded in changeable source documents and show
where their claims came from. Carbon calculations and any future questions about
a user's activity data must use the deterministic calculation/database layer,
not vector retrieval or an LLM.

## What is implemented

- FastAPI service with document upload/list/delete, health, and chat endpoints.
- PDF, TXT, and Markdown extraction; text cleaning; page-aware chunks with overlap.
- OpenAI `text-embedding-3-small` embeddings stored with document metadata in local
  SQLite and cosine-similarity retrieval.
- OpenAI `gpt-4o-mini` generation with retrieved passages explicitly treated as
  untrusted evidence, source-marker validation, and an insufficient-evidence path.
- A source-note document based on the [GHG Protocol Corporate Standard page](https://ghgprotocol.org/corporate-standard)
  that can be indexed from the UI.
- A responsive web interface for questions, source citations, document uploads,
  ingestion status, and document deletion.

This repository was initially empty apart from its README and a one-line test
file. It currently implements the RAG assistant slice, not the complete GreenTrack
activity tracking, emissions calculations, analytics, authentication, or reporting
application. Uploaded documents and chat are local-prototype functionality; there
is no multi-user access control.

## Run locally

Requirements: Python 3.10+ and an OpenAI API key.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:OPENAI_API_KEY = "your-key"
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`. Configure `OPENAI_API_KEY` only in the backend
environment; it is never sent to the browser. Without a key, health and document
listing remain available, while embedding and chat requests return an explicit
configuration error.

Optional environment settings:

| Variable | Default | Purpose |
|---|---|---|
| `GREENTRACK_DATABASE` | `greentrack.sqlite3` in the repository root | SQLite database path |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Answer-generation model |
| `RAG_TOP_K` | `4` | Maximum retrieved chunks |
| `RAG_SIMILARITY_THRESHOLD` | `0.3` | Minimum cosine similarity |
| `RAG_CHUNK_SIZE` | `900` | Chunk length in characters |
| `RAG_CHUNK_OVERLAP` | `120` | Overlap between consecutive chunks |

## API

- `GET /api/health` — application and AI-credential status.
- `GET /api/documents` — indexed document metadata.
- `POST /api/documents` — multipart upload (`file`, optional `source_url`).
- `POST /api/documents/sample` — index the bundled GHG Protocol source notes.
- `DELETE /api/documents/{id}` — remove a document and its chunks.
- `POST /api/chat` — JSON body `{"question":"..."}`; returns an answer and its
  retrieved source records, or an explicit insufficient-evidence result.

Uploads are limited to 10 MB and PDF/TXT/Markdown. Duplicate content is detected
by SHA-256. PDF image-only pages are not OCR'd and are rejected if no text can be
extracted. Sources without a page number are cited by filename and URL.

## Verification

Run backend tests from the repository root:

```powershell
python -m pip install -r backend/requirements.txt
python -m pytest backend/tests -q
```

Tests use a deterministic fake provider to verify extraction, chunking, persistence,
retrieval, duplicate detection, deletion, and citation validation without making
external API calls. Live embedding and generation require a valid API key and were
not verified in an environment without credentials.
