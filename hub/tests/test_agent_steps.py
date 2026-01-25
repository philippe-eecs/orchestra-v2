"""Tests for agent step CRUD operations."""


def test_create_step(client, sample_step_data):
    """Test creating a step for an existing template."""
    # Create template first
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()

    response = client.post(
        f"/agent-templates/{template['id']}/steps",
        json=sample_step_data
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Step"
    assert data["template_id"] == template["id"]
    assert data["agent_type"] == "claude"
    assert data["output_format"] == "text"
    assert data["position_x"] == 200
    assert data["position_y"] == 200
    assert "id" in data


def test_create_step_all_agent_types(client):
    """Test creating steps with all agent types."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()

    agent_types = ["claude", "codex", "gemini", "custom"]
    for agent_type in agent_types:
        response = client.post(
            f"/agent-templates/{template['id']}/steps",
            json={
                "name": f"{agent_type.capitalize()} Step",
                "agent_type": agent_type,
                "prompt_template": f"Test prompt for {agent_type}",
                "output_format": "text",
            }
        )
        assert response.status_code == 201
        assert response.json()["agent_type"] == agent_type


def test_create_step_all_output_formats(client):
    """Test creating steps with all output formats."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()

    output_formats = ["text", "json", "code", "markdown"]
    for output_format in output_formats:
        response = client.post(
            f"/agent-templates/{template['id']}/steps",
            json={
                "name": f"{output_format.capitalize()} Output Step",
                "agent_type": "claude",
                "prompt_template": "Test prompt",
                "output_format": output_format,
            }
        )
        assert response.status_code == 201
        assert response.json()["output_format"] == output_format


def test_create_step_template_not_found(client, sample_step_data):
    """Test 404 when creating step for non-existent template."""
    response = client.post("/agent-templates/99999/steps", json=sample_step_data)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_update_step(client, sample_step_data):
    """Test updating a step."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()
    step = client.post(
        f"/agent-templates/{template['id']}/steps",
        json=sample_step_data
    ).json()

    response = client.patch(
        f"/agent-templates/{template['id']}/steps/{step['id']}",
        json={
            "name": "Updated Step",
            "agent_type": "gemini",
            "prompt_template": "New prompt",
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Step"
    assert data["agent_type"] == "gemini"
    assert data["prompt_template"] == "New prompt"
    # Original values preserved
    assert data["output_format"] == "text"


def test_update_step_position(client, sample_step_data):
    """Test updating step position."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()
    step = client.post(
        f"/agent-templates/{template['id']}/steps",
        json=sample_step_data
    ).json()

    response = client.patch(
        f"/agent-templates/{template['id']}/steps/{step['id']}",
        json={"position_x": 500, "position_y": 300}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["position_x"] == 500
    assert data["position_y"] == 300


def test_update_step_not_found(client):
    """Test 404 when updating non-existent step."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()

    response = client.patch(
        f"/agent-templates/{template['id']}/steps/99999",
        json={"name": "Updated"}
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_delete_step(client, sample_step_data):
    """Test deleting a step."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()
    step = client.post(
        f"/agent-templates/{template['id']}/steps",
        json=sample_step_data
    ).json()

    response = client.delete(
        f"/agent-templates/{template['id']}/steps/{step['id']}"
    )
    assert response.status_code == 204

    # Verify step is gone (template should have no steps)
    template_data = client.get(f"/agent-templates/{template['id']}").json()
    assert len(template_data["steps"]) == 0


def test_create_step_with_model_config(client):
    """Test creating a step with model/reasoning configuration."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()

    # Claude step with thinking budget
    response = client.post(
        f"/agent-templates/{template['id']}/steps",
        json={
            "name": "Claude Step",
            "agent_type": "claude",
            "prompt_template": "Analyze this",
            "thinking_budget": 16000,
            "model_version": "claude-opus-4-5-20251101",
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["thinking_budget"] == 16000
    assert data["model_version"] == "claude-opus-4-5-20251101"
    assert data["reasoning_level"] is None

    # Codex step with reasoning level
    response = client.post(
        f"/agent-templates/{template['id']}/steps",
        json={
            "name": "Codex Step",
            "agent_type": "codex",
            "prompt_template": "Generate code",
            "reasoning_level": "xhigh",
            "model_version": "codex-5.2",
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["reasoning_level"] == "xhigh"
    assert data["model_version"] == "codex-5.2"
    assert data["thinking_budget"] is None


def test_update_step_model_config(client, sample_step_data):
    """Test updating step model configuration."""
    template = client.post("/agent-templates", json={"name": "Test Template"}).json()
    step = client.post(
        f"/agent-templates/{template['id']}/steps",
        json=sample_step_data
    ).json()

    # Verify initial values are None
    assert step["thinking_budget"] is None
    assert step["reasoning_level"] is None
    assert step["model_version"] is None

    # Update with model config
    response = client.patch(
        f"/agent-templates/{template['id']}/steps/{step['id']}",
        json={
            "thinking_budget": 32000,
            "model_version": "claude-opus-4-5-20251101",
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["thinking_budget"] == 32000
    assert data["model_version"] == "claude-opus-4-5-20251101"
