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
                onboarding_complete INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                full_name TEXT NOT NULL,
                account_type TEXT NOT NULL CHECK(account_type IN ('individual', 'college', 'organization')),
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS workspace_memberships (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, workspace_id)
            );
            CREATE INDEX IF NOT EXISTS idx_memberships_user ON workspace_memberships(user_id);
            CREATE TABLE IF NOT EXISTS college_profiles (
                workspace_id TEXT PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
                institution_name TEXT NOT NULL,
                department TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS organization_profiles (
                workspace_id TEXT PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
                organization_name TEXT NOT NULL,
                sector TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS user_sessions (
                token_hash TEXT PRIMARY KEY,
                csrf_hash TEXT NOT NULL,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(expires_at);
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
        _add_column(connection, "workspace", "onboarding_complete", "INTEGER NOT NULL DEFAULT 0")
        _add_column(connection, "emission_factors", "workspace_id", "TEXT")
        _add_column(connection, "activities", "workspace_id", "TEXT")
        _add_column(connection, "documents", "workspace_id", "TEXT")
        legacy_workspace = connection.execute(
            "SELECT id, name, account_type FROM workspace ORDER BY created_at LIMIT 1"
        ).fetchone()
        if legacy_workspace:
            workspace_id = legacy_workspace["id"]
            for table in ("emission_factors", "activities", "documents"):
                connection.execute(
                    f"UPDATE {table} SET workspace_id = ? WHERE workspace_id IS NULL",
                    (workspace_id,),
                )
            if legacy_workspace["account_type"] == "college":
                connection.execute(
                    """
                    INSERT OR IGNORE INTO college_profiles (workspace_id, institution_name)
                    VALUES (?, ?)
                    """,
                    (workspace_id, legacy_workspace["name"]),
                )
            elif legacy_workspace["account_type"] == "organization":
                connection.execute(
                    """
                    INSERT OR IGNORE INTO organization_profiles (workspace_id, organization_name)
                    VALUES (?, ?)
                    """,
                    (workspace_id, legacy_workspace["name"]),
                )
        connection.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_factors_workspace ON emission_factors(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_activities_workspace_period
                ON activities(workspace_id, period);
            CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
            """
        )


def _add_column(
    connection: sqlite3.Connection, table: str, column: str, definition: str
) -> None:
    columns = {
        row["name"] for row in connection.execute(f"PRAGMA table_info({table})")
    }
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def create_account(
    email: str,
    full_name: str,
    account_type: str,
    password_hash: str,
) -> dict[str, Any]:
    user_id = str(uuid.uuid4())
    with connect() as connection:
        existing = connection.execute(
            "SELECT id FROM users WHERE email = ? COLLATE NOCASE", (email,)
        ).fetchone()
        if existing:
            raise ValueError("An account with this email already exists.")

        user_count = int(connection.execute("SELECT COUNT(*) FROM users").fetchone()[0])
        legacy = None
        if user_count == 0:
            legacy = connection.execute(
                """
                SELECT id FROM workspace w
                WHERE NOT EXISTS (
                    SELECT 1 FROM workspace_memberships m WHERE m.workspace_id = w.id
                )
                ORDER BY created_at LIMIT 1
                """
            ).fetchone()

        if legacy:
            workspace_id = str(legacy["id"])
            connection.execute(
                "UPDATE workspace SET account_type = ? WHERE id = ?",
                (account_type, workspace_id),
            )
        else:
            workspace_id = str(uuid.uuid4())
            connection.execute(
                """
                INSERT INTO workspace (id, name, account_type, region)
                VALUES (?, ?, ?, ?)
                """,
                (workspace_id, full_name, account_type, "India"),
            )

        connection.execute(
            """
            INSERT INTO users (id, email, full_name, account_type, password_hash)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, email, full_name, account_type, password_hash),
        )
        connection.execute(
            """
            INSERT INTO workspace_memberships (id, user_id, workspace_id, role)
            VALUES (?, ?, ?, 'owner')
            """,
            (str(uuid.uuid4()), user_id, workspace_id),
        )
        if account_type == "college":
            connection.execute(
                """
                INSERT OR IGNORE INTO college_profiles (workspace_id, institution_name)
                VALUES (?, ?)
                """,
                (workspace_id, full_name),
            )
        elif account_type == "organization":
            connection.execute(
                """
                INSERT OR IGNORE INTO organization_profiles (workspace_id, organization_name)
                VALUES (?, ?)
                """,
                (workspace_id, full_name),
            )
    return {"id": user_id, "workspace_id": workspace_id}


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email,)
        ).fetchone()
    return dict(row) if row else None


