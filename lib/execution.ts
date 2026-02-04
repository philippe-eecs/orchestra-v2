import type {
  Project,
  Node,
  NodeRun,
  Deliverable,
  Check,
  CompiledContext,
  AgentConfig,
  ComposedAgentTemplate,
  ExecutionConfig,
  GitFinalizeAction,
} from './types';
import { useOrchestraStore } from './store';
import { executeAgent, getSessionStatus, isInteractiveBackend } from './api';

/**
 * Resolve the execution config for a node, considering project defaults.
 * This is a client-safe version that doesn't import server-only modules.
 */
function resolveExecutionConfig(node: Node, project: Project): ExecutionConfig {
  // Node-level config takes precedence over project default
  if (node.executionConfig) {
    return node.executionConfig;
  }

  // Fall back to project default
  if (project.defaultExecutionConfig) {
    return project.defaultExecutionConfig;
  }

  // Default to local execution
  return { backend: 'local' };
}

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

/**
 * Build a preview of the compiled prompt for display in the UI.
 * This is a client-safe version that doesn't execute anything.
 *
 * @param node - The node to build the preview for
 * @param project - The project containing the node
 * @param nodeOutputs - Optional map of node outputs from parent nodes
 * @returns Object with base prompt and compiled prompt
 */
export function buildPromptPreview(
  node: Node,
  project: Project,
  nodeOutputs: Record<string, string> = {}
): { base: string; compiled: string; sections: PromptPreviewSections } {
  // Compile context refs into actual context
  const compiledContext = compileContext(node, project, nodeOutputs);

  // Build the full compiled prompt
  const compiled = buildFullPrompt(node, compiledContext);

  // Build sections breakdown for UI display
  const sections: PromptPreviewSections = {
    context: null,
    prompt: node.prompt,
    deliverables: null,
  };

  // Context section
  const contextInstruction = buildContextInstruction(compiledContext);
  if (contextInstruction) {
    sections.context = contextInstruction;
  }

  // Deliverables section
  const deliverableInstruction = buildDeliverablesInstruction(node.deliverables);
  if (deliverableInstruction) {
    sections.deliverables = deliverableInstruction;
  }

  return {
    base: node.prompt,
    compiled,
    sections,
  };
}

/**
 * Sections of the compiled prompt for UI display
 */
export interface PromptPreviewSections {
  context: string | null;
  prompt: string;
  deliverables: string | null;
}

// ========== CLI COMMAND BUILDING ==========

export function buildAgentCommand(agent: AgentConfig, prompt: string): string {
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');

  switch (agent.type) {
    case 'claude': {
      const modelArg = agent.model ? ` --model ${agent.model}` : '';
      const budgetArg = agent.thinkingBudget
        ? ` --append-system-prompt "Think for at most ${agent.thinkingBudget} tokens."`
        : '';
      return `claude -p "${escapedPrompt}"${modelArg}${budgetArg}`;
    }
    case 'codex': {
      const modelArg = agent.model ? ` -m ${agent.model}` : '';
      const reasoningArg = agent.reasoningEffort ? ` -c reasoning.effort=${agent.reasoningEffort}` : '';
      return `codex exec${modelArg}${reasoningArg} "${escapedPrompt}"`;
    }
    case 'gemini': {
      const model = agent.model || 'gemini-3-pro-preview';
      return `gemini "${escapedPrompt}" -m ${model} -o text`;
    }
    case 'composed': {
      // Composed agents are executed differently - this is just for logging
      return `[Composed Agent: ${agent.agentId}]`;
    }
  }
}

// ========== CHECK EXECUTION ==========

/**
 * Run a single check and return the result
 */
