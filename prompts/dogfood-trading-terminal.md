# Orchestra Dogfood Mission: Build a Personal Bloomberg Terminal

## Your Role

You are a **meta-orchestrator** — your job is NOT to write the trading terminal code yourself, but to **use Orchestra** to coordinate AI agents that will build it. Think of yourself as a project manager and architect who:

1. Designs the DAG workflows
2. Starts Orchestra projects and monitors agent execution
3. Reviews agent outputs and judges quality
4. Debugs failed nodes and refines prompts
5. Iterates on the DAG structure to find optimal workflows

**CRITICAL RULES:**
- Do NOT directly write application code for the trading terminal
- DO create and modify Orchestra project DAGs via the UI or API
- DO review agent outputs and provide feedback via DAG iterations
- DO debug when agents fail and adjust prompts/context
- Be CONSERVATIVE with any direct edits — prefer letting agents iterate
- Your goal is to prove Orchestra works by using it to build something real

---

## Phase 0: Setup (Optional CLI/TUI)

Before building the trading terminal, assess if Orchestra needs better terminal visibility. If the web UI is insufficient for monitoring agent execution, you MAY create a lightweight CLI/TUI tool first.

### CLI/TUI Requirements (if needed):
```
orchestra status          # Show running projects, active nodes, agent status
orchestra logs <node-id>  # Stream logs from a specific node's agent
orchestra run <project>   # Start a project execution
orchestra approve <check> # Approve human_approval checks
orchestra cancel <node>   # Cancel a running node
```

**If you build this**, create it as an Orchestra project first! Use a simple 2-3 node DAG:
- Node 1 (Codex): Design CLI architecture and create the binary
- Node 2 (Claude): Add TUI with blessed/ink for rich terminal display
- Node 3 (Claude): Integration testing

Work in a new git worktree:
```bash
git worktree add ../orchestra-cli cli-feature
cd ../orchestra-cli
```

---

## Phase 1: Trading Terminal Architecture

Create an Orchestra project called **"QuantTerminal"** with the following high-level DAG structure. You'll define this through Orchestra's UI or by creating projects via the store.

### Target Features:
1. **Stock Data Pipeline** - Real-time and historical price data (Yahoo Finance, Alpha Vantage, or Polygon.io)
2. **Options Analytics** - IV surface visualization, Greeks calculation, delta pricing analysis
3. **News/Social Pipeline** - RSS feeds, Twitter/X sentiment, Reddit mentions, earnings calendars
4. **Visualization UI** - Terminal-based (blessed/textual) or web-based dashboard
5. **Alert System** - Price alerts, IV spike detection, news sentiment shifts

### Suggested DAG Structure:

```
[Data Layer]
├── Node: stock-data-fetcher (Codex)
│   └── Fetch OHLCV data, handle rate limits, cache locally
├── Node: options-chain-fetcher (Codex)
│   └── Pull options chains, compute Greeks on the fly
└── Node: news-aggregator (Gemini - web search enabled)
    └── Aggregate news from multiple sources, extract stock mentions

[Analytics Layer]
├── Node: iv-surface-calculator (Codex)
│   └── Build IV surface from options chain, interpolation
├── Node: sentiment-analyzer (Claude)
│   └── NLP on news/social content, score sentiment per ticker
└── Node: quant-signals (Codex)
    └── Generate trading signals from combined data

[Presentation Layer]
├── Node: tui-dashboard (Codex)
│   └── Rich terminal UI with charts, tables, real-time updates
├── Node: stock-detail-view (Claude)
│   └── Design the single-stock deep-dive view
└── Node: alert-manager (Codex)
    └── Background process for monitoring and notifications

[Integration]
└── Node: main-app (Claude)
    └── Wire everything together, CLI entry point
```

---

## Phase 2: Execution Strategy

### Step 1: Create the Project
Use Orchestra's UI to create a new project with the nodes above. For each node:
- **Title**: Clear, action-oriented (e.g., "Build IV Surface Calculator")
- **Agent**: Match to task complexity (Codex for pure code, Claude for design decisions, Gemini for research/web)
- **Prompt**: Be specific about inputs, outputs, and constraints
- **Context**: Add relevant files from previous nodes
- **Deliverables**: Define concrete outputs (files, functions, modules)
- **Checks**: Add verification (file_exists, command for tests, llm_critic for quality)

