import json
import sqlite3
from pathlib import Path
from typing import Any

from .config import DATABASE_PATH


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                sha256 TEXT NOT NULL UNIQUE,
                source_url TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                page_number INTEGER,
                content TEXT NOT NULL,
                embedding TEXT NOT NULL,
                UNIQUE(document_id, chunk_index)
            );
            CREATE INDEX IF NOT EXISTS idx_chunks_document_id
                ON chunks(document_id);
            """
        )
        connection.execute("PRAGMA foreign_keys = ON")


def count_documents() -> int:
    with connect() as connection:
        return int(connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0])


def list_documents() -> list[dict[str, Any]]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT d.id, d.filename, d.source_url, d.created_at, COUNT(c.id) AS chunk_count
            FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
            GROUP BY d.id ORDER BY d.created_at DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def get_document_by_hash(sha256: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT id, filename FROM documents WHERE sha256 = ?", (sha256,)
        ).fetchone()
    return dict(row) if row else None


def save_document(
    document_id: str,
    filename: str,
    sha256: str,
    source_url: str | None,
    chunks: list[dict[str, Any]],
) -> None:
    with connect() as connection:
        connection.execute(
            "INSERT INTO documents (id, filename, sha256, source_url) VALUES (?, ?, ?, ?)",
            (document_id, filename, sha256, source_url),
        )
        connection.executemany(
            """
            INSERT INTO chunks (document_id, chunk_index, page_number, content, embedding)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    document_id,
                    chunk["chunk_index"],
                    chunk["page_number"],
                    chunk["content"],
                    json.dumps(chunk["embedding"]),
                )
                for chunk in chunks
            ],
        )


def delete_document(document_id: str) -> bool:
    with connect() as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        cursor = connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        return cursor.rowcount > 0


def search_chunks(query_embedding: list[float]) -> list[dict[str, Any]]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT c.document_id, d.filename, d.source_url, c.page_number,
                   c.content, c.embedding
            FROM chunks c JOIN documents d ON d.id = c.document_id
            """
        ).fetchall()
    return [
        {
            "document_id": row["document_id"],
            "filename": row["filename"],
            "source_url": row["source_url"],
            "page_number": row["page_number"],
            "content": row["content"],
            "embedding": json.loads(row["embedding"]),
        }
        for row in rows
    ]
