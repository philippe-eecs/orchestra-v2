def test_create_node(client):
    # Create project first
    project = client.post("/projects", json={"name": "Test Project"}).json()

    response = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Test Node",
        "description": "A test node",
        "status": "pending"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Node"
    assert data["project_id"] == project["id"]


def test_create_node_with_resources(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()

    response = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Node with Resources",
        "metadata": {
            "resources": [
                {"kind": "url", "title": "Docs", "url": "https://example.com"}
            ],
            "extra": {}
        }
    })
    assert response.status_code == 201
    data = response.json()
    assert len(data["metadata"]["resources"]) == 1
    assert data["metadata"]["resources"][0]["kind"] == "url"


def test_create_node_with_parent(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()
    parent = client.post(f"/projects/{project['id']}/nodes", json={"title": "Parent"}).json()

    response = client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Child",
        "parent_ids": [parent["id"]]
    })
    assert response.status_code == 201
    data = response.json()
    assert parent["id"] in data["parent_ids"]


def test_get_graph(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node1 = client.post(f"/projects/{project['id']}/nodes", json={"title": "Node 1"}).json()
    client.post(f"/projects/{project['id']}/nodes", json={
        "title": "Node 2",
        "parent_ids": [node1["id"]]
    })

    response = client.get(f"/projects/{project['id']}/graph")
    assert response.status_code == 200
    data = response.json()
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1


def test_update_node(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={"title": "Original"}).json()

    response = client.patch(f"/projects/{project['id']}/nodes/{node['id']}", json={
        "title": "Updated",
        "status": "completed"
    })
    assert response.status_code == 200
    assert response.json()["title"] == "Updated"
    assert response.json()["status"] == "completed"


def test_delete_node(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()
    node = client.post(f"/projects/{project['id']}/nodes", json={"title": "To Delete"}).json()

    response = client.delete(f"/projects/{project['id']}/nodes/{node['id']}")
    assert response.status_code == 204

    response = client.get(f"/projects/{project['id']}/nodes/{node['id']}")
    assert response.status_code == 404


def test_cascade_delete_project_nodes(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()
    client.post(f"/projects/{project['id']}/nodes", json={"title": "Node 1"})
    client.post(f"/projects/{project['id']}/nodes", json={"title": "Node 2"})

    # Delete project
    client.delete(f"/projects/{project['id']}")

    # Verify graph is empty (project gone)
    response = client.get(f"/projects/{project['id']}/graph")
    assert response.status_code == 404
