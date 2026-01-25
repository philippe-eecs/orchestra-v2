import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import engine, Base, SessionLocal
from app.db.seed_templates import seed_default_templates
from app.routers import (
    projects_router,
    nodes_router,
    tasks_router,
    runs_router,
    plan_router,
    ws_router,
    agent_templates_router,
    executions_router,
    launch_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    Base.metadata.create_all(bind=engine)

    # Seed default templates
    db = SessionLocal()
    try:
        seed_default_templates(db)
    finally:
        db.close()

    yield
    # Shutdown: cleanup if needed


app = FastAPI(
    title="Orchestra Hub",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(projects_router)
app.include_router(nodes_router)
app.include_router(tasks_router)
app.include_router(runs_router)
app.include_router(plan_router)
app.include_router(ws_router)
app.include_router(agent_templates_router)
app.include_router(executions_router)
app.include_router(launch_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "2.0.0"}


# Serve frontend static files (must be after all API routes)
dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="frontend")