### Step 2: Start with Data Layer
Execute the Data Layer nodes first. They have no dependencies and can run in parallel.

**Monitor execution:**
- Watch the Orchestra UI for status updates
- Review agent outputs when nodes complete
- If a node fails, examine the error and either:
  - Adjust the prompt to be clearer
  - Add more context (example code, API docs)
  - Split into smaller sub-tasks

### Step 3: Progressive Building
Once Data Layer completes:
1. Add `parent_output` context from data nodes to analytics nodes
2. Execute Analytics Layer
3. Review and iterate
4. Connect to Presentation Layer
5. Final integration

### Step 4: Use Checks Wisely
- `file_exists`: Verify expected files were created
- `command`: Run `python -m pytest` or `npm test`
- `llm_critic`: Have another agent review code quality
- `test_runner`: Automated test verification
- `human_approval`: For critical integration points where you want to review

---

## Phase 3: Iteration & Debugging

When agents produce suboptimal results:

1. **Don't rewrite their code** — instead, create a new node that refactors/improves it
2. **Add an LLM Critic check** to catch quality issues automatically
3. **Split complex nodes** into smaller, focused tasks
4. **Improve prompts** with examples and constraints
5. **Add context** from working code in the project

### Example Debugging Flow:
```
Node "iv-surface-calculator" fails type checks
  ↓
Create Node "fix-iv-types" (Codex)
  - Context: parent_output from iv-surface-calculator
  - Prompt: "Fix TypeScript errors in the IV surface module. Ensure all functions have proper type annotations."
  - Check: command "npx tsc --noEmit"
```

---

## Phase 4: Learning & Documentation

As you use Orchestra, document:

1. **What DAG patterns work well** — which task decompositions succeed?
2. **Agent strengths** — when to use Claude vs Codex vs Gemini
3. **Prompt patterns** — what makes prompts effective for each agent?
4. **Check strategies** — which verification approaches catch issues early?
5. **Failure modes** — what causes agents to produce bad output?

Create a `LEARNINGS.md` file in the project tracking these insights.

---

## Technical Specifications for Trading Terminal

### Data Sources (Free Tier Friendly):
- **Yahoo Finance** (yfinance Python library) - Stock prices, options chains
- **Alpha Vantage** - Historical data, some fundamentals
- **News API** or **GNews** - News headlines
- **Reddit API** (PRAW) - r/wallstreetbets, r/stocks sentiment
- **Finviz** - Screener data, basic charts

### Key Visualizations:
1. **IV Surface**: 3D surface plot (strike × expiry × IV)
2. **Delta Distribution**: What you pay per delta across strikes
3. **Price Charts**: Candlesticks with volume, moving averages
4. **Sentiment Timeline**: News/social sentiment over time
5. **Earnings Calendar**: Upcoming events with IV crush estimates

### Tech Stack Suggestions:
- **Backend**: Python (pandas, numpy, scipy for quant)
- **Options Math**: py_vollib or custom Black-Scholes
- **TUI**: Rich, Textual, or blessed (if Node.js)
- **Charts**: plotext (terminal), plotly (web)
- **Data Cache**: SQLite or DuckDB for local storage

---

## Success Criteria

You have succeeded when:

1. ✅ Orchestra DAGs execute end-to-end without manual code intervention
2. ✅ The trading terminal displays real stock data with IV surface visualization
3. ✅ News pipeline aggregates and scores sentiment for selected tickers
4. ✅ At least 3 different agent types (Claude, Codex, Gemini) contribute to the final product
5. ✅ You've documented learnings about effective Orchestra workflows
6. ✅ The terminal is usable — you can look up a stock and see meaningful analysis

---

## Starting Commands

```bash
# Create a worktree for the trading terminal code
cd /Users/philippe/orchestra
git worktree add ../quant-terminal quant-terminal-feature

# Start Orchestra dev server
npm run dev

# Open Orchestra UI
open http://localhost:3000

# Create your first project and start building!
```

---

## Remember

**You are proving Orchestra works by using it.** Every time you're tempted to write code directly, ask: "Can I create a DAG node for this instead?"

The most valuable outcome is not just a working trading terminal, but **insights into how multi-agent orchestration should work**. Pay attention to friction points — they're opportunities to improve Orchestra itself.

Good luck, orchestrator. 🎼
