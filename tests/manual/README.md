# Manual Tests

These tests require human interaction to verify Orchestra's interactive features work correctly.

## Overview

Manual tests are structured as markdown files with:
1. **Setup** - Steps Claude performs to prepare the test environment
2. **Steps** - Actions you perform in the UI
3. **Expected Results** - What you should observe
4. **Report** - Pass/Fail and any issues found

## Test List

| # | Test | Purpose |
|---|------|---------|
| 01 | [Session Creation](./01-session-creation.md) | Verify agent launches in tmux |
| 02 | [Ghostty Attach](./02-ghostty-attach.md) | Verify "Open in Ghostty" works |
| 03 | [Completion Detection](./03-completion-detection.md) | Verify UI updates on session complete |

## Running a Manual Test

1. Read the test file
2. Ask Claude to perform the **Setup** steps
3. Follow the **Steps** yourself
4. Check the **Expected Results**
5. Report back: Pass/Fail + any observations

## Prerequisites

- Orchestra app running (`npm run tauri:dev`)
- tmux installed (`brew install tmux` on macOS)
- Ghostty installed (for test 02)

## Test Scenarios

The `scenarios/` directory contains reusable node configurations:

- `simple-file-task.json` - Creates a test file (fast, simple validation)

These can be loaded into the UI to set up test conditions.
