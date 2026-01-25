def test_create_task_global(client):
    response = client.post("/tasks", json={
        "title": "Global Task",
        "description": "A task without project"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Global Task"
    assert data["project_id"] is None


def test_create_task_with_project(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()

    response = client.post("/tasks", json={
        "title": "Project Task",
        "project_id": project["id"]
    })
    assert response.status_code == 201
    assert response.json()["project_id"] == project["id"]


def test_list_tasks_filter_by_project(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()
    client.post("/tasks", json={"title": "Global Task"})
    client.post("/tasks", json={"title": "Project Task", "project_id": project["id"]})

    # Filter by project
    response = client.get(f"/tasks?project_id={project['id']}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Project Task"


def test_list_tasks_filter_by_completed(client):
    client.post("/tasks", json={"title": "Incomplete Task", "completed": False})
    client.post("/tasks", json={"title": "Complete Task", "completed": True})

    response = client.get("/tasks?completed=false")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Incomplete Task"


def test_update_task(client):
    task = client.post("/tasks", json={"title": "Original"}).json()

    response = client.patch(f"/tasks/{task['id']}", json={
        "title": "Updated",
        "completed": True
    })
    assert response.status_code == 200
    assert response.json()["title"] == "Updated"
    assert response.json()["completed"] is True


def test_delete_task(client):
    task = client.post("/tasks", json={"title": "To Delete"}).json()

    response = client.delete(f"/tasks/{task['id']}")
    assert response.status_code == 204

    response = client.get(f"/tasks/{task['id']}")
    assert response.status_code == 404
