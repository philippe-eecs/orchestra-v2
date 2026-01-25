"""Tests for agent execution flow - launching templates and verifying VM/executor behavior."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
import httpx


# Integration test for executor service (requires executor running on :8001)
@pytest.mark.skip(reason="Requires executor service and tmux installed")
def test_executor_service_health():
    """Test that executor service is accessible."""
    response = httpx.get("http://localhost:8001/docs", timeout=5.0)
    assert response.status_code == 200


@pytest.mark.skip(reason="Requires executor service and tmux installed")
def test_executor_creates_tmux_session():
    """Test that executor creates tmux sessions for executions."""
    response = httpx.post(
        "http://localhost:8001/executions/start",
        json={
            "execution_id": 999,
            "template_name": "Test",
            "steps": [{
                "id": 1,
                "name": "Test Step",
                "agent_type": "custom",
                "prompt_template": "echo 'Hello World'"
            }],
            "edges": [],
            "context": {},
            "create_worktree": False,
        },
        timeout=10.0
    )
    data = response.json()
    assert data.get("success") is True
    assert "tmux_session" in data
    assert data["tmux_session"] == "exec-999"


def test_launch_creates_execution(client, sample_template_data):
    """Test that launching a template creates an execution record."""
    # Create project and node first
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node",
        "description": "A test node for execution"
    }).json()

    # Create template
    template = client.post("/agent-templates", json=sample_template_data).json()

    # Launch execution
    response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/launch",
        json={
            "template_id": template["id"],
            "context": {"input": "test input", "task": "test task"},
            "create_worktree": False,
        }
    )
    assert response.status_code == 201
    data = response.json()

    # Verify execution record
    assert data["status"] == "pending"
    assert data["template_id"] == template["id"]
    assert data["node_id"] == node["id"]
    assert "tmux_session" in data
    assert data["tmux_session"] == f"exec-{data['id']}"

    # Verify step runs were created
    assert len(data["step_runs"]) == 2
    for step_run in data["step_runs"]:
        assert step_run["status"] == "pending"
        assert "prompt" in step_run  # Resolved prompt


def test_launch_resolves_prompt_variables(client):
    """Test that prompt template variables are resolved from context."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Feature Request",
        "description": "Add user authentication"
    }).json()

    # Create template with variables
    template = client.post("/agent-templates", json={
        "name": "Variable Test",
        "steps": [{
            "name": "Test Step",
            "agent_type": "claude",
            "prompt_template": "Work on: {{node.title}} - {{node.description}}. Custom: {{custom_var}}",
            "output_format": "text",
        }]
    }).json()

    # Launch with context
    response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/launch",
        json={
            "template_id": template["id"],
            "context": {"custom_var": "my custom value"},
            "create_worktree": False,
        }
    )
    assert response.status_code == 201
    data = response.json()

    # Verify prompt was resolved
    step_run = data["step_runs"][0]
    assert "Feature Request" in step_run["prompt"]
    assert "Add user authentication" in step_run["prompt"]
    assert "my custom value" in step_run["prompt"]


def test_preview_launch(client, sample_template_data):
    """Test previewing a launch without actually executing."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node",
        "prompt": "Do something"
    }).json()

    template = client.post("/agent-templates", json=sample_template_data).json()

    # Preview the launch
    response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/preview",
        json={
            "template_id": template["id"],
            "context": {"input": "preview input", "task": "preview task"},
        }
    )
    assert response.status_code == 200
    data = response.json()

    # Verify preview shows resolved prompts
    assert data["template_id"] == template["id"]
    assert "resolved_prompts" in data
    assert len(data["resolved_prompts"]) == 2

    # Verify context includes node data
    assert "node" in data["context"]
    assert data["context"]["node"]["title"] == "Test Node"


def test_launch_with_worktree(client, sample_template_data):
    """Test that worktree configuration is passed correctly."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node"
    }).json()

    template = client.post("/agent-templates", json=sample_template_data).json()

    # Launch with worktree enabled
    response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/launch",
        json={
            "template_id": template["id"],
            "context": {"input": "test", "task": "test"},
            "create_worktree": True,
        }
    )
    assert response.status_code == 201
    data = response.json()

    # Verify worktree config is set
    assert data["worktree_branch"] == f"agent/exec-{data['id']}"
    assert data["worktree_path"] == f"/worktrees/exec-{data['id']}"


def test_launch_template_not_found(client):
    """Test 404 when launching non-existent template."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node"
    }).json()

    response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/launch",
        json={
            "template_id": 99999,
            "context": {},
        }
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_launch_node_not_found(client, sample_template_data):
    """Test 404 when launching from non-existent node."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    template = client.post("/agent-templates", json=sample_template_data).json()

    response = client.post(
        f"/projects/{project['id']}/nodes/99999/launch",
        json={
            "template_id": template["id"],
            "context": {},
        }
    )
    assert response.status_code == 404


def test_get_execution(client, sample_template_data):
    """Test retrieving an execution by ID."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node"
    }).json()
    template = client.post("/agent-templates", json=sample_template_data).json()

    # Launch execution
    launch_response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/launch",
        json={
            "template_id": template["id"],
            "context": {"input": "test", "task": "test"},
        }
    )
    execution_id = launch_response.json()["id"]

    # Get execution (nested under project)
    response = client.get(f"/projects/{project['id']}/executions/{execution_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == execution_id
    assert len(data["step_runs"]) == 2


def test_list_executions_for_node(client, sample_template_data):
    """Test listing all executions for a specific node."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node"
    }).json()
    template = client.post("/agent-templates", json=sample_template_data).json()

    # Launch multiple executions
    for i in range(3):
        client.post(
            f"/projects/{project['id']}/nodes/{node['id']}/launch",
            json={
                "template_id": template["id"],
                "context": {"input": f"test {i}", "task": f"task {i}"},
            }
        )

    # List executions for node (nested under project)
    response = client.get(
        f"/projects/{project['id']}/executions",
        params={"node_id": node["id"]}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3


def test_cancel_execution(client, sample_template_data):
    """Test cancelling a running execution."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node"
    }).json()
    template = client.post("/agent-templates", json=sample_template_data).json()

    # Launch execution
    launch_response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/launch",
        json={
            "template_id": template["id"],
            "context": {"input": "test", "task": "test"},
        }
    )
    execution_id = launch_response.json()["id"]

    # Cancel execution
    response = client.post(
        f"/projects/{project['id']}/executions/{execution_id}/cancel"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "cancelled"
    assert data["finished_at"] is not None


def test_update_step_run(client, sample_template_data):
    """Test updating a step run status and output."""
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node"
    }).json()
    template = client.post("/agent-templates", json=sample_template_data).json()

    # Launch execution
    launch_response = client.post(
        f"/projects/{project['id']}/nodes/{node['id']}/launch",
        json={
            "template_id": template["id"],
            "context": {"input": "test", "task": "test"},
        }
    )
    execution = launch_response.json()
    step_run = execution["step_runs"][0]

    # Update step run
    response = client.patch(
        f"/projects/{project['id']}/executions/{execution['id']}/steps/{step_run['id']}",
        json={
            "status": "completed",
            "output": "Step completed successfully with output",
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["output"] == "Step completed successfully with output"
    assert data["finished_at"] is not None
