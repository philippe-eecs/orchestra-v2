"""Add model configuration columns to agent_steps table."""

from sqlalchemy import text


def upgrade(connection):
    """Add model_version, thinking_budget, reasoning_level columns."""
    connection.execute(text("""
        ALTER TABLE agent_steps ADD COLUMN model_version VARCHAR(100);
    """))
    connection.execute(text("""
        ALTER TABLE agent_steps ADD COLUMN thinking_budget INTEGER;
    """))
    connection.execute(text("""
        ALTER TABLE agent_steps ADD COLUMN reasoning_level VARCHAR(50);
    """))


def downgrade(connection):
    """SQLite doesn't support DROP COLUMN easily, skip for now."""
    pass
