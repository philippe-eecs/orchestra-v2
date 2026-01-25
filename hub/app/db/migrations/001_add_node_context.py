"""Add context column to nodes table.

Run this migration manually if you have an existing database:
    python -m app.db.migrations.001_add_node_context
"""
import sqlite3
import os
from app.config import settings


def migrate():
    """Add context column to nodes table if it doesn't exist."""
    # Extract path from sqlite URL
    db_path = settings.database_url.replace("sqlite:///", "")

    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}, skipping migration")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if column exists
    cursor.execute("PRAGMA table_info(nodes)")
    columns = [row[1] for row in cursor.fetchall()]

    if "context" not in columns:
        print("Adding 'context' column to nodes table...")
        cursor.execute("ALTER TABLE nodes ADD COLUMN context TEXT")
        conn.commit()
        print("Migration complete!")
    else:
        print("Column 'context' already exists, skipping migration")

    conn.close()


if __name__ == "__main__":
    migrate()
