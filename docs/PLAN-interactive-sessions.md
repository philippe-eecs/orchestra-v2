# Plan: Interactive tmux-based Agent Sessions

## Overview

Replace the current fire-and-forget execution model with tmux-based interactive sessions that users can attach to with their native terminal (Ghostty, iTerm, etc.).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRA UI                                   │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │ Node: Build API  │  │ Node: Write Tests│  │ Node: Deploy     │      │
│  │ Session: node-1  │  │ Session: node-2  │  │ Session: (none)  │      │
│  │ Status: 🟢 running│  │ Status: ⏸ paused │  │ Status: ○ pending│      │
│  │                  │  │                  │  │                  │      │
│  │ ┌──────────────┐ │  │ ┌──────────────┐ │  │                  │      │
│  │ │ Last output: │ │  │ │ Last output: │ │  │                  │      │
│  │ │ Working on...│ │  │ │ Tests pass!  │ │  │   [Run Node]     │      │
│  │ └──────────────┘ │  │ └──────────────┘ │  │                  │      │
│  │                  │  │                  │  │                  │      │
│  │ [Attach] [Kill]  │  │ [Attach] [Kill]  │  │                  │      │
│  │ ┌──────────────┐ │  │                  │  │                  │      │
│  │ │Quick input:  │ │  │                  │  │                  │      │
│  │ │[___________]▶│ │  │                  │  │                  │      │
│  │ └──────────────┘ │  │                  │  │                  │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
                │                    │
                │ Tauri Commands     │
                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SESSION MANAGER (Rust)                            │
│                                                                          │
│  sessions: HashMap<String, TmuxSession>                                  │
│                                                                          │
│  struct TmuxSession {                                                    │
│      id: String,              // "node-abc123"                           │
│      node_id: String,         // reference to Orchestra node             │
│      created_at: DateTime,                                               │
│      status: SessionStatus,   // Running, Paused, Completed, Failed      │
│  }                                                                       │
│                                                                          │
│  Commands:                                                               │
│  - create_session(node_id, agent, prompt, cwd) -> session_id            │
│  - attach_session(session_id) -> opens native terminal                  │
│  - send_input(session_id, text) -> sends keys to tmux                   │
│  - capture_output(session_id) -> last N lines                           │
│  - kill_session(session_id)                                             │
│  - list_sessions() -> Vec<TmuxSession>                                  │
└─────────────────────────────────────────────────────────────────────────┘
                │
                │ tmux commands
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           TMUX SERVER                                    │
│                                                                          │
│  Session: node-abc123          Session: node-def456                      │
│  ┌─────────────────────┐      ┌─────────────────────┐                   │
│  │ $ claude -p ...     │      │ $ codex exec ...    │                   │
│  │ > Working on API    │      │ > Tests complete    │                   │
│  │ > [Read] src/...    │      │ >                   │                   │
│  │ █                   │      │                     │                   │
│  └─────────────────────┘      └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Backend - Session Manager

**File: `src-tauri/src/sessions/mod.rs`** (new module)

```rust
pub mod manager;
pub mod tmux;
```

**File: `src-tauri/src/sessions/tmux.rs`**