export async function runCheck(
  check: Check,
  projectLocation?: string,
  nodeOutput?: string
): Promise<{ passed: boolean; error?: string; critique?: string }> {
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

    case 'llm_critic':
      try {
        if (!nodeOutput) {
          return { passed: false, error: 'No node output to critique' };
        }
        const response = await fetch('/api/check/llm-critic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeOutput,
            criticAgent: check.criticAgent,
            criteria: check.criteria,
            threshold: check.threshold,
            projectLocation,
          }),
        });
        const result = await response.json();
        return {
          passed: result.passed,
          error: result.passed ? undefined : `Score ${result.score}/${check.threshold || 70}`,
          critique: result.critique,
        };
      } catch (error) {
        return { passed: false, error: `LLM Critic failed: ${error}` };
      }

    case 'test_runner':
      try {
        const response = await fetch('/api/check/test-runner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            framework: check.framework,
            command: check.command,
            testPattern: check.testPattern,
            projectLocation,
          }),
        });
        const result = await response.json();
        return {
          passed: result.passed,
          error: result.passed
            ? undefined
            : `Tests failed: ${result.summary.failed}/${result.summary.total}`,
        };
      } catch (error) {
        return { passed: false, error: `Test runner failed: ${error}` };
      }

    case 'eval_baseline':
      try {
        const response = await fetch('/api/check/eval-baseline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metric: check.metric,
            baseline: check.baseline,
            tolerance: check.tolerance,
            command: check.command,
            evaluator: check.evaluator,
            projectLocation,
          }),
        });
        const result = await response.json();
        return {
          passed: result.passed,
          error: result.passed
            ? undefined
            : `${check.metric} deviation ${result.deviation.toFixed(1)}% exceeds tolerance ${check.tolerance}%`,
        };
      } catch (error) {
        return { passed: false, error: `Eval baseline failed: ${error}` };
      }
  }
}

/**
 * Run all checks for a node, handling retries
 */
