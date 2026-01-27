import type {
  Project,
  Node,
  NodeRun,
  Deliverable,
  Check,
  CompiledContext,
  AgentType,
} from './types';
import { useOrchestraStore } from './store';
import { executeAgent } from './api';

// ========== EXECUTION CONSTANTS ==========

/** Maximum time for a complete project execution (5 minutes) */
const PROJECT_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum iterations to prevent infinite loops */
const MAX_ITERATIONS = 1000;

/** Maximum time to wait for a node to complete (4 minutes) */
const NODE_EXECUTION_TIMEOUT_MS = 4 * 60 * 1000;

// ========== CONTEXT COMPILATION ==========

/**
 * Compile context for a node - resolves all context refs to actual content
 */
export function compileContext(
  node: Node,
  project: Project,
  nodeOutputs: Record<string, string>
): CompiledContext {
  const compiled: CompiledContext = {
    files: [],
    urls: [],
    parentOutputs: [],
    markdownContent: [],
  };

  for (const ref of node.context) {
    switch (ref.type) {
      case 'file':
        compiled.files.push(ref.path);
        break;
      case 'url':
        compiled.urls.push(ref.url);
        break;
      case 'parent_output':
        const output = nodeOutputs[ref.nodeId];
        if (output) {
          compiled.parentOutputs.push({ nodeId: ref.nodeId, content: output });
        }
        break;
      case 'markdown':
        compiled.markdownContent.push(ref.content);
        break;
    }
  }

  return compiled;
}

/**
 * Build the prompt instruction for context files
 */
export function buildContextInstruction(context: CompiledContext): string {
  const parts: string[] = [];

  if (context.files.length > 0) {
    parts.push(`Read the following files for context:\n${context.files.map(f => `- ${f}`).join('\n')}`);
  }

  if (context.urls.length > 0) {
    parts.push(`Fetch and read the following URLs:\n${context.urls.map(u => `- ${u}`).join('\n')}`);
  }

  if (context.parentOutputs.length > 0) {
    for (const po of context.parentOutputs) {
      parts.push(`## Output from node ${po.nodeId}\n${po.content}`);
    }
  }

  if (context.markdownContent.length > 0) {
    for (const md of context.markdownContent) {
      parts.push(md);
    }
  }

  return parts.join('\n\n');
}

/**
 * Build deliverables instruction
 */
export function buildDeliverablesInstruction(deliverables: Deliverable[]): string {
  if (deliverables.length === 0) return '';

  const parts = ['You must produce the following deliverables:'];

  for (const d of deliverables) {
    switch (d.type) {
      case 'file':
        parts.push(`- Create file: ${d.path}`);
        break;
      case 'response':
        parts.push(`- Write response: ${d.description}`);
        break;
      case 'pr':
        parts.push(`- Create pull request in: ${d.repo}`);
        break;
      case 'edit':
        parts.push(`- Edit document at: ${d.url}`);
        break;
    }
  }

  return parts.join('\n');
}

/**
 * Build the full prompt with context and deliverables
 */
export function buildFullPrompt(
  node: Node,
  context: CompiledContext
): string {
  const parts: string[] = [];

  // Context instruction
  const contextInstruction = buildContextInstruction(context);
  if (contextInstruction) {
    parts.push(contextInstruction);
  }

  // Main prompt
  parts.push(node.prompt);

  // Deliverables instruction
  const deliverableInstruction = buildDeliverablesInstruction(node.deliverables);
  if (deliverableInstruction) {
    parts.push(deliverableInstruction);
  }

  return parts.join('\n\n---\n\n');
}

// ========== CLI COMMAND BUILDING ==========

export function buildAgentCommand(agent: { type: AgentType; model?: string }, prompt: string): string {
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');

  switch (agent.type) {
    case 'claude':
      return `claude -p "${escapedPrompt}"`;
    case 'codex':
      return `codex exec "${escapedPrompt}"`;
    case 'gemini':
      const model = agent.model || 'gemini-3-pro';
      return `gemini "${escapedPrompt}" -m ${model} -o text`;
  }
}

// ========== CHECK EXECUTION ==========

/**
 * Run a single check and return the result
 */
