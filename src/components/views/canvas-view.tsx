'use client';

import { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import WorkflowCanvas from '@/components/workflow-canvas';
import NodePanel from '@/components/node-panel';
import AgentHub from '@/components/agent-hub';
import { useOrchestraStore, selectCurrentProject } from '@/lib/store';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

export default function CanvasView() {
  const currentProject = useOrchestraStore(selectCurrentProject);
  const selectedNodeId = useOrchestraStore((s) => s.selectedNodeId);
  const agentHubMinimized = useOrchestraStore((s) => s.agentHubMinimized);

  const [nodePanelFullscreen, setNodePanelFullscreen] = useState(false);
  const toggleNodePanelFullscreen = useCallback(() => {
    setNodePanelFullscreen((prev) => !prev);
  }, []);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Project Selected</h2>
          <p className="text-sm">
            Select a project from the dropdown or create a new one to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel
          defaultSize={selectedNodeId ? 65 : 100}
          minSize={30}
        >
          <ReactFlowProvider>
            <WorkflowCanvas />
          </ReactFlowProvider>
        </ResizablePanel>

        {selectedNodeId && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={35} minSize={25} maxSize={60}>
              <NodePanel
                fullscreen={nodePanelFullscreen}
                onToggleFullscreen={toggleNodePanelFullscreen}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {!agentHubMinimized && <AgentHub />}
    </div>
  );
}
