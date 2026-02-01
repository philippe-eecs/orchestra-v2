/**
 * System Check Utilities
 *
 * Detects availability of Docker and CLI tools (Claude, Codex, Gemini)
 * for the Orchestra Desktop application.
 */

import type { SystemStatus } from './types';

/**
 * Check if a command exists in the system PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const result = await Command.create('which', [command]).execute();
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is available and running
 */
async function checkDocker(): Promise<boolean> {
  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    const result = await Command.create('docker', ['info']).execute();
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Check system status for all required tools
 */
export async function checkSystemStatus(): Promise<SystemStatus> {
  const [dockerAvailable, claudeCliDetected, codexCliDetected, geminiCliDetected] =
    await Promise.all([
      checkDocker(),
      commandExists('claude'),
      commandExists('codex'),
      commandExists('gemini'),
    ]);

  return {
    dockerAvailable,
    claudeCliDetected,
    codexCliDetected,
    geminiCliDetected,
    lastChecked: Date.now(),
  };
}

/**
 * Get a human-readable status summary
 */
export function getStatusSummary(status: SystemStatus): string {
  const available: string[] = [];
  const missing: string[] = [];

  if (status.claudeCliDetected) available.push('Claude');
  else missing.push('Claude');

  if (status.codexCliDetected) available.push('Codex');
  else missing.push('Codex');

  if (status.geminiCliDetected) available.push('Gemini');
  else missing.push('Gemini');

  if (status.dockerAvailable) available.push('Docker');
  else missing.push('Docker');

  if (missing.length === 0) {
    return 'All systems operational';
  } else if (available.length === 0) {
    return 'No CLI tools detected';
  } else {
    return `${available.join(', ')} ready`;
  }
}
