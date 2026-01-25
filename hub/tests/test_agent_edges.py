"""Tests for agent step edge (DAG) management."""

import json


def test_create_edge(client):
    """Test creating an edge between two steps."""
    # Create template with two steps
    template = client.post("/agent-templates", json={
        "name": "Test Template",
        "steps": [
            {"name": "Step 1", "agent_type": "claude", "prompt_template": "..."},
            {"name": "Step 2", "agent_type": "codex", "prompt_template": "..."},
        ]
    }).json()

    step1_id = template["steps"][0]["id"]
    step2_id = template["steps"][1]["id"]

    response = client.post(
        f"/agent-templates/{template['id']}/edges",
        json={"parent_id": step1_id, "child_id": step2_id}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["parent_id"] == step1_id
    assert data["child_id"] == step2_id


def test_create_edge_duplicate(client):
    """Test 400 when creating a duplicate edge."""
    template = client.post("/agent-templates", json={
        "name": "Test Template",
        "steps": [
            {"name": "Step 1", "agent_type": "claude", "prompt_template": "..."},
            {"name": "Step 2", "agent_type": "codex", "prompt_template": "..."},
        ],
        "edges": [{"parent_id": 0, "child_id": 1}]
    }).json()

    step1_id = template["steps"][0]["id"]
    step2_id = template["steps"][1]["id"]

    # Try to create duplicate edge
    response = client.post(
        f"/agent-templates/{template['id']}/edges",
        json={"parent_id": step1_id, "child_id": step2_id}
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_create_edge_step_not_found(client):
    """Test 400 when creating edge with non-existent step."""
    template = client.post("/agent-templates", json={
        "name": "Test Template",
        "steps": [
            {"name": "Step 1", "agent_type": "claude", "prompt_template": "..."},
        ]
    }).json()

    step1_id = template["steps"][0]["id"]

    # Try to create edge to non-existent step
    response = client.post(
        f"/agent-templates/{template['id']}/edges",
        json={"parent_id": step1_id, "child_id": 99999}
    )
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_delete_edge(client):
    """Test deleting an edge."""
    template = client.post("/agent-templates", json={
        "name": "Test Template",
        "steps": [
            {"name": "Step 1", "agent_type": "claude", "prompt_template": "..."},
            {"name": "Step 2", "agent_type": "codex", "prompt_template": "..."},
        ],
        "edges": [{"parent_id": 0, "child_id": 1}]
    }).json()

    step1_id = template["steps"][0]["id"]
    step2_id = template["steps"][1]["id"]

    # Delete the edge (DELETE with body requires using request method)
    response = client.request(
        "DELETE",
        f"/agent-templates/{template['id']}/edges",
        content=json.dumps({"parent_id": step1_id, "child_id": step2_id}),
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 204

    # Verify edge is gone
    template_data = client.get(f"/agent-templates/{template['id']}").json()
    assert len(template_data["edges"]) == 0


def test_edges_returned_in_template(client, sample_template_data):
    """Test that edges are properly returned when fetching a template."""
    template = client.post("/agent-templates", json=sample_template_data).json()

    # Fetch template and verify edges
    response = client.get(f"/agent-templates/{template['id']}")
    assert response.status_code == 200
    data = response.json()

    assert len(data["edges"]) == 1
    edge = data["edges"][0]
    assert edge["parent_id"] == data["steps"][0]["id"]
    assert edge["child_id"] == data["steps"][1]["id"]


def test_step_parent_child_ids(client, sample_template_data):
    """Test that parent_ids and child_ids are correctly populated on steps."""
    template = client.post("/agent-templates", json=sample_template_data).json()

    response = client.get(f"/agent-templates/{template['id']}")
    data = response.json()

    step1 = data["steps"][0]
    step2 = data["steps"][1]

    # Step 1 is parent, should have step 2 as child
    assert step2["id"] in step1["child_ids"]
    assert len(step1["parent_ids"]) == 0

    # Step 2 is child, should have step 1 as parent
    assert step1["id"] in step2["parent_ids"]
    assert len(step2["child_ids"]) == 0
