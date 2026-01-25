import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import Base, get_db


# Use in-memory SQLite for tests
SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def sample_template_data():
    """Template with 2 steps and 1 edge for testing."""
    return {
        "name": "Test Pipeline",
        "description": "A test pipeline",
        "metadata": {"icon": "test", "version": "1.0"},
        "steps": [
            {
                "name": "Step 1",
                "agent_type": "claude",
                "prompt_template": "Analyze {{input}}",
                "output_format": "text",
                "position_x": 100,
                "position_y": 100,
            },
            {
                "name": "Step 2",
                "agent_type": "codex",
                "prompt_template": "Generate code for {{task}}",
                "output_format": "code",
                "position_x": 300,
                "position_y": 100,
            },
        ],
        "edges": [{"parent_id": 0, "child_id": 1}],
    }


@pytest.fixture
def sample_step_data():
    """Single step data for testing."""
    return {
        "name": "Test Step",
        "agent_type": "claude",
        "prompt_template": "Process {{input}}",
        "output_format": "text",
        "position_x": 200,
        "position_y": 200,
    }
