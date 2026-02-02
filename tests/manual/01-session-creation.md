# Test 01: Session Creation

**Purpose**: Verify that starting an interactive session actually launches Claude in a tmux session.

## Setup (Claude does this)

1. Create directory `/tmp/orchestra-test-01` if it doesn't exist
2. Ensure no existing tmux sessions named `orchestra-*` are running
3. Provide node configuration to use in the UI

**Node Config**:
```json
{
  "label": "Create Test File",
  "prompt": "Create a file called hello.txt with the text 'Hello from Orchestra test!'",
  "agent": "claude",
  "model": "sonnet"
}
```

## Steps (You do this)

1. Open Orchestra app
2. Create a new project or use existing
3. Set project location to `/tmp/orchestra-test-01`
4. Add an agent node with the prompt: `Create a file called hello.txt with the text 'Hello from Orchestra test!'`
5. Click **"Start Interactive Session"** on the node

## Verification Commands

Run these in a separate terminal to verify the session:

```bash
# Check if tmux session was created
tmux ls | grep orchestra

# Attach to see what's happening (read-only)
tmux attach -t <session-id>  # Use session ID from tmux ls

# Check if the agent is running
ps aux | grep claude

# After completion, check the output
cat /tmp/orchestra-test-01/hello.txt
```

## Expected Results

- [ ] Node status indicator changes (shows "running" state)
- [ ] `tmux ls` shows an `orchestra-*` session
- [ ] Attaching to tmux shows Claude agent running/has run
- [ ] `/tmp/orchestra-test-01/hello.txt` is created with correct content
- [ ] No error messages in Orchestra app or console

## Common Issues

### Agent not starting
- **Symptom**: tmux session exists but is empty or shows error
- **Check**: Look at tmux pane output for error messages
- **Possible cause**: `claude` CLI not installed or not on PATH

### tmux session not created
- **Symptom**: No `orchestra-*` session in `tmux ls`
- **Check**: Check Tauri console for errors
- **Possible cause**: tmux not installed, permission issues

### Wrong working directory
- **Symptom**: File created in wrong location
- **Check**: `pwd` in tmux session
- **Possible cause**: Project location not set correctly

## Report Template

```
## Test 01 Results
Date: YYYY-MM-DD
Tester: [name]

### Status: PASS / FAIL

### Observations:
-

### Issues Found:
-

### Screenshots/Logs:
[paste relevant output]
```