export async function runAllChecks(
  node: Node,
  sessionId: string,
  projectLocation?: string,
  nodeOutput?: string
): Promise<{
  allPassed: boolean;
  needsHumanApproval: boolean;
  needsRetry: boolean;
  failedChecks: string[];
}> {
  const store = useOrchestraStore.getState();
  let allPassed = true;
  let needsHumanApproval = false;
  let needsRetry = false;
  const failedChecks: string[] = [];

  for (const check of node.checks) {
    if (check.type === 'human_approval') {
      needsHumanApproval = true;
      allPassed = false;
      store.setCheckResult(sessionId, check.id, 'pending');
      continue;
    }

    const result = await runCheck(check, projectLocation, nodeOutput);

    if (result.passed) {
      store.setCheckResult(sessionId, check.id, 'passed');
    } else {
      allPassed = false;
      // Check if we should retry
      if (check.autoRetry) {
        const maxRetries = check.maxRetries ?? 3;
        const attempts = store.incrementRetryAttempt(sessionId, check.id);

        if (attempts < maxRetries) {
          // Don't mark as failed yet, will retry
          store.setCheckResult(sessionId, check.id, 'pending');
          needsRetry = true;
          failedChecks.push(check.id);
        } else {
          store.setCheckResult(sessionId, check.id, 'failed');
          failedChecks.push(check.id);
        }
      } else {
        store.setCheckResult(sessionId, check.id, 'failed');
        failedChecks.push(check.id);
      }
    }
  }

  return { allPassed, needsHumanApproval, needsRetry, failedChecks };
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
    if (
      completedNodeIds.has(node.id) ||
      node.status === 'running' ||
      node.status === 'awaiting_review' ||
      node.status === 'completed' ||
      node.status === 'failed'
    ) {
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
    const run = Object.values(nodeRuns).reduce<NodeRun | null>((latest, current) => {
      if (current.nodeId !== sourceNode.id || current.status !== 'completed') return latest;
      if (!latest) return current;
      const latestTime = latest.completedAt ?? latest.startedAt;
      const currentTime = current.completedAt ?? current.startedAt;
      return currentTime > latestTime ? current : latest;
    }, null);

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

// ========== COMPOSED AGENT EXECUTION ==========

/**
 * Execute a composed agent (sub-DAG)
 * Creates an ephemeral execution context and runs the sub-DAG
 */
export async function executeComposedAgent(
  template: ComposedAgentTemplate,
  parentContext: CompiledContext,
  projectLocation?: string
): Promise<{ output: string; status: 'completed' | 'failed'; error?: string }> {
  const store = useOrchestraStore.getState();

  // Create ephemeral state for tracking sub-DAG execution
  const nodeOutputs: Record<string, string> = {};
  const completedNodes = new Set<string>();
  const failedNodes = new Set<string>();

  // TODO: Map parent context to sub-DAG inputs (template.inputs). Currently all nodes receive parentContext.

  // Execute sub-DAG using topological order
  const topoOrder = topologicalSortSubDAG(template.nodes, template.edges);

  for (const nodeId of topoOrder) {
    const composedNode = template.nodes.find((n) => n.id === nodeId);
    if (!composedNode) continue;

    // Check if dependencies are satisfied
    const incomingEdges = template.edges.filter((e) => e.targetId === nodeId);
    const depsOk = incomingEdges.every((e) => completedNodes.has(e.sourceId));
    if (!depsOk) {
      // Skip if dependencies failed
      failedNodes.add(nodeId);
      continue;
    }

    // Build context for this sub-node
    const subContext: CompiledContext = {
      files: parentContext.files,
      urls: parentContext.urls,
      parentOutputs: [],
      markdownContent: parentContext.markdownContent,
    };

    // Add outputs from parent nodes in sub-DAG
    for (const edge of incomingEdges) {
      if (nodeOutputs[edge.sourceId]) {
        subContext.parentOutputs.push({
          nodeId: edge.sourceId,
          content: nodeOutputs[edge.sourceId],
        });
      }
    }

    // Build prompt
    const fullPrompt = buildFullPrompt(
      {
        ...composedNode,
        position: { x: 0, y: 0 },
        status: 'pending',
        sessionId: null,
        description: '',
      } as Node,
      subContext
    );

    // Handle nested composed agents recursively
    if (composedNode.agent.type === 'composed') {
      const nestedTemplate = store.agentLibrary[composedNode.agent.agentId] as ComposedAgentTemplate;
      if (nestedTemplate?.kind === 'composed') {
        const nestedResult = await executeComposedAgent(nestedTemplate, subContext, projectLocation);
        if (nestedResult.status === 'completed') {
          nodeOutputs[nodeId] = nestedResult.output;
          completedNodes.add(nodeId);
        } else {
          failedNodes.add(nodeId);
        }
        continue;
      }
    }

    // Execute primitive agent
    try {
      const result = await executeAgent({
        executor: composedNode.agent.type as 'claude' | 'codex' | 'gemini',
        prompt: fullPrompt,
        options:
          composedNode.agent.type === 'claude'
            ? { model: composedNode.agent.model, thinkingBudget: composedNode.agent.thinkingBudget }
            : composedNode.agent.type === 'codex'
            ? { model: composedNode.agent.model, reasoningEffort: composedNode.agent.reasoningEffort }
            : composedNode.agent.type === 'gemini'
            ? { model: composedNode.agent.model }
            : undefined,
      });

      if (result.status === 'error') {
        failedNodes.add(nodeId);
      } else {
        nodeOutputs[nodeId] = result.output || '';
        completedNodes.add(nodeId);
      }
    } catch {
      failedNodes.add(nodeId);
    }
  }

  // Collect outputs from terminal nodes
  const terminalNodeIds = template.nodes
    .filter((n) => !template.edges.some((e) => e.sourceId === n.id))
    .map((n) => n.id);

  const outputParts: string[] = [];
  for (const output of template.outputs) {
    if (nodeOutputs[output.sourceNodeId]) {
      outputParts.push(`## ${output.name}\n${nodeOutputs[output.sourceNodeId]}`);
    }
  }

  // If no explicit outputs, just concatenate terminal node outputs
  if (outputParts.length === 0) {
    for (const terminalId of terminalNodeIds) {
      if (nodeOutputs[terminalId]) {
        outputParts.push(nodeOutputs[terminalId]);
      }
    }
  }

  const anyFailed = failedNodes.size > 0;
  const allCompleted = completedNodes.size === template.nodes.length;

  return {
    output: outputParts.join('\n\n---\n\n'),
    status: allCompleted ? 'completed' : 'failed',
    error: anyFailed ? `${failedNodes.size} sub-nodes failed` : undefined,
  };
}

/**
 * Topological sort for sub-DAG (without affecting project state)
 */
function topologicalSortSubDAG(
  nodes: { id: string }[],
  edges: { sourceId: string; targetId: string }[]
): string[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  nodes.forEach((node) => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  });

  edges.forEach((edge) => {
    adjacency[edge.sourceId].push(edge.targetId);
    inDegree[edge.targetId]++;
  });

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

  // Resolve execution config (node-level or project default)
  const executionConfig = resolveExecutionConfig(node, project);

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

    // Store execution backend info
    store.setSessionAttachInfo(sessionId, {
      backend: executionConfig.backend,
    });

    // Execute based on agent type
    let result: {
      status: string;
      output?: string;
      error?: string;
      sessionId?: string;
      attachCommand?: string;
      backend?: string;
      sandboxInfo?: {
        worktreePath: string;
        branchName: string;
        baseBranch?: string;
        prUrl?: string;
        commitHash?: string;
        finalizeAction?: GitFinalizeAction;
      };
    };

    if (node.agent.type === 'composed') {
      // Execute composed agent (sub-DAG)
      const template = store.agentLibrary[node.agent.agentId] as ComposedAgentTemplate;
      if (!template || template.kind !== 'composed') {
        throw new Error(`Composed agent template not found: ${node.agent.agentId}`);
      }
      const composedResult = await executeComposedAgent(
        template,
        compiledContext,
        project.location
      );
      result = {
        status: composedResult.status === 'completed' ? 'success' : 'error',
        output: composedResult.output,
        error: composedResult.error,
      };
    } else {
      // Execute primitive agent via API
      const options =
        node.agent.type === 'claude'
          ? {
              model: node.agent.model,
              thinkingBudget: node.agent.thinkingBudget,
            }
          : node.agent.type === 'codex'
          ? {
              model: node.agent.model,
              reasoningEffort: node.agent.reasoningEffort,
            }
          : node.agent.type === 'gemini'
          ? {
              model: node.agent.model,
            }
          : undefined;

      result = await executeAgent({
        executor: node.agent.type,
        prompt: fullPrompt,
        options,
        executionConfig,
        projectPath: project.location,
        projectId: project.id,
        nodeId: node.id,
        runId,
      });

      // Store attach info if interactive backend
      if (isInteractiveBackend(executionConfig.backend) && result.sessionId) {
        store.setSessionAttachInfo(sessionId, {
          backend: executionConfig.backend,
          attachCommand: result.attachCommand,
          containerId: result.sessionId,
        });
      }

      // Store sandbox info if returned from API
      if (result.sandboxInfo) {
        store.setSessionSandboxInfo(sessionId, result.sandboxInfo);
        store.updateNodeRun(runId, { sandboxInfo: result.sandboxInfo });
      }

      // If interactive, poll until it stops and capture final output.
      if (isInteractiveBackend(executionConfig.backend) && result.status === 'running' && result.sessionId) {
        const containerId = result.sessionId;
	        let lastOutput = '';

	        // Poll until stopped; keep output fresh in the NodeRun for viewing.
	        // Note: getSessionStatus returns full captured output; we overwrite instead of appending.
	        while (true) {
	          const status = await getSessionStatus(containerId, executionConfig.backend);
	          if (status.output) {
	            lastOutput = status.output;
            store.updateNodeRun(runId, { output: lastOutput });
          }

          if (status.status === 'stopped') {
            break;
          }
          if (status.status === 'error') {
            throw new Error(status.error || 'Interactive session error');
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        result = {
          ...result,
          status: 'done',
          output: lastOutput,
        };
      }
    }

    if (result.status === 'error') {
      throw new Error(result.error || 'Execution failed');
    }

    // Update run with output
    store.completeNodeRun(runId, 'completed', result.output);

    // Mark deliverables as produced (simplified - in reality would verify)
    for (const d of node.deliverables) {
      store.setDeliverableStatus(sessionId, d.id, 'produced');
    }

    // Run checks (pass the output for LLM critic checks)
    const effectiveProjectLocation = result.sandboxInfo?.worktreePath || project.location;
    const checkResults = await runAllChecks(node, sessionId, effectiveProjectLocation, result.output);

    if (checkResults.needsHumanApproval) {
      const requireReview = Boolean(
        executionConfig.sandbox?.enabled &&
          result.sandboxInfo?.worktreePath &&
          (executionConfig.sandbox?.requireApproval ?? true)
      );
      store.setSessionStatus(sessionId, requireReview ? 'awaiting_review' : 'awaiting_approval');
      store.setNodeStatus(project.id, node.id, requireReview ? 'awaiting_review' : 'running');
      return;
    }

    if (checkResults.needsRetry) {
      store.setSessionStatus(sessionId, 'failed');
      store.setNodeStatus(project.id, node.id, 'pending');
      return;
    }

    if (checkResults.allPassed) {
      const requireReview = Boolean(
        executionConfig.sandbox?.enabled &&
          result.sandboxInfo?.worktreePath &&
          (executionConfig.sandbox?.requireApproval ?? true)
      );
      if (requireReview) {
        store.setSessionStatus(sessionId, 'awaiting_review');
        store.setNodeStatus(project.id, node.id, 'awaiting_review');
      } else {
        store.setSessionStatus(sessionId, 'completed');
        store.setNodeStatus(project.id, node.id, 'completed');
      }
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
  const getState = useOrchestraStore.getState;
  getState().setCheckResult(sessionId, checkId, 'passed');

  // Check if all checks are now passed
  const session = getState().sessions[sessionId];
  if (!session) return;

  const allPassed = Object.values(session.checkResults).every((r) => r === 'passed');

  if (allPassed) {
    // Find the project and node
    const projectId = Object.keys(getState().projects).find((pid) => {
      const project = getState().projects[pid];
      return project.nodes.some((n) => n.id === session.nodeId);
    });

    if (projectId) {
      getState().setSessionStatus(sessionId, 'completed');
      getState().setNodeStatus(projectId, session.nodeId, 'completed');
    }
  }
}

/**
 * Finalize a sandboxed run (commit/push/PR) and optionally cleanup the worktree.
 * Intended to be called from the UI when a node is awaiting review.
 */
export async function finalizeSandboxSession(sessionId: string): Promise<void> {
  const store = useOrchestraStore.getState();
  const session = store.sessions[sessionId];
  if (!session?.sandboxInfo) {
    throw new Error('No sandbox info available for this session');
  }

  const projectId = Object.keys(store.projects).find((pid) =>
    store.projects[pid].nodes.some((n) => n.id === session.nodeId)
  );
  if (!projectId) throw new Error('Project not found for session');

  const project = store.projects[projectId];
  const node = project.nodes.find((n) => n.id === session.nodeId);
  if (!node) throw new Error('Node not found for session');

  const executionConfig = resolveExecutionConfig(node, project);
  const sandbox = executionConfig.sandbox;
  if (!sandbox?.enabled) {
    throw new Error('Sandbox is not enabled for this node');
  }

  const finalizeAction = sandbox.finalizeAction || 'pr';
  const baseBranch = session.sandboxInfo.baseBranch || sandbox.prBaseBranch || 'main';

  // Mark any human approval checks as passed as part of review approval.
  for (const check of node.checks) {
    if (check.type === 'human_approval') {
      store.setCheckResult(sessionId, check.id, 'passed');
    }
  }

  const finalizeResponse = await fetch('/api/sandbox/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      worktreePath: session.sandboxInfo.worktreePath,
      branchName: session.sandboxInfo.branchName,
      baseBranch,
      finalizeAction,
    }),
  });

  if (!finalizeResponse.ok) {
    const text = await finalizeResponse.text();
    throw new Error(text || 'Failed to finalize sandbox');
  }

  const finalizeResult = (await finalizeResponse.json()) as {
    hasChanges: boolean;
    commitHash?: string;
    prUrl?: string;
    finalizeAction?: string;
  };

  store.setSessionSandboxInfo(sessionId, {
    ...session.sandboxInfo,
    baseBranch,
    commitHash: finalizeResult.commitHash,
    prUrl: finalizeResult.prUrl,
    finalizeAction,
  });

  // Optionally cleanup the sandbox worktree after finalize.
  // If finalizeAction is 'none', keep the worktree so changes are not lost.
  if (finalizeAction !== 'none' && sandbox.cleanupOnFinalize !== false && project.location) {
    await fetch('/api/sandbox/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoPath: project.location,
        worktreePath: session.sandboxInfo.worktreePath,
        branchName: session.sandboxInfo.branchName,
      }),
    }).catch(() => {
      // Best-effort cleanup
    });
  }

  store.setSessionStatus(sessionId, 'completed');
  store.setNodeStatus(projectId, session.nodeId, 'completed');
}

