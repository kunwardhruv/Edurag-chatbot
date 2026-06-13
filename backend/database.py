# database.py — SQLite Q&A history management
# WHY SQLite: Zero config, file-based, perfect for local apps

import sqlite3
import json
from datetime import datetime
from config import DB_PATH


def get_connection():
    """Get SQLite connection with row_factory for dict-like access."""
    conn = sqlite3.connect(DB_PATH)
    # WHY row_factory: Returns rows as dicts instead of tuples
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist. Called on app startup."""
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS qa_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            query       TEXT    NOT NULL,
            answer      TEXT    NOT NULL,
            book_name   TEXT    NOT NULL,
            class_name  TEXT    NOT NULL,
            subject     TEXT    NOT NULL,
            score       REAL,
            chunks_used INTEGER,
            source      TEXT,
            created_at  TEXT    NOT NULL
        )
    """)
    # Index for fast filtering by book
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_book
        ON qa_history (book_name, class_name, subject)
    """)
    conn.commit()
    conn.close()


def save_qa(
    query: str,
    answer: str,
    book_name: str,
    class_name: str,
    subject: str,
    score: float,
    chunks_used: int,
    source: str
) -> int:
    """Save a Q&A pair to history. Returns the new row ID."""
    conn = get_connection()
    cursor = conn.execute("""
        INSERT INTO qa_history
            (query, answer, book_name, class_name, subject, score, chunks_used, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        query, answer, book_name, class_name, subject,
        score, chunks_used, source,
        datetime.now().isoformat()
    ))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_all_history(limit: int = 100, offset: int = 0) -> list[dict]:
    """Fetch paginated Q&A history, newest first."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT * FROM qa_history
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    """, (limit, offset)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_history_by_book(book_name: str) -> list[dict]:
    """Fetch history for a specific book."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT * FROM qa_history
        WHERE book_name = ?
        ORDER BY created_at DESC
    """, (book_name,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_history_item(item_id: int) -> bool:
    """Delete a single history entry by ID."""
    conn = get_connection()
    cursor = conn.execute("DELETE FROM qa_history WHERE id = ?", (item_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def clear_all_history() -> int:
    """Clear all history. Returns number of deleted rows."""
    conn = get_connection()
    cursor = conn.execute("DELETE FROM qa_history")
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count


def get_stats() -> dict:
    """Get overall stats for the dashboard."""
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) as c FROM qa_history").fetchone()["c"]
    books = conn.execute("SELECT COUNT(DISTINCT book_name) as c FROM qa_history").fetchone()["c"]
    recent = conn.execute("""
        SELECT query, book_name, created_at FROM qa_history
        ORDER BY created_at DESC LIMIT 5
    """).fetchall()
    conn.close()
    return {
        "total_queries": total,
        "books_queried": books,
        "recent": [dict(r) for r in recent]
    }
