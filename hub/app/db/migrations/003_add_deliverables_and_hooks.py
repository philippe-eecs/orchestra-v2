"""Add deliverables, hooks tables and new node columns."""

from sqlalchemy import text
from app.db.database import engine


def migrate():
    """Add new tables and columns for deliverables and hooks."""
    with engine.connect() as conn:
        # Add node_type column to nodes table
        try:
            conn.execute(text("ALTER TABLE nodes ADD COLUMN node_type VARCHAR(50) DEFAULT 'task'"))
            print("Added node_type column to nodes")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                print("node_type column already exists")
            else:
                raise

        # Add expected_deliverables column to nodes table
        try:
            conn.execute(text("ALTER TABLE nodes ADD COLUMN expected_deliverables JSON DEFAULT '[]'"))
            print("Added expected_deliverables column to nodes")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                print("expected_deliverables column already exists")
            else:
                raise

        # Create deliverables table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS deliverables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                execution_id INTEGER REFERENCES executions(id) ON DELETE SET NULL,
                type VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                content TEXT DEFAULT '',
                status VARCHAR(50) DEFAULT 'pending',
                validation_errors JSON DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        print("Created deliverables table")

        # Create hook_nodes table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS hook_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id INTEGER UNIQUE NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                name VARCHAR(255) DEFAULT 'Validation Hook',
                trigger VARCHAR(50) NOT NULL,
                action VARCHAR(50) NOT NULL,
                required_deliverables JSON DEFAULT '[]',
                validation_rules JSON DEFAULT '{}',
                requires_human_approval BOOLEAN DEFAULT 0,
                max_retries INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        print("Created hook_nodes table")

        conn.commit()
        print("Migration completed successfully")


if __name__ == "__main__":
    migrate()
