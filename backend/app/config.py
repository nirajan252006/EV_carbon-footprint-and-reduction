import os
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / "backend" / ".env")
DATABASE_PATH = Path(os.getenv("GREENTRACK_DATABASE", str(ROOT_DIR / "greentrack.sqlite3")))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip() or None
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))
RAG_SIMILARITY_THRESHOLD = float(os.getenv("RAG_SIMILARITY_THRESHOLD", "0.3"))
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "120"))
SESSION_COOKIE_NAME = "greentrack_session"
CSRF_COOKIE_NAME = "greentrack_csrf"
COOKIE_SECURE = os.getenv("GREENTRACK_COOKIE_SECURE", "false").strip().lower() == "true"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
