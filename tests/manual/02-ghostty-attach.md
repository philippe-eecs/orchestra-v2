# Test 02: Ghostty Attach

**Purpose**: Verify that "Open in Ghostty" opens a new Ghostty window attached to the tmux session.

## Prerequisites

- Ghostty installed at `/Applications/Ghostty.app` (macOS)
- Test 01 completed or an active Orchestra session exists

## Setup (Claude does this)

1. Create a long-running session for testing:
```bash
tmux new-session -d -s orchestra-test-attach sh -c 'echo "Test session for Ghostty attach"; sleep 300'
```

2. Verify session exists:
```bash
tmux ls | grep orchestra-test-attach
```

## Steps (You do this)

### Method A: From Node Context Menu
1. Open Orchestra app
2. Find a node with an active session (or start one via Test 01)
3. Right-click or use the node menu
4. Click **"Open in Ghostty"**

### Method B: Direct API Test (if UI not available)
Run this in browser console with Orchestra app open:
```javascript
window.__TAURI__.invoke('open_in_ghostty', { input: { sessionId: 'orchestra-test-attach' } })
```

## Verification

```bash
# Before clicking - count Ghostty windows
# (just observe visually or use)
osascript -e 'tell application "System Events" to count windows of process "Ghostty"'

# After clicking - should have one more window
```

## Expected Results

- [ ] New Ghostty window opens (not tab in existing window)
- [ ] Window shows tmux session content
- [ ] Can interact with the session (type commands)
- [ ] Detaching (Ctrl+B, D) returns to normal Ghostty prompt
- [ ] Original session continues running after detach

## Common Issues

### Ghostty doesn't open
- **Check**: Is Ghostty at `/Applications/Ghostty.app`?
- **Check**: Look for errors in Tauri console
- **Try**: Open Ghostty manually first, then try the button

### Opens but shows error
- **Symptom**: Ghostty opens but shows "session not found" or exits
- **Check**: Verify session exists with `tmux ls`
- **Check**: Session ID matches what Orchestra expects

### Opens Terminal.app instead
- **Check**: `ORCHESTRA_TERMINAL` environment variable
- **Check**: Ghostty path is correct in sessions.rs

### Window opens but is blank
- **Check**: tmux server running (`tmux ls` works)
- **Try**: Manually run `tmux attach -t <session-id>`

## Cleanup

```bash
# Kill test session when done
tmux kill-session -t orchestra-test-attach
```

## Report Template

```
## Test 02 Results
Date: YYYY-MM-DD
Tester: [name]
Ghostty Version: [version]
macOS Version: [version]

### Status: PASS / FAIL

### Observations:
- Did new window open?
- Was session content visible?
- Could you interact?

### Issues Found:
-

### Screenshots:
[paste]
```