def create_session(
    token_hash: str, csrf_hash: str, user_id: str, expires_at: str
) -> None:
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO user_sessions (token_hash, csrf_hash, user_id, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token_hash, csrf_hash, user_id, expires_at),
        )


def get_session(token_hash: str, now: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            """
            SELECT s.token_hash, s.csrf_hash, s.expires_at, u.id AS user_id,
                   u.email, u.full_name, u.account_type, m.workspace_id, m.role,
                   w.onboarding_complete
            FROM user_sessions s
            JOIN users u ON u.id = s.user_id
            JOIN workspace_memberships m ON m.user_id = u.id
            JOIN workspace w ON w.id = m.workspace_id
            WHERE s.token_hash = ? AND s.expires_at > ?
            ORDER BY m.created_at LIMIT 1
            """,
            (token_hash, now),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token_hash: str) -> None:
    with connect() as connection:
        connection.execute("DELETE FROM user_sessions WHERE token_hash = ?", (token_hash,))


def get_workspace(workspace_id: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM workspace WHERE id = ?", (workspace_id,)
        ).fetchone()
        if not row:
            return None
        workspace = dict(row)
        if workspace["account_type"] == "college":
            profile = connection.execute(
                "SELECT institution_name, department FROM college_profiles WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
            workspace["profile"] = dict(profile) if profile else None
        elif workspace["account_type"] == "organization":
            profile = connection.execute(
                "SELECT organization_name, sector FROM organization_profiles WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
            workspace["profile"] = dict(profile) if profile else None
        else:
            workspace["profile"] = None
    return workspace


def save_workspace(
    workspace_id: str,
    name: str,
    account_type: str,
    region: str,
    profile_name: str,
    profile_detail: str,
) -> dict[str, Any]:
    with connect() as connection:
        connection.execute(
            """
            UPDATE workspace SET name = ?, region = ?, onboarding_complete = 1
            WHERE id = ? AND account_type = ?
            """,
            (name, region, workspace_id, account_type),
        )
        if connection.total_changes == 0:
            return {}
        if account_type == "college":
            connection.execute(
                """
                INSERT INTO college_profiles (workspace_id, institution_name, department)
                VALUES (?, ?, ?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    institution_name = excluded.institution_name,
                    department = excluded.department
                """,
                (workspace_id, profile_name, profile_detail),
            )
        elif account_type == "organization":
            connection.execute(
                """
                INSERT INTO organization_profiles (workspace_id, organization_name, sector)
                VALUES (?, ?, ?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    organization_name = excluded.organization_name,
                    sector = excluded.sector
                """,
                (workspace_id, profile_name, profile_detail),
            )
    return get_workspace(workspace_id) or {}


def set_monthly_target(workspace_id: str, target_kg: float | None) -> None:
    with connect() as connection:
        connection.execute(
            "UPDATE workspace SET monthly_target_kg = ? WHERE id = ?",
            (target_kg, workspace_id),
        )


def save_factor(
    workspace_id: str,
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
                (id, workspace_id, category, name, value, unit, source_name, source_url,
                 factor_year, region, assumptions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (factor_id, workspace_id, category, name, value, unit, source_name, source_url,
             factor_year, region, assumptions),
        )
        row = connection.execute(
            "SELECT * FROM emission_factors WHERE id = ?", (factor_id,)
        ).fetchone()
    return dict(row)


def list_factors(workspace_id: str, category: str | None = None) -> list[dict[str, Any]]:
    with connect() as connection:
        if category:
            rows = connection.execute(
                "SELECT * FROM emission_factors WHERE workspace_id = ? AND category = ? ORDER BY name",
                (workspace_id, category),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM emission_factors WHERE workspace_id = ? ORDER BY category, name",
                (workspace_id,),
            ).fetchall()
    return [dict(row) for row in rows]


def get_factor(factor_id: str, workspace_id: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM emission_factors WHERE id = ? AND workspace_id = ?",
            (factor_id, workspace_id),
        ).fetchone()
    return dict(row) if row else None


def save_activity(
    workspace_id: str,
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
                id, workspace_id, category, description, quantity, unit, period, reporting_unit,
                factor_id, factor_name, factor_value, factor_unit, factor_source,
                factor_source_url, factor_year, factor_region, assumptions, emissions_kg
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                activity_id, workspace_id, category, description, quantity, unit, period,
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


def list_activities(
    workspace_id: str, period: str | None = None
) -> list[dict[str, Any]]:
    with connect() as connection:
        if period:
            rows = connection.execute(
                "SELECT * FROM activities WHERE workspace_id = ? AND period = ? ORDER BY created_at DESC",
                (workspace_id, period),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM activities WHERE workspace_id = ? ORDER BY period DESC, created_at DESC",
                (workspace_id,),
            ).fetchall()
    return [dict(row) for row in rows]


def delete_activity(activity_id: str, workspace_id: str) -> bool:
    with connect() as connection:
        cursor = connection.execute(
            "DELETE FROM activities WHERE id = ? AND workspace_id = ?",
            (activity_id, workspace_id),
        )
        return cursor.rowcount > 0


def get_dashboard(workspace_id: str, period: str) -> dict[str, Any]:
    year, month = (int(value) for value in period.split("-"))
    previous_period = f"{year - 1:04d}-12" if month == 1 else f"{year:04d}-{month - 1:02d}"
    with connect() as connection:
        current = connection.execute(
            """
            SELECT COALESCE(SUM(emissions_kg), 0) AS total, COUNT(*) AS activity_count
            FROM activities WHERE workspace_id = ? AND period = ?
            """,
            (workspace_id, period),
        ).fetchone()
        previous = connection.execute(
            "SELECT COALESCE(SUM(emissions_kg), 0) FROM activities WHERE workspace_id = ? AND period = ?",
            (workspace_id, previous_period),
        ).fetchone()[0]
        categories = connection.execute(
            """
            SELECT category, SUM(emissions_kg) AS emissions_kg
            FROM activities WHERE workspace_id = ? AND period = ? GROUP BY category ORDER BY emissions_kg DESC
            """,
            (workspace_id, period),
        ).fetchall()
        contributors = connection.execute(
            """
            SELECT id, category, description, reporting_unit, emissions_kg
            FROM activities WHERE workspace_id = ? AND period = ? ORDER BY emissions_kg DESC LIMIT 5
            """,
            (workspace_id, period),
        ).fetchall()
        trend = connection.execute(
            """
            SELECT period, SUM(emissions_kg) AS emissions_kg
            FROM activities WHERE workspace_id = ? AND period < ? GROUP BY period
            ORDER BY period DESC LIMIT 5
            """,
            (workspace_id, period),
        ).fetchall()
        workspace = connection.execute(
            "SELECT monthly_target_kg FROM workspace WHERE id = ?",
            (workspace_id,),
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


def count_documents(workspace_id: str) -> int:
    with connect() as connection:
        return int(
            connection.execute(
                "SELECT COUNT(*) FROM documents WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()[0]
        )


def list_documents(workspace_id: str) -> list[dict[str, Any]]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT d.id, d.filename, d.source_url, d.created_at, COUNT(c.id) AS chunk_count
            FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
            WHERE d.workspace_id = ?
            GROUP BY d.id ORDER BY d.created_at DESC
            """,
            (workspace_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_document_by_hash(workspace_id: str, sha256: str) -> dict[str, Any] | None:
    with connect() as connection:
        row = connection.execute(
            "SELECT id, filename FROM documents WHERE workspace_id = ? AND sha256 = ?",
            (workspace_id, sha256),
        ).fetchone()
    return dict(row) if row else None


def save_document(
    workspace_id: str,
    document_id: str,
    filename: str,
    sha256: str,
    source_url: str | None,
    chunks: list[dict[str, Any]],
) -> None:
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO documents (id, workspace_id, filename, sha256, source_url)
            VALUES (?, ?, ?, ?, ?)
            """,
            (document_id, workspace_id, filename, sha256, source_url),
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


def delete_document(document_id: str, workspace_id: str) -> bool:
    with connect() as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        cursor = connection.execute(
            "DELETE FROM documents WHERE id = ? AND workspace_id = ?",
            (document_id, workspace_id),
        )
        return cursor.rowcount > 0


def search_chunks(workspace_id: str, query_embedding: list[float]) -> list[dict[str, Any]]:
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT c.document_id, d.filename, d.source_url, c.page_number,
                   c.content, c.embedding
            FROM chunks c JOIN documents d ON d.id = c.document_id
            WHERE d.workspace_id = ?
            """,
            (workspace_id,),
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
