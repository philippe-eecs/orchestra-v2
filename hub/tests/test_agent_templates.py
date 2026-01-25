"""Tests for agent template CRUD operations."""


def test_create_template(client):
    """Test creating a basic template without steps."""
    response = client.post("/agent-templates", json={
        "name": "Simple Template",
        "description": "A simple test template",
        "metadata": {"icon": "test"},
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Simple Template"
    assert data["description"] == "A simple test template"
    assert data["metadata"]["icon"] == "test"
    assert "id" in data
    assert "created_at" in data
    assert data["steps"] == []
    assert data["edges"] == []


def test_create_template_with_steps_and_edges(client, sample_template_data):
    """Test creating a template with steps and edges."""
    response = client.post("/agent-templates", json=sample_template_data)
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "Test Pipeline"
    assert len(data["steps"]) == 2
    assert len(data["edges"]) == 1

    # Verify step properties
    step1 = data["steps"][0]
    assert step1["name"] == "Step 1"
    assert step1["agent_type"] == "claude"
    assert step1["output_format"] == "text"

    step2 = data["steps"][1]
    assert step2["name"] == "Step 2"
    assert step2["agent_type"] == "codex"
    assert step2["output_format"] == "code"

    # Verify edge connects step1 -> step2 using actual IDs
    edge = data["edges"][0]
    assert edge["parent_id"] == step1["id"]
    assert edge["child_id"] == step2["id"]


def test_create_template_with_invalid_edge_index(client):
    """Test 400 when edges reference unknown step indices."""
    response = client.post("/agent-templates", json={
        "name": "Invalid Edge Template",
        "steps": [
            {"name": "Step 1", "agent_type": "claude", "prompt_template": "..."},
        ],
        "edges": [
            {"parent_id": 0, "child_id": 2}
        ]
    })
    assert response.status_code == 400
    assert "edge references unknown step index" in response.json()["detail"].lower()


def test_list_templates(client):
    """Test listing all templates."""
    # Create two templates
    client.post("/agent-templates", json={"name": "Template 1"})
    client.post("/agent-templates", json={"name": "Template 2"})

    response = client.get("/agent-templates")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    # Should be ordered by created_at desc (most recent first)
    assert data[0]["name"] == "Template 2"
    assert data[1]["name"] == "Template 1"


def test_get_template(client, sample_template_data):
    """Test getting a single template with its steps and edges."""
    create_response = client.post("/agent-templates", json=sample_template_data)
    template_id = create_response.json()["id"]

    response = client.get(f"/agent-templates/{template_id}")
    assert response.status_code == 200
    data = response.json()

    assert data["id"] == template_id
    assert data["name"] == "Test Pipeline"
    assert len(data["steps"]) == 2
    assert len(data["edges"]) == 1

    # Verify parent_ids and child_ids are populated on steps
    step1 = data["steps"][0]
    step2 = data["steps"][1]
    assert step2["id"] in step1["child_ids"]
    assert step1["id"] in step2["parent_ids"]


def test_get_template_not_found(client):
    """Test 404 for non-existent template."""
    response = client.get("/agent-templates/99999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_update_template(client):
    """Test updating a template."""
    create_response = client.post("/agent-templates", json={
        "name": "Original Name",
        "description": "Original description"
    })
    template_id = create_response.json()["id"]

    response = client.patch(f"/agent-templates/{template_id}", json={
        "name": "Updated Name",
        "description": "Updated description",
        "metadata": {"updated": True}
    })
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["description"] == "Updated description"
    assert data["metadata"]["updated"] is True


def test_update_template_partial(client):
    """Test partial update of a template (only some fields)."""
    create_response = client.post("/agent-templates", json={
        "name": "Original Name",
        "description": "Original description",
        "metadata": {"keep": "this"}
    })
    template_id = create_response.json()["id"]

    # Update only name
    response = client.patch(f"/agent-templates/{template_id}", json={
        "name": "New Name"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "New Name"
    assert data["description"] == "Original description"
    assert data["metadata"]["keep"] == "this"


def test_delete_template(client, sample_template_data):
    """Test deleting a template cascades to steps."""
    create_response = client.post("/agent-templates", json=sample_template_data)
    template_id = create_response.json()["id"]

    # Delete the template
    response = client.delete(f"/agent-templates/{template_id}")
    assert response.status_code == 204

    # Verify template is gone
    response = client.get(f"/agent-templates/{template_id}")
    assert response.status_code == 404


def test_delete_template_not_found(client):
    """Test 404 when deleting non-existent template."""
    response = client.delete("/agent-templates/99999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
