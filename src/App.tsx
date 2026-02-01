import { useEffect } from 'react';
import { useOrchestraStore } from '@/lib/store';
import { TooltipProvider } from '@/components/ui/tooltip';
import Titlebar from '@/components/titlebar';
import TerminalModal from '@/components/terminal-modal';
import DashboardView from '@/components/views/dashboard-view';
import CanvasView from '@/components/views/canvas-view';
import AgentsView from '@/components/views/agents-view';
import RunsView from '@/components/views/runs-view';
import SettingsView from '@/components/views/settings-view';

function App() {
  const currentView = useOrchestraStore((s) => s.currentView);
  const terminalModalOpen = useOrchestraStore((s) => s.terminalModalOpen);
  const terminalSessionId = useOrchestraStore((s) => s.terminalSessionId);
  const closeTerminalModal = useOrchestraStore((s) => s.closeTerminalModal);
  const checkSystemStatus = useOrchestraStore((s) => s.checkSystemStatus);
  const initialize = useOrchestraStore((s) => s.initialize);

  // Initialize Tauri-specific features
  useEffect(() => {
    // Prevent default context menu in production
    if (import.meta.env.PROD) {
      document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Load persisted state from backend (Tauri only; no-ops in browser dev)
    initialize();

    // Check system status on startup
    checkSystemStatus();
  }, [checkSystemStatus, initialize]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'canvas':
        return <CanvasView />;
      case 'agents':
        return <AgentsView />;
      case 'runs':
        return <RunsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        {/* macOS-style Titlebar with navigation */}
        <Titlebar />

        {/* Main content area */}
        <main className="flex-1 flex min-h-0">
          {renderView()}
        </main>

        {/* Terminal Modal (global) */}
        <TerminalModal
          open={terminalModalOpen}
          onOpenChange={(open) => !open && closeTerminalModal()}
          sessionId={terminalSessionId}
        />
      </div>
    </TooltipProvider>
  );
}

export default App;
