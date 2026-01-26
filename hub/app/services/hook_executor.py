"""Hook executor service for validating deliverables and managing gates."""

import re
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.db.models import NodeModel, DeliverableModel, HookNodeModel
from app.models.hooks import (
    HookTrigger, HookAction, HookStatus, HookResult,
    DEFAULT_VALIDATION_RULES,
)
from app.models.deliverables import DeliverableStatus
from app.services.broadcast import manager

logger = logging.getLogger(__name__)


class HookExecutor:
    """Executes hooks for validation and gating."""

    def __init__(self, db: Session, project_id: int):
        self.db = db
        self.project_id = project_id

    async def execute_hook(
        self,
        hook_node: NodeModel,
        source_node: NodeModel,
    ) -> HookResult:
        """
        Execute a hook node against a source node.

        Args:
            hook_node: The hook node containing the hook configuration
            source_node: The node whose deliverables are being validated

        Returns:
            HookResult with status and validation details
        """
        hook_config = hook_node.hook_config
        if not hook_config:
            return HookResult(
                status=HookStatus.FAILED,
                message="Hook node has no configuration"
            )

        logger.info(f"Executing hook '{hook_config.name}' on node {source_node.id}")

        # Get completed deliverables from source node
        deliverables = self.db.query(DeliverableModel).filter(
            DeliverableModel.node_id == source_node.id,
            DeliverableModel.status.in_([
                DeliverableStatus.COMPLETED.value,
                DeliverableStatus.VALIDATED.value
            ])
        ).all()

        deliverable_map = {d.name: d for d in deliverables}

        # Check required deliverables exist
        missing = []
        for required_name in hook_config.required_deliverables:
            if required_name not in deliverable_map:
                missing.append(required_name)

        if missing:
            return HookResult(
                status=HookStatus.FAILED,
                message=f"Missing required deliverables: {missing}",
                failed_deliverables=missing,
            )

        # Validate content using rules
        validation_rules = hook_config.validation_rules or {}
        validation_errors = []
        passed_deliverables = []
        failed_deliverables = []

        for name, deliverable in deliverable_map.items():
            # Use custom rule if provided, otherwise use default
            rule = validation_rules.get(name) or DEFAULT_VALIDATION_RULES.get(name)

            if rule:
                matches = re.findall(rule, deliverable.content)
                if not matches:
                    validation_errors.append(
                        f"{name}: Does not match validation rule '{rule}'"
                    )
                    failed_deliverables.append(name)

                    # Update deliverable status to failed
                    deliverable.status = DeliverableStatus.FAILED.value
                    deliverable.validation_errors = deliverable.validation_errors + [
                        f"Validation failed: pattern '{rule}' not found"
                    ]
                else:
                    # Special validation for sources.md - need at least 3 URLs
                    if name == "sources.md":
                        urls = re.findall(r'https?://[^\s\)]+', deliverable.content)
                        if len(urls) < 3:
                            validation_errors.append(
                                f"{name}: Found only {len(urls)} URLs, need at least 3 citations"
                            )
                            failed_deliverables.append(name)
                            deliverable.status = DeliverableStatus.FAILED.value
                        else:
                            deliverable.status = DeliverableStatus.VALIDATED.value
                            passed_deliverables.append(name)
                    else:
                        deliverable.status = DeliverableStatus.VALIDATED.value
                        passed_deliverables.append(name)
            else:
                # No rule, mark as validated
                deliverable.status = DeliverableStatus.VALIDATED.value
                passed_deliverables.append(name)

        self.db.commit()

        if validation_errors:
            return HookResult(
                status=HookStatus.FAILED,
                message="Validation failed",
                validation_errors=validation_errors,
                passed_deliverables=passed_deliverables,
                failed_deliverables=failed_deliverables,
            )

        # Check if human approval is required
        if hook_config.requires_human_approval:
            return HookResult(
                status=HookStatus.AWAITING_APPROVAL,
                message="Waiting for human approval",
                passed_deliverables=passed_deliverables,
            )

        return HookResult(
            status=HookStatus.PASSED,
            message="All validations passed",
            passed_deliverables=passed_deliverables,
        )

    async def execute_validation_hook(
        self,
        source_node_id: int,
        required_deliverables: list[str],
        validation_rules: Optional[dict[str, str]] = None,
    ) -> HookResult:
        """
        Execute an inline validation check (not from a hook node).

        Args:
            source_node_id: The node to validate
            required_deliverables: List of deliverable names that must exist
            validation_rules: Optional regex rules for content validation

        Returns:
            HookResult with validation status
        """
        source_node = self.db.query(NodeModel).filter(
            NodeModel.id == source_node_id
        ).first()

        if not source_node:
            return HookResult(
                status=HookStatus.FAILED,
                message=f"Source node {source_node_id} not found"
            )

        # Get all deliverables
        deliverables = self.db.query(DeliverableModel).filter(
            DeliverableModel.node_id == source_node_id,
            DeliverableModel.status.in_([
                DeliverableStatus.COMPLETED.value,
                DeliverableStatus.VALIDATED.value
            ])
        ).all()

        deliverable_map = {d.name: d for d in deliverables}

        # Check required deliverables
        missing = [name for name in required_deliverables if name not in deliverable_map]
        if missing:
            return HookResult(
                status=HookStatus.FAILED,
                message=f"Missing deliverables: {missing}",
                failed_deliverables=missing,
            )

        # Validate content
        rules = validation_rules or DEFAULT_VALIDATION_RULES
        validation_errors = []
        passed = []
        failed = []

        for name in required_deliverables:
            d = deliverable_map[name]
            rule = rules.get(name)

            if rule:
                if not re.search(rule, d.content):
                    validation_errors.append(f"{name}: Validation pattern not matched")
                    failed.append(name)
                else:
                    passed.append(name)
            else:
                passed.append(name)

        if validation_errors:
            return HookResult(
                status=HookStatus.FAILED,
                message="Validation failed",
                validation_errors=validation_errors,
                passed_deliverables=passed,
                failed_deliverables=failed,
            )

        return HookResult(
            status=HookStatus.PASSED,
            message="All validations passed",
            passed_deliverables=passed,
        )


def get_parent_deliverables(db: Session, node: NodeModel) -> dict[str, str]:
    """
    Get all completed deliverables from parent nodes.

    Returns a dict mapping deliverable names to their content.
    """
    parent_deliverables = {}

    for parent in node.parents:
        deliverables = db.query(DeliverableModel).filter(
            DeliverableModel.node_id == parent.id,
            DeliverableModel.status.in_([
                DeliverableStatus.COMPLETED.value,
                DeliverableStatus.VALIDATED.value
            ])
        ).all()

        for d in deliverables:
            # Use parent title prefix to avoid conflicts
            key = f"{parent.title}/{d.name}"
            parent_deliverables[key] = d.content

    return parent_deliverables
