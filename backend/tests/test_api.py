"""API integration tests."""

import pytest
import sys
sys.path.insert(0, '..')

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from database import Base, get_db


# Test database setup
TEST_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test, drop after"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


class TestGraphCRUD:
    def test_create_graph(self):
        response = client.post("/graphs", json={"name": "Test Graph"})
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Graph"
        assert "id" in data

    def test_list_graphs(self):
        client.post("/graphs", json={"name": "Graph 1"})
        client.post("/graphs", json={"name": "Graph 2"})

        response = client.get("/graphs")
        assert response.status_code == 200
        graphs = response.json()
        assert len(graphs) == 2

    def test_get_graph(self):
        create_resp = client.post("/graphs", json={"name": "Test"})
        graph_id = create_resp.json()["id"]

        response = client.get(f"/graphs/{graph_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test"
        assert "nodes" in data
        assert "edges" in data

    def test_get_nonexistent_graph(self):
        response = client.get("/graphs/999")
        assert response.status_code == 404

    def test_delete_graph(self):
        create_resp = client.post("/graphs", json={"name": "ToDelete"})
        graph_id = create_resp.json()["id"]

        response = client.delete(f"/graphs/{graph_id}")
        assert response.status_code == 200

        get_resp = client.get(f"/graphs/{graph_id}")
        assert get_resp.status_code == 404


class TestNodeCRUD:
    def test_create_node(self):
        graph = client.post("/graphs", json={"name": "Test"}).json()

        response = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "Node 1",
            "prompt": "Do something",
            "agent_type": "claude"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Node 1"
        assert data["agent_type"] == "claude"

    def test_invalid_agent_type(self):
        graph = client.post("/graphs", json={"name": "Test"}).json()

        response = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "Bad Node",
            "prompt": "Do something",
            "agent_type": "invalid"
        })
        assert response.status_code == 400

    def test_delete_node(self):
        graph = client.post("/graphs", json={"name": "Test"}).json()
        node = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "Node",
            "prompt": "Task",
            "agent_type": "claude"
        }).json()

        response = client.delete(f"/nodes/{node['id']}")
        assert response.status_code == 200


class TestEdgeCRUD:
    def test_create_edge(self):
        graph = client.post("/graphs", json={"name": "Test"}).json()
        node1 = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "A", "prompt": "Task A", "agent_type": "claude"
        }).json()
        node2 = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "B", "prompt": "Task B", "agent_type": "codex"
        }).json()

        response = client.post(f"/graphs/{graph['id']}/edges", json={
            "parent_id": node1["id"],
            "child_id": node2["id"]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["parent_id"] == node1["id"]
        assert data["child_id"] == node2["id"]

    def test_edge_wrong_graph(self):
        """Cannot create edge with nodes from different graph"""
        graph1 = client.post("/graphs", json={"name": "G1"}).json()
        graph2 = client.post("/graphs", json={"name": "G2"}).json()

        node1 = client.post(f"/graphs/{graph1['id']}/nodes", json={
            "title": "A", "prompt": "Task", "agent_type": "claude"
        }).json()
        node2 = client.post(f"/graphs/{graph2['id']}/nodes", json={
            "title": "B", "prompt": "Task", "agent_type": "claude"
        }).json()

        response = client.post(f"/graphs/{graph1['id']}/edges", json={
            "parent_id": node1["id"],
            "child_id": node2["id"]
        })
        assert response.status_code == 400

    def test_duplicate_edge(self):
        """Cannot create duplicate edge"""
        graph = client.post("/graphs", json={"name": "Test"}).json()
        node1 = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "A", "prompt": "Task", "agent_type": "claude"
        }).json()
        node2 = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "B", "prompt": "Task", "agent_type": "claude"
        }).json()

        client.post(f"/graphs/{graph['id']}/edges", json={
            "parent_id": node1["id"], "child_id": node2["id"]
        })

        response = client.post(f"/graphs/{graph['id']}/edges", json={
            "parent_id": node1["id"], "child_id": node2["id"]
        })
        assert response.status_code == 400

    def test_self_loop(self):
        """Cannot create self-loop"""
        graph = client.post("/graphs", json={"name": "Test"}).json()
        node = client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "A", "prompt": "Task", "agent_type": "claude"
        }).json()

        response = client.post(f"/graphs/{graph['id']}/edges", json={
            "parent_id": node["id"], "child_id": node["id"]
        })
        assert response.status_code == 400


class TestRunExecution:
    def test_create_run(self):
        graph = client.post("/graphs", json={"name": "Test"}).json()
        client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "A", "prompt": "Task", "agent_type": "claude"
        })

        response = client.post(f"/graphs/{graph['id']}/run")
        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data

    def test_get_run(self):
        graph = client.post("/graphs", json={"name": "Test"}).json()
        client.post(f"/graphs/{graph['id']}/nodes", json={
            "title": "A", "prompt": "Task", "agent_type": "claude"
        })
        run = client.post(f"/graphs/{graph['id']}/run").json()

        response = client.get(f"/runs/{run['run_id']}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        assert len(data["node_runs"]) == 1
        assert data["node_runs"][0]["status"] == "pending"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
