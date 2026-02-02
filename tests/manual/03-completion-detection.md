# Test 03: Completion Detection

**Purpose**: Verify that the UI updates when an agent session completes, and that checks are validated.

## Setup (Claude does this)

1. Create test directory:
```bash
mkdir -p /tmp/orchestra-test-03
```

2. Prepare a node configuration with checks:
```json
{
  "label": "Create Config File",
  "prompt": "Create a file called config.json with this exact content: {\"version\": \"1.0.0\", \"enabled\": true}",
  "agent": "claude",
  "model": "sonnet",
  "checks": [
    {
      "type": "file_exists",
      "path": "config.json"
    },
    {
      "type": "contains",
      "path": "config.json",
      "text": "\"version\": \"1.0.0\""
    }
  ]
}
```

## Steps (You do this)

1. Open Orchestra app
2. Create/open a project with location `/tmp/orchestra-test-03`
3. Add an agent node with:
   - Prompt: `Create a file called config.json with this exact content: {"version": "1.0.0", "enabled": true}`
   - Add checks (if UI supports it):
     - file_exists: `config.json`
     - contains: `config.json` contains `"version": "1.0.0"`
4. Start the interactive session
5. Watch the node as the agent completes
6. Wait for the agent to finish (or type `/exit` if Claude prompts)

## Verification

### During Execution
```bash
# Watch the session (in separate terminal)
tmux attach -t <session-id>

# Watch for exit file creation
watch -n 1 'ls -la /tmp/orchestra-test-03/.orchestra-exit.json 2>/dev/null || echo "Not yet"'
```

### After Completion
```bash
# Check output file exists
cat /tmp/orchestra-test-03/config.json

# Check exit file
cat /tmp/orchestra-test-03/.orchestra-exit.json

# Verify content
jq . /tmp/orchestra-test-03/config.json
```

## Expected Results

### UI Updates
- [ ] Node shows "running" state when session starts (visual indicator)
- [ ] Node shows "complete" state after agent finishes
- [ ] Check results are displayed (if UI shows them)
- [ ] Any errors are surfaced clearly

### File State
- [ ] `config.json` exists with correct content
- [ ] `.orchestra-exit.json` exists with exit code

### Check Validation
- [ ] file_exists check passes (config.json created)
- [ ] contains check passes (version string present)
- [ ] Overall node marked as successful

## Timing Observations

Record approximate times:
- Session start to agent active: ___ seconds
- Agent active to task complete: ___ seconds
- Task complete to UI update: ___ seconds

## Common Issues

### UI doesn't update
- **Check**: Is there a polling mechanism for completion?
- **Check**: Does the exit file get created?
- **Check**: Tauri console for errors

### Checks show as failed
- **Check**: Does the file content match exactly?
- **Check**: Are paths relative to project root?
- **Check**: Any encoding issues (BOM, line endings)?

### Exit file not created
- **Check**: Agent might still be running
- **Check**: Agent might have crashed - check tmux output
- **Check**: Exit file path might be wrong

## Test Variations

### Fast Completion
Use a simple task that completes quickly:
```
Prompt: "Run the command: echo 'done' > status.txt"
```

### Intentional Failure
Test that failures are detected:
```
Prompt: "Create a file at /root/forbidden.txt"  # Should fail due to permissions
```

### Check Failure
Test check validation with incorrect output:
```
Prompt: "Create config.json with {\"version\": \"2.0.0\"}"
Check: contains "1.0.0"  # Should fail
```

## Report Template

```
## Test 03 Results
Date: YYYY-MM-DD
Tester: [name]

### Status: PASS / FAIL

### UI Behavior:
- Running state visible: YES / NO
- Completion detected: YES / NO
- Checks displayed: YES / NO / N/A

### Timing:
- Start → Active: ___s
- Active → Complete: ___s
- Complete → UI Update: ___s

### Check Results:
- file_exists: PASS / FAIL
- contains: PASS / FAIL

### Issues Found:
-

### Console Errors:
[paste any errors]
```
