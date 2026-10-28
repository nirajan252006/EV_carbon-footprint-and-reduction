import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from .config import DATABASE_PATH


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
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
            CREATE TABLE IF NOT EXISTS workspace (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                account_type TEXT NOT NULL CHECK(account_type IN ('individual', 'college', 'organization')),
                region TEXT NOT NULL,
                monthly_target_kg REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS emission_factors (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL CHECK(category IN ('electricity', 'transport', 'fuel', 'waste')),
                name TEXT NOT NULL,
                value REAL NOT NULL CHECK(value >= 0),
                unit TEXT NOT NULL,
                source_name TEXT NOT NULL,
                source_url TEXT NOT NULL,
                factor_year INTEGER NOT NULL,
                region TEXT NOT NULL,
                assumptions TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS activities (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL CHECK(category IN ('electricity', 'transport', 'fuel', 'waste')),
                description TEXT NOT NULL,
                quantity REAL NOT NULL CHECK(quantity > 0),
                unit TEXT NOT NULL,
                period TEXT NOT NULL,
                reporting_unit TEXT NOT NULL DEFAULT '',
                factor_id TEXT NOT NULL REFERENCES emission_factors(id) ON DELETE RESTRICT,
                factor_name TEXT NOT NULL,
                factor_value REAL NOT NULL,
                factor_unit TEXT NOT NULL,
                factor_source TEXT NOT NULL,
                factor_source_url TEXT NOT NULL,
                factor_year INTEGER NOT NULL,
                factor_region TEXT NOT NULL,
                assumptions TEXT NOT NULL,
                emissions_kg REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_activities_period ON activities(period);
            """
        )


def get_workspace() -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute("SELECT * FROM workspace LIMIT 1").fetchone()
    return dict(row) if row else None


def save_workspace(
    name: str, account_type: str, region: str, monthly_target_kg: float | None = None
) -> dict[str, Any]:
    existing = get_workspace()
    workspace_id = str(existing["id"]) if existing else str(uuid.uuid4())
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO workspace (id, name, account_type, region, monthly_target_kg)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,
                account_type=excluded.account_type, region=excluded.region,
                monthly_target_kg=excluded.monthly_target_kg
            """,
            (workspace_id, name, account_type, region, monthly_target_kg),
        )
    return get_workspace() or {}


def set_monthly_target(target_kg: float | None) -> None:
    with connect() as connection:
        connection.execute("UPDATE workspace SET monthly_target_kg = ?", (target_kg,))


def save_factor(
    category: str,
    name: str,
    value: float,
    unit: str,
    source_name: str,
    source_url: str,
    factor_year: int,
    region: str,
    assumptions: str,
) -> dict[str, Any]:
    factor_id = str(uuid.uuid4())
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO emission_factors
                (id, category, name, value, unit, source_name, source_url,
                 factor_year, region, assumptions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (factor_id, category, name, value, unit, source_name, source_url,
             factor_year, region, assumptions),
        )
        row = connection.execute(
            "SELECT * FROM emission_factors WHERE id = ?", (factor_id,)
        ).fetchone()
    return dict(row)


def list_factors(category: str | None = None) -> list[dict[str, Any]]:
    with connect() as connection:
        if category:
            rows = connection.execute(
                "SELECT * FROM emission_factors WHERE category = ? ORDER BY name",
                (category,),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM emission_factors ORDER BY category, name"
            ).fetchall()
    return [dict(row) for row in rows]


def get_factor(factor_id: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM emission_factors WHERE id = ?", (factor_id,)
        ).fetchone()
    return dict(row) if row else None


def save_activity(
    category: str,
    description: str,
    quantity: float,
    unit: str,
    period: str,
    reporting_unit: str,
    factor: dict[str, Any],
    emissions_kg: float,
) -> dict[str, Any]:
    activity_id = str(uuid.uuid4())
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO activities (
                id, category, description, quantity, unit, period, reporting_unit,
                factor_id, factor_name, factor_value, factor_unit, factor_source,
                factor_source_url, factor_year, factor_region, assumptions, emissions_kg
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                activity_id, category, description, quantity, unit, period,
                reporting_unit, factor["id"], factor["name"], factor["value"],
                factor["unit"], factor["source_name"], factor["source_url"],
                factor["factor_year"], factor["region"], factor["assumptions"],
                emissions_kg,
            ),
        )
        row = connection.execute(
            "SELECT * FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
    return dict(row)


def list_activities(period: str | None = None) -> list[dict[str, Any]]:
    with connect() as connection:
        if period:
            rows = connection.execute(
                "SELECT * FROM activities WHERE period = ? ORDER BY created_at DESC",
                (period,),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM activities ORDER BY period DESC, created_at DESC"
            ).fetchall()
    return [dict(row) for row in rows]


def delete_activity(activity_id: str) -> bool:
    with connect() as connection:
        cursor = connection.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
        return cursor.rowcount > 0


def get_dashboard(period: str) -> dict[str, Any]:
    year, month = (int(value) for value in period.split("-"))
    previous_period = f"{year - 1:04d}-12" if month == 1 else f"{year:04d}-{month - 1:02d}"
    with connect() as connection:
        current = connection.execute(
            """
            SELECT COALESCE(SUM(emissions_kg), 0) AS total, COUNT(*) AS activity_count
            FROM activities WHERE period = ?
            """,
            (period,),
        ).fetchone()
        previous = connection.execute(
            "SELECT COALESCE(SUM(emissions_kg), 0) FROM activities WHERE period = ?",
            (previous_period,),
        ).fetchone()[0]
        categories = connection.execute(
            """
            SELECT category, SUM(emissions_kg) AS emissions_kg
            FROM activities WHERE period = ? GROUP BY category ORDER BY emissions_kg DESC
            """,
            (period,),
        ).fetchall()
        contributors = connection.execute(
            """
            SELECT id, category, description, reporting_unit, emissions_kg
            FROM activities WHERE period = ? ORDER BY emissions_kg DESC LIMIT 5
            """,
            (period,),
        ).fetchall()
        trend = connection.execute(
            """
            SELECT period, SUM(emissions_kg) AS emissions_kg
            FROM activities WHERE period < ? GROUP BY period
            ORDER BY period DESC LIMIT 5
            """,
            (period,),
        ).fetchall()
        workspace = connection.execute(
            "SELECT monthly_target_kg FROM workspace LIMIT 1"
        ).fetchone()
    trend_rows = [{"period": row["period"], "emissions_kg": row["emissions_kg"]} for row in trend]
    trend_rows.reverse()
    trend_rows.append({"period": period, "emissions_kg": current["total"]})
    return {
        "period": period,
        "previous_period": previous_period,
        "total_kg": current["total"],
        "previous_total_kg": previous,
        "activity_count": current["activity_count"],
        "categories": [dict(row) for row in categories],
        "contributors": [dict(row) for row in contributors],
        "trend": trend_rows,
        "monthly_target_kg": workspace["monthly_target_kg"] if workspace else None,
    }


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
