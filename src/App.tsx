import { useEffect } from 'react';
import CanvasView from './views/CanvasView';
import { useOrchestraStore } from '@/lib/store';
import { Button } from '@/components/ui/button';

export default function App() {
  const view = useOrchestraStore((s) => s.view);
  const setView = useOrchestraStore((s) => s.setView);
  const loadProjects = useOrchestraStore((s) => s.loadProjects);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <div className="h-full w-full">
      <div className="flex h-12 items-center gap-2 border-b border-border bg-card px-3">
        <div className="font-semibold">Orchestra</div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={view === 'canvas' ? 'default' : 'secondary'} onClick={() => setView('canvas')}>
            Canvas
          </Button>
          <Button size="sm" variant={view === 'runs' ? 'default' : 'secondary'} onClick={() => setView('runs')}>
            Runs
          </Button>
        </div>
      </div>

      <div className="h-[calc(100%-3rem)]">
        {view === 'canvas' ? <CanvasView /> : <div className="p-4 text-muted-foreground">Runs view (Phase 3).</div>}
      </div>
    </div>
  );
}

