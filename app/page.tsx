'use client';

import { useEffect, useRef } from 'react';
import Header from '@/components/header';
import Sidebar from '@/components/sidebar';
import WorkflowCanvas from '@/components/workflow-canvas';
import NodePanel from '@/components/node-panel';
import AgentHub from '@/components/agent-hub';
import { useOrchestraStore } from '@/lib/store';

function initializeDemoData() {
  const store = useOrchestraStore.getState();

  // Skip if already initialized
  if (Object.keys(store.projects).length > 0) {
    return;
  }

  // ========== Create Demo Project (Deep Research) ==========

  const researchProjectId = store.createProject(
    'Research Quantum Computing Startups',
    'Investment research workflow for identifying promising quantum computing startups',
    '/projects/quantum-research'
  );

  // Add project-level resources
  store.addProjectResource(researchProjectId, {
    type: 'file',
    path: 'criteria.md',
    name: 'Investment Criteria',
  });
  store.addProjectResource(researchProjectId, {
    type: 'url',
    url: 'https://drive.google.com/quantum-portfolio',
    name: 'Portfolio Document',
  });
  store.setProjectNotes(
    researchProjectId,
    'Focus on Series A/B companies with strong technical teams. Prioritize companies with quantum error correction research.'
  );

  // Node 1: Break Down Query
  const queryNodeId = store.addNode(researchProjectId, {
    title: 'Break Down Query',
    description: 'Decompose research request into specific search queries',
    position: { x: 100, y: 100 },
    prompt: `Read criteria.md for investment focus.
Break this research request into 3-5 specific search queries.
Write queries to queries.md`,
    agent: { type: 'claude' },
    context: [{ type: 'file', path: 'criteria.md' }],
    deliverables: [],
    checks: [],
  });

  // Add deliverable and check to query node
  const queriesDeliverableId = store.addNodeDeliverable(researchProjectId, queryNodeId, {
    type: 'file',
    path: 'queries.md',
  });
  store.addNodeCheck(researchProjectId, queryNodeId, {
    type: 'file_exists',
    path: 'queries.md',
  });

  // Node 2: Search Web
  const searchNodeId = store.addNode(researchProjectId, {
    title: 'Search Web',
    description: 'Execute web searches using Gemini',
    position: { x: 400, y: 100 },
    prompt: `Read queries.md for the search queries.
Search the web for each query.
Write findings to search-results.md`,
    agent: { type: 'gemini', model: 'gemini-3-pro-preview' },
    context: [{ type: 'parent_output', nodeId: queryNodeId }],
    deliverables: [],
    checks: [],
  });

  const searchDeliverableId = store.addNodeDeliverable(researchProjectId, searchNodeId, {
    type: 'file',
    path: 'search-results.md',
  });
  store.addNodeCheck(researchProjectId, searchNodeId, {
    type: 'file_exists',
    path: 'search-results.md',
  });
  store.addNodeCheck(researchProjectId, searchNodeId, {
    type: 'contains',
    path: 'search-results.md',
    pattern: 'Source:',
  });

  // Node 3: Analyze Sources
  const analyzeNodeId = store.addNode(researchProjectId, {
    title: 'Analyze Sources',
    description: 'Evaluate sources for relevance and credibility',
    position: { x: 700, y: 100 },
    prompt: `Read search-results.md and criteria.md.
Evaluate sources for relevance and credibility.
Identify gaps. Write analysis to analysis.md`,
    agent: { type: 'claude' },
    context: [
      { type: 'parent_output', nodeId: searchNodeId },
      { type: 'file', path: 'criteria.md' },
    ],
    deliverables: [],
    checks: [],
  });

  const analysisDeliverableId = store.addNodeDeliverable(researchProjectId, analyzeNodeId, {
    type: 'file',
    path: 'analysis.md',
  });
  store.addNodeCheck(researchProjectId, analyzeNodeId, {
    type: 'file_exists',
    path: 'analysis.md',
  });
  store.addNodeCheck(researchProjectId, analyzeNodeId, {
    type: 'human_approval',
  });

  // Node 4: Write Report
  const reportNodeId = store.addNode(researchProjectId, {
    title: 'Write Report',
    description: 'Compile comprehensive investment research report',
    position: { x: 1000, y: 100 },
    prompt: `Read queries.md, analysis.md, and criteria.md.
Write a comprehensive investment research report to report.md`,
    agent: { type: 'claude' },
    context: [
      { type: 'parent_output', nodeId: queryNodeId },
      { type: 'parent_output', nodeId: analyzeNodeId },
      { type: 'file', path: 'criteria.md' },
    ],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(researchProjectId, reportNodeId, {
    type: 'file',
    path: 'report.md',
  });
  store.addNodeCheck(researchProjectId, reportNodeId, {
    type: 'file_exists',
    path: 'report.md',
  });
  store.addNodeCheck(researchProjectId, reportNodeId, {
    type: 'command',
    cmd: "wc -w report.md | awk '$1 > 500'",
    autoRetry: true,
    maxRetries: 2,
  });

  // Add edges
  store.addEdge(researchProjectId, {
    sourceId: queryNodeId,
    targetId: searchNodeId,
    sourceDeliverable: queriesDeliverableId,
  });
  store.addEdge(researchProjectId, {
    sourceId: searchNodeId,
    targetId: analyzeNodeId,
    sourceDeliverable: searchDeliverableId,
  });
  store.addEdge(researchProjectId, {
    sourceId: queryNodeId,
    targetId: reportNodeId,
  });
  store.addEdge(researchProjectId, {
    sourceId: analyzeNodeId,
    targetId: reportNodeId,
    sourceDeliverable: analysisDeliverableId,
  });

  // ========== Create Finance Dashboard Project ==========

  const financeProjectId = store.createProject(
    'Finance Dashboard',
    'Stock charts, order book, options chain, and news feed dashboard built with Orchestra',
    '/root/worktrees/finance-dashboard'
  );

  // Project-level notes
  store.setProjectNotes(
    financeProjectId,
    `Financial Dashboard Dogfooding Project

Tech Stack:
- Next.js 14 + TypeScript + Tailwind CSS
- lightweight-charts for candlestick/line charts
- WebSocket for real-time order book (Binance)
- Mock data for options chain

Data Sources:
- Stock prices: Alpha Vantage (free tier: 5 calls/min)
- Order book: Binance WebSocket (BTC/USDT)
- Options chain: Mock data (real APIs are paid)
- News: NewsAPI.org (free tier: 100 requests/day)`
  );

  // Node 1: Project Scaffolding (Codex)
  const scaffoldNodeId = store.addNode(financeProjectId, {
    title: 'Project Scaffolding',
    description: 'Create Next.js 14 + TypeScript + Tailwind project structure',
    position: { x: 100, y: 200 },
    prompt: `Create a new Next.js 14 project with TypeScript and Tailwind CSS.

Project location: /root/worktrees/finance-dashboard

Commands to run:
1. mkdir -p /root/worktrees/finance-dashboard
2. cd /root/worktrees/finance-dashboard
3. npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm

After scaffolding:
- Install dependencies: npm install lightweight-charts react-resizable-panels lucide-react date-fns
- Install dev dependencies: npm install -D @types/node
- Verify build works: npm run build

Create a basic folder structure:
- src/components/ (for UI components)
- src/lib/services/ (for API services)
- src/lib/hooks/ (for custom hooks)
- src/lib/types/ (for TypeScript types)`,
    agent: { type: 'codex', reasoningEffort: 'high' },
    context: [],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, scaffoldNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/package.json',
  });
  store.addNodeCheck(financeProjectId, scaffoldNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/package.json',
    autoRetry: true,
    maxRetries: 2,
  });
  store.addNodeCheck(financeProjectId, scaffoldNodeId, {
    type: 'command',
    cmd: 'cd /root/worktrees/finance-dashboard && npm run build',
    autoRetry: true,
    maxRetries: 2,
  });

  // Node 2: API Research (Gemini)
  const apiResearchNodeId = store.addNode(financeProjectId, {
    title: 'API Research',
    description: 'Research free financial APIs for stocks, options, and news',
    position: { x: 100, y: 400 },
    prompt: `Research free financial data APIs and document them.

Search for and document:
1. **Stock Price APIs** (Alpha Vantage, Yahoo Finance, Finnhub)
   - Free tier limits
   - Endpoints for historical and real-time data
   - Example API calls

2. **Order Book/Market Depth** (Binance, Kraken)
   - WebSocket endpoints for order book
   - Data format and update frequency
   - Connection examples

3. **Options Chain Data** (real APIs are expensive, document this)
   - Available free options
   - Mock data structure for Greeks display

4. **News APIs** (NewsAPI.org, Finnhub News)
   - Financial news endpoints
   - Sentiment analysis availability
   - Rate limits

Write comprehensive documentation to: /root/worktrees/finance-dashboard/docs/API_RESEARCH.md

Include:
- API endpoints with examples
- Rate limits and pricing tiers
- Code snippets for TypeScript/Node.js
- Recommended APIs for this project`,
    agent: { type: 'gemini', model: 'gemini-3-pro-preview' },
    context: [{ type: 'parent_output', nodeId: scaffoldNodeId }],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, apiResearchNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/docs/API_RESEARCH.md',
  });
  store.addNodeCheck(financeProjectId, apiResearchNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/docs/API_RESEARCH.md',
  });
  store.addNodeCheck(financeProjectId, apiResearchNodeId, {
    type: 'contains',
    path: '/root/worktrees/finance-dashboard/docs/API_RESEARCH.md',
    pattern: 'Alpha Vantage',
  });

  // Node 3: Data Services Layer (Codex)
  const dataServicesNodeId = store.addNode(financeProjectId, {
    title: 'Data Services',
    description: 'Create TypeScript services for all financial APIs',
    position: { x: 100, y: 600 },
    prompt: `Create TypeScript services for fetching financial data.

Read the API research documentation first for endpoint details.

Create the following service files in /root/worktrees/finance-dashboard/src/lib/services/:

1. **stock-service.ts**
   - fetchStockQuote(symbol: string): Promise<StockQuote>
   - fetchHistoricalData(symbol: string, interval: string): Promise<OHLC[]>
   - Use Alpha Vantage free API
   - Include proper error handling and rate limiting

2. **orderbook-service.ts**
   - connectOrderBook(symbol: string): WebSocket connection
   - parseOrderBookMessage(data: any): OrderBook
   - Use Binance WebSocket for BTC/USDT
   - Handle reconnection logic

3. **options-service.ts**
   - fetchOptionsChain(symbol: string): Promise<OptionsChain>
   - calculateGreeks(option: Option): Greeks
   - Use mock data with realistic structure
   - Include expiration dates, strikes, calls/puts

4. **news-service.ts**
   - fetchFinancialNews(query?: string): Promise<NewsItem[]>
   - Use NewsAPI.org or mock data
   - Include sentiment scoring logic

5. **types.ts**
   - Define all TypeScript interfaces (StockQuote, OHLC, OrderBook, Option, Greeks, NewsItem)

Also create /root/worktrees/finance-dashboard/src/lib/hooks/:
- useStockData.ts
- useOrderBook.ts
- useOptionsChain.ts
- useNews.ts`,
    agent: { type: 'codex', reasoningEffort: 'high' },
    context: [
      { type: 'parent_output', nodeId: apiResearchNodeId },
      { type: 'file', path: '/root/worktrees/finance-dashboard/docs/API_RESEARCH.md' },
    ],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, dataServicesNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/lib/services/stock-service.ts',
  });
  store.addNodeDeliverable(financeProjectId, dataServicesNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/lib/services/orderbook-service.ts',
  });
  store.addNodeCheck(financeProjectId, dataServicesNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/src/lib/services/stock-service.ts',
  });
  store.addNodeCheck(financeProjectId, dataServicesNodeId, {
    type: 'command',
    cmd: 'cd /root/worktrees/finance-dashboard && npx tsc --noEmit',
    autoRetry: true,
    maxRetries: 2,
  });

  // Node 4: Stock Chart Component (Codex) - PARALLEL
  const stockChartNodeId = store.addNode(financeProjectId, {
    title: 'Stock Chart',
    description: 'Build interactive candlestick/line chart using lightweight-charts',
    position: { x: 400, y: 500 },
    prompt: `Create a stock chart component using lightweight-charts library.

Location: /root/worktrees/finance-dashboard/src/components/charts/

Create StockChart.tsx:
- Use lightweight-charts for rendering
- Support candlestick, line, and area chart types
- Add chart controls (timeframe selector: 1D, 1W, 1M, 3M, 1Y)
- Include volume bars below price chart
- Add crosshair with price/time tooltip
- Responsive sizing with container
- Dark theme styling

Create ChartControls.tsx:
- Symbol input/search
- Timeframe buttons
- Chart type toggle

The component should:
- Accept symbol prop
- Use useStockData hook for data fetching
- Handle loading and error states
- Support real-time updates

Export from /root/worktrees/finance-dashboard/src/components/charts/index.ts`,
    agent: { type: 'codex', reasoningEffort: 'high' },
    context: [{ type: 'parent_output', nodeId: dataServicesNodeId }],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, stockChartNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/components/charts/StockChart.tsx',
  });
  store.addNodeCheck(financeProjectId, stockChartNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/src/components/charts/StockChart.tsx',
  });

  // Node 5: Order Book Component (Codex) - PARALLEL
  const orderBookNodeId = store.addNode(financeProjectId, {
    title: 'Order Book',
    description: 'Build real-time order book with depth chart',
    position: { x: 400, y: 700 },
    prompt: `Create an order book component with real-time WebSocket updates.

Location: /root/worktrees/finance-dashboard/src/components/orderbook/

Create OrderBook.tsx:
- Display bid/ask price levels in two columns
- Color code: green for bids, red for asks
- Show quantity and cumulative volume
- Highlight spread
- Real-time updates via WebSocket (Binance)
- Limit to top 15 levels each side

Create DepthChart.tsx:
- Area chart showing order book depth
- Bid side (green) on left, ask side (red) on right
- X-axis: price, Y-axis: cumulative volume
- Interactive hover to show price/volume

Create OrderBookRow.tsx:
- Individual row component for order book
- Flash animation on price changes
- Size bar visualization

The components should:
- Use useOrderBook hook
- Handle WebSocket connection/reconnection
- Show connection status indicator
- Support BTC/USDT trading pair

Export from /root/worktrees/finance-dashboard/src/components/orderbook/index.ts`,
    agent: { type: 'codex', reasoningEffort: 'high' },
    context: [{ type: 'parent_output', nodeId: dataServicesNodeId }],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, orderBookNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/components/orderbook/OrderBook.tsx',
  });
  store.addNodeCheck(financeProjectId, orderBookNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/src/components/orderbook/OrderBook.tsx',
  });

  // Node 6: Options Chain Component (Codex) - PARALLEL
  const optionsChainNodeId = store.addNode(financeProjectId, {
    title: 'Options Chain',
    description: 'Build options chain display with Greeks',
    position: { x: 400, y: 900 },
    prompt: `Create an options chain component displaying calls/puts with Greeks.

Location: /root/worktrees/finance-dashboard/src/components/options/

Create OptionsChain.tsx:
- Table layout with strike price as center column
- Calls on left, puts on right (traditional layout)
- Display columns: Bid, Ask, Last, Volume, OI, Delta, Gamma, Theta, Vega
- Expiration date selector tabs
- Highlight ITM vs OTM options
- Show current stock price line

Create OptionsRow.tsx:
- Row component for single strike
- Call side and put side
- Monospace font for numbers
- Color coding for ITM/ATM/OTM

Create ExpirationSelector.tsx:
- Horizontal tabs for expiration dates
- Show days to expiration
- Highlight weekly vs monthly

Create GreeksTooltip.tsx:
- Popup showing detailed Greeks explanation
- Option pricing model info

The components should:
- Use useOptionsChain hook
- Support filtering by moneyness
- Handle mock data gracefully
- Show "Demo Mode" indicator

Export from /root/worktrees/finance-dashboard/src/components/options/index.ts`,
    agent: { type: 'codex', reasoningEffort: 'high' },
    context: [{ type: 'parent_output', nodeId: dataServicesNodeId }],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, optionsChainNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/components/options/OptionsChain.tsx',
  });
  store.addNodeCheck(financeProjectId, optionsChainNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/src/components/options/OptionsChain.tsx',
  });

  // Node 7: News Feed Component (Codex)
  const newsFeedNodeId = store.addNode(financeProjectId, {
    title: 'News Feed',
    description: 'Build news aggregator with sentiment badges',
    position: { x: 700, y: 700 },
    prompt: `Create a financial news feed component with sentiment analysis.

Location: /root/worktrees/finance-dashboard/src/components/news/

Create NewsFeed.tsx:
- Scrollable list of news articles
- Filter by symbol/topic
- Auto-refresh with "New articles" button
- Infinite scroll or pagination

Create NewsCard.tsx:
- Article title (linked to source)
- Source and timestamp
- Brief summary/description
- Sentiment badge (Bullish/Bearish/Neutral)
- Related symbols/tickers
- Thumbnail image if available

Create SentimentBadge.tsx:
- Color-coded badge component
- Green: Bullish, Red: Bearish, Gray: Neutral
- Optional confidence score

Create NewsFilter.tsx:
- Symbol/ticker search
- Category filter (earnings, M&A, macro, etc.)
- Date range selector

The components should:
- Use useNews hook
- Handle loading skeletons
- Support click-to-expand for full article
- Show "Demo Mode" when using mock data

Export from /root/worktrees/finance-dashboard/src/components/news/index.ts`,
    agent: { type: 'codex', reasoningEffort: 'medium' },
    context: [
      { type: 'parent_output', nodeId: stockChartNodeId },
      { type: 'parent_output', nodeId: orderBookNodeId },
      { type: 'parent_output', nodeId: optionsChainNodeId },
    ],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, newsFeedNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/components/news/NewsFeed.tsx',
  });
  store.addNodeCheck(financeProjectId, newsFeedNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/src/components/news/NewsFeed.tsx',
  });

  // Node 8: Dashboard Layout (Codex)
  const dashboardLayoutNodeId = store.addNode(financeProjectId, {
    title: 'Dashboard Layout',
    description: 'Integrate all components with resizable panels',
    position: { x: 1000, y: 600 },
    prompt: `Create the main dashboard layout integrating all components.

Location: /root/worktrees/finance-dashboard/src/app/

Update page.tsx:
- Use react-resizable-panels for layout
- Four main sections: Stock Chart (top-left), Order Book (top-right), Options Chain (bottom-left), News Feed (bottom-right)
- Collapsible panels
- Responsive: stack vertically on mobile

Create components/layout/DashboardHeader.tsx:
- App title/logo
- Global symbol selector
- Theme toggle (dark/light)
- Settings menu

Create components/layout/DashboardPanel.tsx:
- Wrapper component for each panel
- Panel title header
- Collapse/expand button
- Drag handle for resizing

Update layout structure:
- src/app/layout.tsx: Add providers, global styles
- src/app/page.tsx: Main dashboard with all 4 panels

The layout should:
- Default to 50/50 split for both rows
- Remember panel sizes in localStorage
- Support keyboard navigation between panels
- Handle component loading states

Include a global state provider for:
- Selected symbol
- Theme preference
- Panel visibility`,
    agent: { type: 'codex', reasoningEffort: 'high' },
    context: [{ type: 'parent_output', nodeId: newsFeedNodeId }],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, dashboardLayoutNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/app/page.tsx',
  });
  store.addNodeCheck(financeProjectId, dashboardLayoutNodeId, {
    type: 'file_exists',
    path: '/root/worktrees/finance-dashboard/src/app/page.tsx',
  });
  store.addNodeCheck(financeProjectId, dashboardLayoutNodeId, {
    type: 'command',
    cmd: 'cd /root/worktrees/finance-dashboard && npm run build',
    autoRetry: true,
    maxRetries: 2,
  });

  // Node 9: Styling & UX Polish (Claude)
  const stylingNodeId = store.addNode(financeProjectId, {
    title: 'Styling & UX',
    description: 'Professional dark theme, keyboard nav, accessibility',
    position: { x: 1300, y: 600 },
    prompt: `Polish the dashboard with professional styling and UX improvements.

Review and enhance:

1. **Dark Theme** (primary)
   - Consistent color palette across all components
   - Use CSS variables for theming
   - Proper contrast ratios for accessibility
   - Subtle gradients and shadows
   - Colors: slate-900 backgrounds, emerald for positive, rose for negative

2. **Typography**
   - Monospace for numbers (tabular-nums)
   - Clear hierarchy (headings, body, captions)
   - Proper font sizes for data density

3. **Animations**
   - Subtle transitions on hover/focus
   - Price change flash animations
   - Smooth panel resize
   - Loading skeletons instead of spinners

4. **Accessibility**
   - Proper focus indicators
   - ARIA labels for interactive elements
   - Keyboard navigation (Tab, Arrow keys)
   - Screen reader friendly tables

5. **Responsive Design**
   - Mobile-friendly collapsed view
   - Touch-friendly controls
   - Proper breakpoints

Update files:
- src/app/globals.css: Theme variables, utilities
- Individual component styles
- Add focus-visible styles
- Ensure color contrast meets WCAG AA

Test the styling:
- Run npm run dev
- Check all components render correctly
- Verify dark theme looks professional`,
    agent: { type: 'claude' },
    context: [{ type: 'parent_output', nodeId: dashboardLayoutNodeId }],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, stylingNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/src/app/globals.css',
  });
  store.addNodeCheck(financeProjectId, stylingNodeId, {
    type: 'command',
    cmd: 'cd /root/worktrees/finance-dashboard && npm run build',
  });

  // Node 10: Integration Test (Claude + Human Approval)
  const integrationTestNodeId = store.addNode(financeProjectId, {
    title: 'Integration Test',
    description: 'Verify build, create mock data, test all features',
    position: { x: 1600, y: 600 },
    prompt: `Final integration testing and verification.

Verification checklist:

1. **Build Verification**
   - Run: npm run build
   - Run: npm run lint
   - Fix any build errors or warnings

2. **Mock Data Setup**
   - Ensure all services fall back to mock data gracefully
   - Create src/lib/mock-data/ with realistic sample data
   - Add demo mode toggle in UI

3. **Feature Testing**
   - Stock Chart: Loads with sample data, chart type switching works
   - Order Book: Shows mock order book, updates simulate correctly
   - Options Chain: Displays options grid with Greeks
   - News Feed: Shows mock news articles with sentiment

4. **Cross-browser/Device Testing**
   - Test in Chrome, Firefox, Safari
   - Test responsive layout on mobile viewport

5. **Performance Check**
   - No obvious performance issues
   - WebSocket reconnection works
   - Memory leaks check (dev tools)

6. **Documentation**
   - Create README.md with:
     - Project overview
     - Setup instructions
     - API key configuration
     - Architecture overview

Report any issues found and fixes applied.
The dashboard should be fully functional in demo mode without real API keys.`,
    agent: { type: 'claude' },
    context: [{ type: 'parent_output', nodeId: stylingNodeId }],
    deliverables: [],
    checks: [],
  });

  store.addNodeDeliverable(financeProjectId, integrationTestNodeId, {
    type: 'file',
    path: '/root/worktrees/finance-dashboard/README.md',
  });
  store.addNodeCheck(financeProjectId, integrationTestNodeId, {
    type: 'command',
    cmd: 'cd /root/worktrees/finance-dashboard && npm run build',
  });
  store.addNodeCheck(financeProjectId, integrationTestNodeId, {
    type: 'human_approval',
  });

  // ========== Add Edges for Finance Dashboard ==========

  // Linear flow: Scaffold -> API Research -> Data Services
  store.addEdge(financeProjectId, {
    sourceId: scaffoldNodeId,
    targetId: apiResearchNodeId,
  });
  store.addEdge(financeProjectId, {
    sourceId: apiResearchNodeId,
    targetId: dataServicesNodeId,
  });

  // Parallel: Data Services -> Stock Chart, Order Book, Options Chain
  store.addEdge(financeProjectId, {
    sourceId: dataServicesNodeId,
    targetId: stockChartNodeId,
  });
  store.addEdge(financeProjectId, {
    sourceId: dataServicesNodeId,
    targetId: orderBookNodeId,
  });
  store.addEdge(financeProjectId, {
    sourceId: dataServicesNodeId,
    targetId: optionsChainNodeId,
  });

  // Converge: All three UI components -> News Feed
  store.addEdge(financeProjectId, {
    sourceId: stockChartNodeId,
    targetId: newsFeedNodeId,
  });
  store.addEdge(financeProjectId, {
    sourceId: orderBookNodeId,
    targetId: newsFeedNodeId,
  });
  store.addEdge(financeProjectId, {
    sourceId: optionsChainNodeId,
    targetId: newsFeedNodeId,
  });

  // Linear flow: News Feed -> Dashboard Layout -> Styling -> Integration Test
  store.addEdge(financeProjectId, {
    sourceId: newsFeedNodeId,
    targetId: dashboardLayoutNodeId,
  });
  store.addEdge(financeProjectId, {
    sourceId: dashboardLayoutNodeId,
    targetId: stylingNodeId,
  });
  store.addEdge(financeProjectId, {
    sourceId: stylingNodeId,
    targetId: integrationTestNodeId,
  });

  // Select the Finance Dashboard project (it's our focus)
  store.selectProject(financeProjectId);
}

export default function Home() {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initializeDemoData();
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <WorkflowCanvas />
            <NodePanel />
          </div>

          <AgentHub />
        </div>
      </div>
    </div>
  );
}
