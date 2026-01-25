def test_create_project(client):
    response = client.post("/projects", json={
        "name": "Test Project",
        "description": "A test project"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Project"
    assert data["description"] == "A test project"
    assert "id" in data


def test_list_projects(client):
    # Create a project first
    client.post("/projects", json={"name": "Project 1"})
    client.post("/projects", json={"name": "Project 2"})

    response = client.get("/projects")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_get_project(client):
    create_response = client.post("/projects", json={"name": "Test Project"})
    project_id = create_response.json()["id"]

    response = client.get(f"/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Test Project"


def test_get_project_not_found(client):
    response = client.get("/projects/999")
    assert response.status_code == 404


def test_update_project(client):
    create_response = client.post("/projects", json={"name": "Original Name"})
    project_id = create_response.json()["id"]

    response = client.patch(f"/projects/{project_id}", json={"name": "Updated Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"


def test_delete_project(client):
    create_response = client.post("/projects", json={"name": "To Delete"})
    project_id = create_response.json()["id"]

    response = client.delete(f"/projects/{project_id}")
    assert response.status_code == 204

    # Verify it's gone
    response = client.get(f"/projects/{project_id}")
    assert response.status_code == 404
