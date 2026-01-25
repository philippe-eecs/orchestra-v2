from typing import Any


class PlanService:
    """Service for generating node plans from prompts."""

    async def generate_plan(
        self,
        prompt: str,
        resources: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        """
        Generate a plan (nodes and edges) from a prompt.

        This is a placeholder that returns a simple structure.
        In production, this would call an LLM API.
        """
        # For now, return a simple placeholder structure
        # This would be replaced with actual LLM integration
        nodes = [
            {
                "title": f"Step 1: Analyze requirements",
                "description": f"Based on: {prompt[:100]}...",
                "status": "pending",
                "position_x": 100,
                "position_y": 100,
            },
            {
                "title": "Step 2: Implementation",
                "description": "Implement the solution",
                "status": "pending",
                "position_x": 300,
                "position_y": 100,
            },
            {
                "title": "Step 3: Verification",
                "description": "Verify the implementation",
                "status": "pending",
                "position_x": 500,
                "position_y": 100,
            },
        ]

        edges = [
            {"source_index": 0, "target_index": 1},
            {"source_index": 1, "target_index": 2},
        ]

        return {"nodes": nodes, "edges": edges}


plan_service = PlanService()