```rust
use std::process::Command;

pub struct TmuxError(pub String);

/// Check if tmux is available
pub fn is_available() -> bool {
    which::which("tmux").is_ok()
}

/// Create a new tmux session
pub fn create_session(
    session_id: &str,
    command: &str,
    cwd: Option<&str>,
) -> Result<(), TmuxError> {
    let mut cmd = Command::new("tmux");
    cmd.args(["new-session", "-d", "-s", session_id]);

    if let Some(dir) = cwd {
        cmd.args(["-c", dir]);
    }

    // The command to run inside the session
    cmd.arg(command);

    let output = cmd.output().map_err(|e| TmuxError(e.to_string()))?;
    if !output.status.success() {
        return Err(TmuxError(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    Ok(())
}

/// Check if a session exists
pub fn session_exists(session_id: &str) -> bool {
    Command::new("tmux")
        .args(["has-session", "-t", session_id])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Capture the current pane content
pub fn capture_pane(session_id: &str, lines: usize) -> Result<String, TmuxError> {
    let output = Command::new("tmux")
        .args([
            "capture-pane",
            "-t", session_id,
            "-p",           // print to stdout
            "-S", &format!("-{}", lines),  // start from N lines back
        ])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Send keys to a session (like typing)
pub fn send_keys(session_id: &str, keys: &str) -> Result<(), TmuxError> {
    let output = Command::new("tmux")
        .args(["send-keys", "-t", session_id, keys, "Enter"])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    if !output.status.success() {
        return Err(TmuxError(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    Ok(())
}

/// Kill a session
pub fn kill_session(session_id: &str) -> Result<(), TmuxError> {
    let output = Command::new("tmux")
        .args(["kill-session", "-t", session_id])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    if !output.status.success() {
        return Err(TmuxError(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    Ok(())
}

/// List all orchestra sessions (prefixed with "orchestra-")
pub fn list_sessions() -> Result<Vec<String>, TmuxError> {
    let output = Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
        .map_err(|e| TmuxError(e.to_string()))?;

    let sessions: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|s| s.starts_with("orchestra-"))
        .map(|s| s.to_string())
        .collect();

    Ok(sessions)
}

/// Get the attach command for a session
pub fn get_attach_command(session_id: &str) -> String {
    format!("tmux attach -t {}", session_id)
}
```

**File: `src-tauri/src/sessions/manager.rs`**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::tmux;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub node_id: String,
    pub agent: String,
    pub status: SessionStatus,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Running,
    Completed,
    Failed,
}