/**
 * Generate a Markdown summary of the latest run for the session's node.
 * This runs a lightweight LLM pass (best-effort) and stores it on the NodeRun.
 */
export async function generateSessionSummary(sessionId: string): Promise<void> {
  const store = useOrchestraStore.getState();
  const session = store.sessions[sessionId];
  if (!session) throw new Error('Session not found');

  // Find the latest run for this node
  const latestRun = Object.values(store.nodeRuns)
    .filter((r) => r.nodeId === session.nodeId)
    .sort((a, b) => b.startedAt - a.startedAt)[0];

  if (!latestRun?.output) {
    throw new Error('No output available to summarize');
  }

  const projectId = Object.keys(store.projects).find((pid) =>
    store.projects[pid].nodes.some((n) => n.id === session.nodeId)
  );
  const project = projectId ? store.projects[projectId] : null;
  const node = project ? project.nodes.find((n) => n.id === session.nodeId) : null;

  const output = latestRun.output;
  const maxOutputChars = 60_000;
  const clippedOutput = output.length > maxOutputChars ? output.slice(0, maxOutputChars) + '\n\n[TRUNCATED]' : output;

  const diffHint = session.sandboxInfo?.worktreePath
    ? `This run happened in a git worktree at: ${session.sandboxInfo.worktreePath}\nBranch: ${session.sandboxInfo.branchName}\n`
    : '';

  const prompt = `You are summarizing what an AI agent just did in a development orchestration tool.

Return **Markdown** only.

## Context
Project: ${project?.name || 'Unknown'}
Node: ${node?.title || session.nodeId}
${diffHint}

## Node prompt (compiled)
${latestRun.prompt}

## Agent output
${clippedOutput}

## What to produce
Write a concise summary with these sections:
- What happened
- Files / deliverables (if any)
- How to verify (commands)
- Risks / follow-ups
`;

  const res = await executeAgent({
    executor: 'claude',
    prompt,
    options: { model: 'haiku' },
  });

  if (res.status === 'error') {
    throw new Error(res.error || 'Summary generation failed');
  }

  store.updateNodeRun(latestRun.id, { summaryMarkdown: res.output || '' });
}

