/**
 * Tauri IPC API Bridge
 *
 * This module provides a clean interface between the React frontend
 * and the Rust backend via Tauri's IPC system.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  Project,
  Node,
  Session,
  ExecutionConfig,
} from './types';

// ========== PROJECT API ==========

export async function listProjects(): Promise<Project[]> {
  return invoke('list_projects');
}

export async function getProject(id: string): Promise<Project | null> {
  return invoke('get_project', { id });
}

export async function createProject(
  name: string,
  description?: string,
  location?: string
): Promise<Project> {
  return invoke('create_project', { name, description, location });
}

export async function updateProject(project: Project): Promise<Project> {
  return invoke('update_project', { project });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke('delete_project', { id });
}

// ========== NODE API ==========

export async function addNode(projectId: string, node: Node): Promise<Node> {
  return invoke('add_node', { projectId, node });
}

export async function updateNode(projectId: string, node: Node): Promise<Node> {
  return invoke('update_node', { projectId, node });
}

export async function deleteNode(projectId: string, nodeId: string): Promise<void> {
  return invoke('delete_node', { projectId, nodeId });
}

// ========== EXECUTION API ==========

export interface ExecuteNodeRequest {
  projectId: string;
  nodeId: string;
  executor: 'claude' | 'codex' | 'gemini';
  prompt: string;
  options?: Record<string, unknown>;
  projectPath?: string;
  executionConfig?: ExecutionConfig;
}

export interface ExecuteNodeResponse {
  sessionId: string;
  status: string;
}

export async function executeNode(request: ExecuteNodeRequest): Promise<ExecuteNodeResponse> {
  return invoke('execute_node', { request });
}

export async function stopExecution(sessionId: string): Promise<void> {
  return invoke('stop_execution', { sessionId });
}

export async function getExecutionStatus(sessionId: string): Promise<Session | null> {
  return invoke('get_execution_status', { sessionId });
}

// ========== SESSION API ==========

export async function listSessions(): Promise<Session[]> {
  return invoke('list_sessions');
}

export async function getSession(sessionId: string): Promise<Session | null> {
  return invoke('get_session', { sessionId });
}

export async function getSessionOutput(sessionId: string): Promise<string | null> {
  return invoke('get_session_output', { sessionId });
}

// ========== EVENT LISTENERS ==========

export interface OutputChunkEvent {
  sessionId: string;
  nodeId: string;
  chunk: string;
}

export interface ExecutionCompleteEvent {
  sessionId: string;
  nodeId: string;
  status: string;
  output?: string;
  error?: string;
}

/**
 * Listen for execution output chunks
 */
export async function onExecutionOutput(
  callback: (event: OutputChunkEvent) => void
): Promise<UnlistenFn> {
  return listen<OutputChunkEvent>('execution:output', (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for execution completion events
 */
export async function onExecutionComplete(
  callback: (event: ExecutionCompleteEvent) => void
): Promise<UnlistenFn> {
  return listen<ExecutionCompleteEvent>('execution:complete', (event) => {
    callback(event.payload);
  });
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Check if running in Tauri environment
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Get the app data directory
 */
export async function getAppDataDir(): Promise<string> {
  const { appDataDir } = await import('@tauri-apps/api/path');
  return appDataDir();
}