pub struct SessionManager {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        node_id: &str,
        agent: &str,
        model: Option<&str>,
        prompt: &str,
        cwd: Option<&str>,
    ) -> Result<Session, String> {
        let session_id = format!("orchestra-{}", uuid::Uuid::new_v4());

        // Build the command based on agent
        let command = build_agent_command(agent, model, prompt);

        // Create tmux session
        tmux::create_session(&session_id, &command, cwd)
            .map_err(|e| e.0)?;

        let session = Session {
            id: session_id.clone(),
            node_id: node_id.to_string(),
            agent: agent.to_string(),
            status: SessionStatus::Running,
            created_at: chrono::Utc::now().timestamp_millis(),
        };

        self.sessions.lock().await.insert(session_id, session.clone());

        Ok(session)
    }

    pub async fn get_session(&self, session_id: &str) -> Option<Session> {
        self.sessions.lock().await.get(session_id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<Session> {
        self.sessions.lock().await.values().cloned().collect()
    }

    pub async fn kill_session(&self, session_id: &str) -> Result<(), String> {
        tmux::kill_session(session_id).map_err(|e| e.0)?;
        self.sessions.lock().await.remove(session_id);
        Ok(())
    }
}

fn build_agent_command(agent: &str, model: Option<&str>, prompt: &str) -> String {
    // Escape the prompt for shell
    let escaped_prompt = prompt.replace("'", "'\\''");

    match agent {
        "claude" => {
            let model_arg = model.map(|m| format!(" --model {}", m)).unwrap_or_default();
            format!(
                "claude{} --allowedTools Bash,Read,Write,Edit,Glob,Grep -p '{}'",
                model_arg, escaped_prompt
            )
        }
        "codex" => {
            let model_arg = model.map(|m| format!(" --model {}", m)).unwrap_or_default();
            format!("codex{} exec '{}'", model_arg, escaped_prompt)
        }
        "gemini" => {
            let model_arg = model.map(|m| format!(" -m {}", m)).unwrap_or_default();
            format!("gemini{} '{}'", model_arg, escaped_prompt)
        }
        _ => format!("{} '{}'", agent, escaped_prompt),
    }
}
```

### Phase 2: Tauri Commands

**File: `src-tauri/src/commands/sessions.rs`** (new file)

```rust
use crate::sessions::manager::{Session, SessionManager};
use crate::sessions::tmux;
use tauri::State;

#[tauri::command]
pub async fn create_interactive_session(
    state: State<'_, SessionManager>,
    node_id: String,
    agent: String,
    model: Option<String>,
    prompt: String,
    cwd: Option<String>,
) -> Result<Session, String> {
    state.create_session(
        &node_id,
        &agent,
        model.as_deref(),
        &prompt,
        cwd.as_deref(),
    ).await
}

#[tauri::command]
pub async fn attach_session(session_id: String) -> Result<(), String> {
    // Get user's preferred terminal from environment or default
    let terminal = std::env::var("ORCHESTRA_TERMINAL")
        .unwrap_or_else(|_| "Ghostty".to_string());

    let attach_cmd = tmux::get_attach_command(&session_id);

    #[cfg(target_os = "macos")]
    {
        // Try to open with the preferred terminal
        let result = std::process::Command::new("open")
            .args(["-a", &terminal, "--args", "-e", &attach_cmd])
            .spawn();

        if result.is_err() {
            // Fallback to Terminal.app
            std::process::Command::new("open")
                .args(["-a", "Terminal", "--args", "-e", &attach_cmd])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Try common terminal emulators
        let terminals = ["ghostty", "alacritty", "kitty", "gnome-terminal", "xterm"];
        for term in terminals {
            if which::which(term).is_ok() {
                std::process::Command::new(term)
                    .args(["-e", "sh", "-c", &attach_cmd])
                    .spawn()
                    .map_err(|e| format!("Failed to open terminal: {}", e))?;
                return Ok(());
            }
        }
        return Err("No supported terminal found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn send_session_input(
    session_id: String,
    input: String,
) -> Result<(), String> {
    tmux::send_keys(&session_id, &input).map_err(|e| e.0)
}

#[tauri::command]
pub async fn capture_session_output(
    session_id: String,
    lines: Option<usize>,
) -> Result<String, String> {
    tmux::capture_pane(&session_id, lines.unwrap_or(50)).map_err(|e| e.0)
}

#[tauri::command]
pub async fn kill_interactive_session(
    state: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    state.kill_session(&session_id).await
}

#[tauri::command]
pub async fn list_interactive_sessions(
    state: State<'_, SessionManager>,
) -> Result<Vec<Session>, String> {
    Ok(state.list_sessions().await)
}

#[tauri::command]
pub fn get_attach_command(session_id: String) -> String {
    tmux::get_attach_command(&session_id)
}
```

### Phase 3: Register in lib.rs

**Update `src-tauri/src/lib.rs`:**

```rust
mod sessions;  // Add this

use sessions::manager::SessionManager;

// In run() function, add to builder:
.manage(SessionManager::new())
.invoke_handler(tauri::generate_handler![
    // ... existing handlers ...
    commands::sessions::create_interactive_session,
    commands::sessions::attach_session,
    commands::sessions::send_session_input,
    commands::sessions::capture_session_output,
    commands::sessions::kill_interactive_session,
    commands::sessions::list_interactive_sessions,
    commands::sessions::get_attach_command,
])
```

### Phase 4: Frontend API

**File: `lib/api.ts`** (add new functions)

```typescript
export interface InteractiveSession {
  id: string;
  nodeId: string;
  agent: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: number;
}

export async function createInteractiveSession(input: {
  nodeId: string;
  agent: AgentType;
  model?: string;
  prompt: string;
  cwd?: string;
}): Promise<InteractiveSession> {
  if (isTauri()) {
    return invoke<InteractiveSession>('create_interactive_session', input);
  }
  throw new Error('Interactive sessions require Tauri');
}

export async function attachSession(sessionId: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>('attach_session', { sessionId });
  }
  throw new Error('Interactive sessions require Tauri');
}

export async function sendSessionInput(sessionId: string, input: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>('send_session_input', { sessionId, input });
  }
  throw new Error('Interactive sessions require Tauri');
}

export async function captureSessionOutput(sessionId: string, lines?: number): Promise<string> {
  if (isTauri()) {
    return invoke<string>('capture_session_output', { sessionId, lines });
  }
  throw new Error('Interactive sessions require Tauri');
}

export async function killInteractiveSession(sessionId: string): Promise<void> {
  if (isTauri()) {
    return invoke<void>('kill_interactive_session', { sessionId });
  }
  throw new Error('Interactive sessions require Tauri');
}

export async function listInteractiveSessions(): Promise<InteractiveSession[]> {
  if (isTauri()) {
    return invoke<InteractiveSession[]>('list_interactive_sessions');
  }
  return [];
}

export async function getAttachCommand(sessionId: string): Promise<string> {
  if (isTauri()) {
    return invoke<string>('get_attach_command', { sessionId });
  }
  return `tmux attach -t ${sessionId}`;
}
```

### Phase 5: Frontend UI Updates

**Update `src/components/panels/NodeEditor.tsx`:**

Add session controls when a node has an active session:

```tsx
// Add to imports
import { useState, useEffect } from 'react';
import * as api from '@/lib/api';

// Inside NodeEditor component, add:
const [session, setSession] = useState<api.InteractiveSession | null>(null);
const [outputPreview, setOutputPreview] = useState<string>('');
const [quickInput, setQuickInput] = useState('');

// Poll for session status and output
useEffect(() => {
  if (!session) return;

  const interval = setInterval(async () => {
    try {
      const output = await api.captureSessionOutput(session.id, 30);
      setOutputPreview(output);
    } catch {
      // Session might have ended
      setSession(null);
    }
  }, 2000);

  return () => clearInterval(interval);
}, [session]);

// Add UI for session controls:
{session ? (
  <div className="border-t border-border p-4 space-y-3">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-medium">Session Active</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => api.attachSession(session.id)}>
          Attach
        </Button>
        <Button size="sm" variant="destructive" onClick={async () => {
          await api.killInteractiveSession(session.id);
          setSession(null);
        }}>
          Kill
        </Button>
      </div>
    </div>

    {/* Output preview */}
    <pre className="max-h-[150px] overflow-auto rounded-md bg-black/90 p-3 text-xs text-green-400 font-mono">
      {outputPreview || 'Waiting for output...'}
    </pre>

    {/* Quick input */}
    <div className="flex gap-2">
      <Input
        value={quickInput}
        onChange={(e) => setQuickInput(e.target.value)}
        placeholder="Send input without attaching..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && quickInput) {
            api.sendSessionInput(session.id, quickInput);
            setQuickInput('');
          }
        }}
      />
      <Button size="sm" onClick={() => {
        if (quickInput) {
          api.sendSessionInput(session.id, quickInput);
          setQuickInput('');
        }
      }}>
        Send
      </Button>
    </div>
  </div>
) : (
  <div className="border-t border-border p-4">
    <Button
      className="w-full"
      onClick={async () => {
        const newSession = await api.createInteractiveSession({
          nodeId: node.id,
          agent: node.agent.type,
          model: node.agent.model,
          prompt: node.prompt,
          cwd: project?.location,
        });
        setSession(newSession);
      }}
    >
      Start Interactive Session
    </Button>
  </div>
)}
```

### Phase 6: Settings for Terminal Preference

**Add to settings/preferences:**

```typescript
// User can configure their preferred terminal
interface UserPreferences {
  terminal: 'Ghostty' | 'iTerm' | 'Terminal' | 'Alacritty' | 'Kitty' | string;
}
```

The backend reads `ORCHESTRA_TERMINAL` env var or defaults to Ghostty.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/src/sessions/mod.rs` | Create | Module declaration |
| `src-tauri/src/sessions/tmux.rs` | Create | Low-level tmux commands |
| `src-tauri/src/sessions/manager.rs` | Create | Session state management |
| `src-tauri/src/commands/sessions.rs` | Create | Tauri command handlers |
| `src-tauri/src/lib.rs` | Modify | Register new module and commands |
| `lib/api.ts` | Modify | Add frontend API functions |
| `src/components/panels/NodeEditor.tsx` | Modify | Add session UI controls |

---

## Testing Checklist

1. [ ] `tmux` is installed and accessible
2. [ ] Create session → tmux session appears (`tmux ls`)
3. [ ] Attach button → opens Ghostty with session
4. [ ] Send input → appears in tmux session
5. [ ] Capture output → shows in UI preview
6. [ ] Kill session → tmux session terminates
7. [ ] Session survives UI navigation
8. [ ] Multiple sessions can run concurrently

---

## Future Enhancements

1. **Session persistence** - Save session IDs to SQLite, reconnect on app restart
2. **Session history** - Store completed session outputs
3. **Collaborative attach** - Multiple users can attach to same session
4. **Session recording** - Use `script` or tmux logging for full replay
5. **Terminal preference UI** - Settings panel to choose terminal app
