import { get } from 'svelte/store';
import { hubUrl, hubConnected } from '../stores/hub';
import { addDebugEntry } from '../stores/debug';
import type {
  Project, ProjectCreate,
  Node, NodeCreate, NodeUpdate, Graph,
  Task, TaskCreate,
  Run, RunCreate,
  PlanRequest, PlanResponse,
  AgentTemplate, AgentTemplateCreate, AgentTemplateUpdate, AgentTemplateWithSteps,
  AgentStep, AgentStepCreate, AgentStepUpdate, AgentStepEdge,
  Execution, ExecutionCreate, ExecutionUpdate, ExecutionWithStepRuns,
  StepRun, StepRunUpdate,
  LaunchPreview, LaunchRequest,
  SynthesisQuestions, FeedbackSubmission, FeedbackResponse,
  PipelineLaunchRequest, PipelineLaunchResponse,
} from './types';

class ApiClient {
  private getBaseUrl(): string {
    return get(hubUrl);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    // Log request to debug store
    addDebugEntry({
      type: 'request',
      method,
      url,
      body,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await fetch(url, options);
      const data = response.status !== 204 ? await response.json() : null;

      // Log response to debug store
      addDebugEntry({
        type: 'response',
        status: response.status,
        url,
        data,
        timestamp: new Date().toISOString(),
      });

      if (!response.ok) {
        hubConnected.set(true); // Connected but got error
        throw new Error(data?.detail || `HTTP ${response.status}`);
      }

      hubConnected.set(true);
      return data as T;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        hubConnected.set(false);
      }
      // Log error to debug store
      addDebugEntry({
        type: 'error',
        url,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  // Projects
  async listProjects(): Promise<Project[]> {
    return this.request<Project[]>('GET', '/projects');
  }

  async createProject(data: ProjectCreate): Promise<Project> {
    return this.request<Project>('POST', '/projects', data);
  }

  async getProject(id: number): Promise<Project> {
    return this.request<Project>('GET', `/projects/${id}`);
  }

  async deleteProject(id: number): Promise<void> {
    await this.request<void>('DELETE', `/projects/${id}`);
  }

  // Nodes & Graph
  async getGraph(projectId: number): Promise<Graph> {
    return this.request<Graph>('GET', `/projects/${projectId}/graph`);
  }

  async createNode(projectId: number, data: NodeCreate): Promise<Node> {
    return this.request<Node>('POST', `/projects/${projectId}/nodes`, data);
  }

  async updateNode(projectId: number, nodeId: number, data: NodeUpdate): Promise<Node> {
    return this.request<Node>('PATCH', `/projects/${projectId}/nodes/${nodeId}`, data);
  }

  async deleteNode(projectId: number, nodeId: number): Promise<void> {
    await this.request<void>('DELETE', `/projects/${projectId}/nodes/${nodeId}`);
  }

  // Tasks
  async listTasks(projectId?: number, completed?: boolean): Promise<Task[]> {
    const params = new URLSearchParams();
    if (projectId !== undefined) params.set('project_id', String(projectId));
    if (completed !== undefined) params.set('completed', String(completed));
    const query = params.toString();
    return this.request<Task[]>('GET', `/tasks${query ? `?${query}` : ''}`);
  }

  async createTask(data: TaskCreate): Promise<Task> {
    return this.request<Task>('POST', '/tasks', data);
  }

  async updateTask(id: number, data: Partial<TaskCreate>): Promise<Task> {
    return this.request<Task>('PATCH', `/tasks/${id}`, data);
  }

  async deleteTask(id: number): Promise<void> {
    await this.request<void>('DELETE', `/tasks/${id}`);
  }

  // Runs
  async listRuns(projectId: number, nodeId?: number): Promise<Run[]> {
    const params = nodeId !== undefined ? `?node_id=${nodeId}` : '';
    return this.request<Run[]>('GET', `/projects/${projectId}/runs${params}`);
  }

  async createRun(projectId: number, data: RunCreate): Promise<Run> {
    return this.request<Run>('POST', `/projects/${projectId}/runs`, data);
  }

  async updateRun(projectId: number, runId: number, data: Partial<Run>): Promise<Run> {
    return this.request<Run>('PATCH', `/projects/${projectId}/runs/${runId}`, data);
  }

  // Plan
  async generatePlan(projectId: number, data: PlanRequest): Promise<PlanResponse> {
    return this.request<PlanResponse>('POST', `/projects/${projectId}/plan`, data);
  }

  // Health
  async checkHealth(): Promise<boolean> {
    try {
      await this.request<{ status: string }>('GET', '/health');
      return true;
    } catch {
      return false;
    }
  }

  // Agent Templates
  async listTemplates(): Promise<AgentTemplate[]> {
    return this.request<AgentTemplate[]>('GET', '/agent-templates');
  }

  async createTemplate(data: AgentTemplateCreate): Promise<AgentTemplateWithSteps> {
    return this.request<AgentTemplateWithSteps>('POST', '/agent-templates', data);
  }

  async getTemplate(id: number): Promise<AgentTemplateWithSteps> {
    return this.request<AgentTemplateWithSteps>('GET', `/agent-templates/${id}`);
  }

  async updateTemplate(id: number, data: AgentTemplateUpdate): Promise<AgentTemplate> {
    return this.request<AgentTemplate>('PATCH', `/agent-templates/${id}`, data);
  }

  async deleteTemplate(id: number): Promise<void> {
    await this.request<void>('DELETE', `/agent-templates/${id}`);
  }

  async createStep(templateId: number, data: AgentStepCreate): Promise<AgentStep> {
    return this.request<AgentStep>('POST', `/agent-templates/${templateId}/steps`, data);
  }

  async updateStep(templateId: number, stepId: number, data: AgentStepUpdate): Promise<AgentStep> {
    return this.request<AgentStep>('PATCH', `/agent-templates/${templateId}/steps/${stepId}`, data);
  }

  async deleteStep(templateId: number, stepId: number): Promise<void> {
    await this.request<void>('DELETE', `/agent-templates/${templateId}/steps/${stepId}`);
  }

  async createEdge(templateId: number, edge: AgentStepEdge): Promise<AgentStepEdge> {
    return this.request<AgentStepEdge>('POST', `/agent-templates/${templateId}/edges`, edge);
  }

  async deleteEdge(templateId: number, edge: AgentStepEdge): Promise<void> {
    await this.request<void>('DELETE', `/agent-templates/${templateId}/edges`, edge);
  }

  // Executions
  async listExecutions(projectId: number, nodeId?: number, templateId?: number): Promise<Execution[]> {
    const params = new URLSearchParams();
    if (nodeId !== undefined) params.set('node_id', String(nodeId));
    if (templateId !== undefined) params.set('template_id', String(templateId));
    const query = params.toString();
    return this.request<Execution[]>('GET', `/projects/${projectId}/executions${query ? `?${query}` : ''}`);
  }

  async createExecution(projectId: number, data: ExecutionCreate): Promise<ExecutionWithStepRuns> {
    return this.request<ExecutionWithStepRuns>('POST', `/projects/${projectId}/executions`, data);
  }

  async getExecution(projectId: number, execId: number): Promise<ExecutionWithStepRuns> {
    return this.request<ExecutionWithStepRuns>('GET', `/projects/${projectId}/executions/${execId}`);
  }

  async updateExecution(projectId: number, execId: number, data: ExecutionUpdate): Promise<Execution> {
    return this.request<Execution>('PATCH', `/projects/${projectId}/executions/${execId}`, data);
  }

  async cancelExecution(projectId: number, execId: number): Promise<Execution> {
    return this.request<Execution>('POST', `/projects/${projectId}/executions/${execId}/cancel`);
  }

  async getAttachCommand(projectId: number, execId: number): Promise<{ success: boolean; command: string; note?: string }> {
    return this.request('GET', `/projects/${projectId}/executions/${execId}/attach-command`);
  }

  async updateStepRun(projectId: number, execId: number, stepRunId: number, data: StepRunUpdate): Promise<StepRun> {
    return this.request<StepRun>('PATCH', `/projects/${projectId}/executions/${execId}/steps/${stepRunId}`, data);
  }

  // Launch
  async previewLaunch(projectId: number, nodeId: number, request: LaunchRequest): Promise<LaunchPreview> {
    return this.request<LaunchPreview>('POST', `/projects/${projectId}/nodes/${nodeId}/preview`, request);
  }

  async launch(projectId: number, nodeId: number, request: LaunchRequest): Promise<ExecutionWithStepRuns> {
    return this.request<ExecutionWithStepRuns>('POST', `/projects/${projectId}/nodes/${nodeId}/launch`, request);
  }

  // Feedback (Human Review)
  async getSynthesisQuestions(projectId: number, nodeId: number): Promise<SynthesisQuestions> {
    return this.request<SynthesisQuestions>('GET', `/projects/${projectId}/nodes/${nodeId}/synthesis`);
  }

  async submitFeedback(projectId: number, nodeId: number, feedback: FeedbackSubmission): Promise<FeedbackResponse> {
    return this.request<FeedbackResponse>('POST', `/projects/${projectId}/nodes/${nodeId}/feedback`, feedback);
  }

  async getNodesNeedingReview(projectId: number): Promise<SynthesisQuestions[]> {
    return this.request<SynthesisQuestions[]>('GET', `/projects/${projectId}/nodes/needs-review`);
  }

  // Pipeline Launch
  async launchPipeline(
    projectId: number,
    nodeId: number,
    request: PipelineLaunchRequest = { use_default_pipeline: true }
  ): Promise<PipelineLaunchResponse> {
    return this.request<PipelineLaunchResponse>(
      'POST',
      `/projects/${projectId}/nodes/${nodeId}/launch-pipeline`,
      request
    );
  }
}

export const api = new ApiClient();
