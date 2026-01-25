def test_generate_plan(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()

    response = client.post(f"/projects/{project['id']}/plan", json={
        "prompt": "Build a REST API with user authentication"
    })
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) > 0


def test_generate_plan_with_resources(client):
    project = client.post("/projects", json={"name": "Test Project"}).json()

    response = client.post(f"/projects/{project['id']}/plan", json={
        "prompt": "Implement feature X",
        "resources": [
            {"kind": "url", "title": "Spec", "url": "https://example.com/spec"}
        ]
    })
    assert response.status_code == 200
    assert "nodes" in response.json()


def test_generate_plan_project_not_found(client):
    response = client.post("/projects/999/plan", json={
        "prompt": "Test"
    })
    assert response.status_code == 404
