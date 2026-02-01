/**
 * External Terminal Launcher API
 *
 * Opens terminal applications (Ghostty, iTerm, Terminal.app) with
 * the provided command using AppleScript automation.
 *
 * Preferred terminal order:
 * 1. Ghostty - Modern, GPU-accelerated
 * 2. iTerm2 - Feature-rich, popular
 * 3. Terminal.app - macOS default
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

interface OpenTerminalRequest {
  command: string;
  preferredTerminal?: 'ghostty' | 'iterm' | 'terminal';
}

export async function POST(request: NextRequest) {
  try {
    const body: OpenTerminalRequest = await request.json();
    const { command, preferredTerminal } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'Command is required' },
        { status: 400 }
      );
    }

    // Determine which terminal to use
    const terminals = preferredTerminal
      ? [preferredTerminal]
      : ['ghostty', 'iterm', 'terminal'] as const;

    let success = false;
    let lastError: string | null = null;

    for (const terminal of terminals) {
      try {
        await openTerminal(terminal, command);
        success = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        // Try next terminal
      }
    }

    if (success) {
      return NextResponse.json({ status: 'ok' });
    }

    return NextResponse.json(
      { error: `Failed to open terminal: ${lastError}` },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

async function openTerminal(
  terminal: 'ghostty' | 'iterm' | 'terminal',
  command: string
): Promise<void> {
  const escapedCommand = command.replace(/"/g, '\\"');

  switch (terminal) {
    case 'ghostty':
      return openGhostty(escapedCommand);
    case 'iterm':
      return openITerm(escapedCommand);
    case 'terminal':
      return openTerminalApp(escapedCommand);
  }
}

/**
 * Open Ghostty with the command
 * Ghostty doesn't have native AppleScript support, so we use System Events
 */
async function openGhostty(command: string): Promise<void> {
  // First check if Ghostty is running
  const isRunning = await isAppRunning('Ghostty');

  if (isRunning) {
    // Activate Ghostty and open new tab with command
    const script = `
      tell application "Ghostty" to activate
      delay 0.3
      tell application "System Events"
        tell process "Ghostty"
          keystroke "t" using command down
          delay 0.2
          keystroke "${command}"
          keystroke return
        end tell
      end tell
    `;
    await runOsascript(script);
  } else {
    // Open Ghostty fresh, it will use default shell
    // Then send the command
    const script = `
      tell application "Ghostty"
        activate
      end tell
      delay 0.5
      tell application "System Events"
        tell process "Ghostty"
          keystroke "${command}"
          keystroke return
        end tell
      end tell
    `;
    await runOsascript(script);
  }
}

/**
 * Open iTerm2 with the command
 * iTerm has excellent AppleScript support
 */
async function openITerm(command: string): Promise<void> {
  const script = `
    tell application "iTerm"
      activate
      create window with default profile
      tell current session of current window
        write text "${command}"
      end tell
    end tell
  `;
  await runOsascript(script);
}

/**
 * Open Terminal.app with the command
 */
async function openTerminalApp(command: string): Promise<void> {
  const script = `
    tell application "Terminal"
      activate
      do script "${command}"
    end tell
  `;
  await runOsascript(script);
}

/**
 * Check if an application is running
 */
async function isAppRunning(appName: string): Promise<boolean> {
  const script = `
    tell application "System Events"
      return (name of processes) contains "${appName}"
    end tell
  `;

  try {
    const result = await runOsascript(script);
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Run an AppleScript and return the output
 */
function runOsascript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('osascript', ['-e', script], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `osascript exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}