/**
 * Run entire project DAG with timeout and safety limits
 */
export async function runProject(projectId: string): Promise<void> {
  const getState = useOrchestraStore.getState;
  const project = getState().projects[projectId];

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Reset all node statuses
  for (const node of project.nodes) {
    getState().setNodeStatus(projectId, node.id, 'pending');
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
        const currentProject = getState().projects[projectId];
        if (currentProject) {
          for (const node of currentProject.nodes) {
            if (node.status === 'pending' || node.status === 'running') {
              getState().setNodeStatus(projectId, node.id, 'failed');
            }
          }
        }
        throw new Error(`Execution exceeded maximum iterations (${MAX_ITERATIONS}). Possible infinite loop detected.`);
      }

      // Safety check: timeout
      if (Date.now() - startTime > PROJECT_EXECUTION_TIMEOUT_MS) {
        // Mark all remaining pending/running nodes as failed
        const currentProject = getState().projects[projectId];
        if (currentProject) {
          for (const node of currentProject.nodes) {
            if (node.status === 'pending' || node.status === 'running') {
              getState().setNodeStatus(projectId, node.id, 'failed');
            }
          }
        }
        throw new Error(`Execution timed out after ${PROJECT_EXECUTION_TIMEOUT_MS / 1000} seconds`);
      }

      const currentProject = getState().projects[projectId];
      if (!currentProject) break;

      // Sync completion/failure sets with current node statuses (handles async approvals)
      for (const node of currentProject.nodes) {
        if (node.status === 'completed') {
          completedNodeIds.add(node.id);
        }
        if (node.status === 'failed') {
          failedNodeIds.add(node.id);
        }
      }

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
          // All running work is done, and we have failures - mark remaining pending as failed
          for (const node of currentProject.nodes) {
            if (node.status === 'pending') {
              getState().setNodeStatus(projectId, node.id, 'failed');
              failedNodeIds.add(node.id);
            }
          }
          break;
        }

        // If any node is awaiting review, pause the DAG run and return control to the user.
        const awaitingReview = currentProject.nodes.some((n) => {
          if (!n.sessionId) return false;
          const session = getState().sessions[n.sessionId];
          return session?.status === 'awaiting_review';
        });
        if (awaitingReview) {
          break;
        }

        // Check for awaiting approval (legacy check gate)
        const awaitingApproval = currentProject.nodes.some((n) => {
          if (!n.sessionId) return false;
          const session = getState().sessions[n.sessionId];
          return session?.status === 'awaiting_approval';
        });
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
            const updatedNode = getState().projects[projectId]?.nodes.find((n) => n.id === node.id);
            if (updatedNode?.status === 'completed') {
              completedNodeIds.add(node.id);
            } else if (updatedNode?.status === 'failed') {
              failedNodeIds.add(node.id);
            }
          } catch {
            // Ensure node is marked as failed
            failedNodeIds.add(node.id);
            const currentStatus = getState().projects[projectId]?.nodes.find(n => n.id === node.id)?.status;
            if (currentStatus !== 'failed') {
              getState().setNodeStatus(projectId, node.id, 'failed');
            }
          }
        })
      );
    }
  } catch (error) {
    // Final cleanup: ensure no nodes are stuck in running state
    const finalProject = getState().projects[projectId];
    if (finalProject) {
      for (const node of finalProject.nodes) {
        if (node.status === 'running') {
          getState().setNodeStatus(projectId, node.id, 'failed');
        }
      }
    }
    throw error;
  }
}
