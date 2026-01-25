from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./orchestra.db"
    cors_origins: list[str] = ["http://localhost:1420", "http://localhost:5173", "tauri://localhost"]
    debug: bool = True

    # Executor service URL (runs on VM or locally for dev)
    executor_url: str = "http://159.65.109.198:8001"

    # Default repo path for worktree operations
    default_repo_path: str = "/home/executor"

    class Config:
        env_prefix = "ORCHESTRA_"


settings = Settings()