export async function runCheck(
  check: Check,
  projectLocation?: string
): Promise<{ passed: boolean; error?: string }> {
  switch (check.type) {
    case 'file_exists':
      try {
        // In a real implementation, this would check the filesystem
        // For now, we'll simulate by calling an API
        const response = await fetch('/api/check/file-exists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: check.path, projectLocation }),
        });
        const result = await response.json();
        return { passed: result.exists };
      } catch (error) {
        return { passed: false, error: `Failed to check file: ${error}` };
      }

    case 'command':
      try {
        const response = await fetch('/api/check/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: check.cmd, projectLocation }),
        });
        const result = await response.json();
        return { passed: result.exitCode === 0, error: result.stderr };
      } catch (error) {
        return { passed: false, error: `Failed to run command: ${error}` };
      }

    case 'contains':
      try {
        const response = await fetch('/api/check/contains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: check.path, pattern: check.pattern, projectLocation }),
        });
        const result = await response.json();
        return { passed: result.contains };
      } catch (error) {
        return { passed: false, error: `Failed to check file contents: ${error}` };
      }

    case 'human_approval':
      // Human approval is handled separately via UI
      return { passed: false, error: 'Awaiting human approval' };
  }
}

/**
 * Run all checks for a node, handling retries
 */
export async function runAllChecks(
  node: Node,
  sessionId: string,
  projectLocation?: string
): Promise<{ allPassed: boolean; needsHumanApproval: boolean; failedChecks: string[] }> {
  const store = useOrchestraStore.getState();
  let allPassed = true;
  let needsHumanApproval = false;
  const failedChecks: string[] = [];

  for (const check of node.checks) {
    if (check.type === 'human_approval') {
      needsHumanApproval = true;
      store.setCheckResult(sessionId, check.id, 'pending');
      continue;
    }

    const result = await runCheck(check, projectLocation);

    if (result.passed) {
      store.setCheckResult(sessionId, check.id, 'passed');
    } else {
      // Check if we should retry
      if (check.autoRetry) {
        const maxRetries = check.maxRetries ?? 3;
        const attempts = store.incrementRetryAttempt(sessionId, check.id);

        if (attempts < maxRetries) {
          // Don't mark as failed yet, will retry
          store.setCheckResult(sessionId, check.id, 'pending');
          failedChecks.push(check.id);
        } else {
          store.setCheckResult(sessionId, check.id, 'failed');
          allPassed = false;
          failedChecks.push(check.id);
        }
      } else {
        store.setCheckResult(sessionId, check.id, 'failed');
        allPassed = false;
        failedChecks.push(check.id);
      }
    }
  }

  return { allPassed, needsHumanApproval, failedChecks };
}

// ========== DAG UTILITIES ==========

/**
 * Topological sort for execution order
 */
export function topologicalSortProject(project: Project): string[] {
  const { nodes, edges } = project;
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  // Initialize
  nodes.forEach((node) => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  });

  // Build graph
  edges.forEach((edge) => {
    adjacency[edge.sourceId].push(edge.targetId);
    inDegree[edge.targetId]++;
  });

  // Kahn's algorithm
  const queue: string[] = [];
  const result: string[] = [];

  Object.entries(inDegree).forEach(([nodeId, degree]) => {
    if (degree === 0) queue.push(nodeId);
  });

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);

    adjacency[nodeId].forEach((neighbor) => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    });
  }

  return result;
}

/**
 * Get nodes that are ready to execute (all dependencies completed)
 */
export function getReadyNodesProject(project: Project, completedNodeIds: Set<string>): Node[] {
  const { nodes, edges } = project;

  return nodes.filter((node) => {
    // Skip if already completed or running
    if (completedNodeIds.has(node.id) || node.status === 'running' || node.status === 'completed') {
      return false;
    }

    // Check all incoming edges - source nodes must be completed
    const incomingEdges = edges.filter((e) => e.targetId === node.id);
    return incomingEdges.every((edge) => completedNodeIds.has(edge.sourceId));
  });
}

/**
 * Get outputs from parent nodes for a given node
 */
