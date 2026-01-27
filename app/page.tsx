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
    agent: { type: 'gemini', model: 'gemini-3-pro' },
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

  // Select the project
  store.selectProject(researchProjectId);
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