export function getParentOutputs(
  node: Node,
  project: Project,
  nodeRuns: Record<string, NodeRun>
): Record<string, string> {
  const outputs: Record<string, string> = {};
  const incomingEdges = project.edges.filter((e) => e.targetId === node.id);

  for (const edge of incomingEdges) {
    const sourceNode = project.nodes.find((n) => n.id === edge.sourceId);
    if (!sourceNode) continue;

    // Find the most recent successful run for this node
    const run = Object.values(nodeRuns).find(
      (r) => r.nodeId === sourceNode.id && r.status === 'completed'
    );

    if (run?.output) {
      // If edge specifies a specific deliverable, only include that
      if (edge.sourceDeliverable) {
        // In a real implementation, we'd parse the output to get specific deliverable
        outputs[sourceNode.id] = run.output;
      } else {
        outputs[sourceNode.id] = run.output;
      }
    }
  }

  return outputs;
}

// ========== NODE EXECUTION ==========

/**
 * Execute a single node
 */
export async function executeNodeNew(
  node: Node,
  project: Project
): Promise<void> {
  const store = useOrchestraStore.getState();

  // Create session
  const sessionId = store.createSession(node.id, node.agent.type);

  // Update node status
  store.setNodeStatus(project.id, node.id, 'running');
  store.updateNode(project.id, node.id, { sessionId });

  // Initialize deliverable statuses
  for (const d of node.deliverables) {
    store.setDeliverableStatus(sessionId, d.id, 'pending');
  }

  // Initialize check statuses
  for (const c of node.checks) {
    store.setCheckResult(sessionId, c.id, 'pending');
  }

  try {
    // Get parent outputs
    const parentOutputs = getParentOutputs(node, project, store.nodeRuns);

    // Compile context
    const compiledContext = compileContext(node, project, parentOutputs);

    // Build full prompt
    const fullPrompt = buildFullPrompt(node, compiledContext);

    // Build command
    const agentCommand = buildAgentCommand(node.agent, fullPrompt);

    // Create run record
    const runId = store.createNodeRun({
      nodeId: node.id,
      projectId: project.id,
      compiledContext,
      prompt: fullPrompt,
      agentType: node.agent.type,
      agentCommand,
      status: 'running',
      output: null,
      error: null,
      startedAt: Date.now(),
      completedAt: null,
    });

    // Update session to running
    store.setSessionStatus(sessionId, 'running');

    // Execute via API
    const result = await executeAgent({
      executor: node.agent.type,
      prompt: fullPrompt,
      options: node.agent.model ? { model: node.agent.model } : undefined,
    });

    if (result.status === 'error') {
      throw new Error(result.error || 'Execution failed');
    }

    // Update run with output
    store.completeNodeRun(runId, 'completed', result.output);

    // Mark deliverables as produced (simplified - in reality would verify)
    for (const d of node.deliverables) {
      store.setDeliverableStatus(sessionId, d.id, 'produced');
    }

    // Run checks
    const checkResults = await runAllChecks(node, sessionId, project.location);

    if (checkResults.needsHumanApproval) {
      store.setSessionStatus(sessionId, 'awaiting_approval');
      store.setNodeStatus(project.id, node.id, 'running'); // Keep as running until approved
      return;
    }

    if (checkResults.allPassed) {
      store.setSessionStatus(sessionId, 'completed');
      store.setNodeStatus(project.id, node.id, 'completed');
    } else {
      // If there are failed checks with auto-retry, we could re-run
      // For now, just mark as failed
      store.setSessionStatus(sessionId, 'failed');
      store.setNodeStatus(project.id, node.id, 'failed');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    store.setSessionStatus(sessionId, 'failed');
    store.setNodeStatus(project.id, node.id, 'failed');

    // Update run if it exists
    const runs = Object.values(store.nodeRuns).filter((r) => r.nodeId === node.id);
    const latestRun = runs[runs.length - 1];
    if (latestRun) {
      store.completeNodeRun(latestRun.id, 'failed', undefined, errorMessage);
    }

    throw error;
  }
}

/**
 * Approve a human approval check
 */
export function approveHumanCheck(sessionId: string, checkId: string): void {
  const store = useOrchestraStore.getState();
  store.setCheckResult(sessionId, checkId, 'passed');

  // Check if all checks are now passed
  const session = store.sessions[sessionId];
  if (!session) return;

  const allPassed = Object.values(session.checkResults).every((r) => r === 'passed');

  if (allPassed) {
    // Find the project and node
    const projectId = Object.keys(store.projects).find((pid) => {
      const project = store.projects[pid];
      return project.nodes.some((n) => n.id === session.nodeId);
    });

    if (projectId) {
      store.setSessionStatus(sessionId, 'completed');
      store.setNodeStatus(projectId, session.nodeId, 'completed');
    }
  }
}

/**
 * Run entire project DAG with timeout and safety limits
 */
export async function runProject(projectId: string): Promise<void> {
  const store = useOrchestraStore.getState();
  const project = store.projects[projectId];

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Reset all node statuses
  for (const node of project.nodes) {
    store.setNodeStatus(projectId, node.id, 'pending');
  }

  const completedNodeIds = new Set<string>();
  const failedNodeIds = new Set<string>();
  const startTime = Date.now();
  let iterations = 0;

  try {
    // Execute nodes in parallel waves with safety limits
    while (true) {
      // Safety check: max iterations
      iterations++;
      if (iterations > MAX_ITERATIONS) {
        // Mark all remaining pending/running nodes as failed
        const currentProject = store.projects[projectId];
        if (currentProject) {
          for (const node of currentProject.nodes) {
            if (node.status === 'pending' || node.status === 'running') {
              store.setNodeStatus(projectId, node.id, 'failed');
            }
          }
        }
        throw new Error(`Execution exceeded maximum iterations (${MAX_ITERATIONS}). Possible infinite loop detected.`);
      }

      // Safety check: timeout
      if (Date.now() - startTime > PROJECT_EXECUTION_TIMEOUT_MS) {
        // Mark all remaining pending/running nodes as failed
        const currentProject = store.projects[projectId];
        if (currentProject) {
          for (const node of currentProject.nodes) {
            if (node.status === 'pending' || node.status === 'running') {
              store.setNodeStatus(projectId, node.id, 'failed');
            }
          }
        }
        throw new Error(`Execution timed out after ${PROJECT_EXECUTION_TIMEOUT_MS / 1000} seconds`);
      }

      const currentProject = store.projects[projectId];
      if (!currentProject) break;

      const readyNodes = getReadyNodesProject(currentProject, completedNodeIds);

      if (readyNodes.length === 0) {
        // Check if all nodes are completed or failed
        const allDone = currentProject.nodes.every(
          (n) => n.status === 'completed' || n.status === 'failed' ||
                 completedNodeIds.has(n.id) || failedNodeIds.has(n.id)
        );

        if (allDone) {
          break;
        }

        // Check for failures that would block further progress
        const hasFailed = currentProject.nodes.some((n) => n.status === 'failed');
        const hasRunning = currentProject.nodes.some((n) => n.status === 'running');

        if (hasFailed && !hasRunning) {
          // All running work is done, and we have failures - stop
          break;
        }

        // Check for awaiting approval
        const awaitingApproval = currentProject.nodes.some(
          (n) => n.status === 'running' && n.sessionId
        );
        if (awaitingApproval) {
          // Wait and check again
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // Still waiting for running nodes
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      // Execute ready nodes in parallel with individual timeouts
      await Promise.all(
        readyNodes.map(async (node) => {
          try {
            await Promise.race([
              executeNodeNew(node, currentProject),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Node ${node.id} timed out`)),
                  NODE_EXECUTION_TIMEOUT_MS
                )
              ),
            ]);
            completedNodeIds.add(node.id);
          } catch {
            // Ensure node is marked as failed
            failedNodeIds.add(node.id);
            const currentStatus = store.projects[projectId]?.nodes.find(n => n.id === node.id)?.status;
            if (currentStatus !== 'failed') {
              store.setNodeStatus(projectId, node.id, 'failed');
            }
          }
        })
      );
    }
  } catch (error) {
    // Final cleanup: ensure no nodes are stuck in running state
    const finalProject = store.projects[projectId];
    if (finalProject) {
      for (const node of finalProject.nodes) {
        if (node.status === 'running') {
          store.setNodeStatus(projectId, node.id, 'failed');
        }
      }
    }
    throw error;
  }
}

