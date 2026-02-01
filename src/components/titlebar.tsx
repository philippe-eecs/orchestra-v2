'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useOrchestraStore } from '@/lib/store';
import ProjectSelector from './project-selector';
import NavigationSegments from './navigation-segments';
import SystemStatus from './system-status';
import GlobalSearch from './global-search';

export default function Titlebar() {
  const setView = useOrchestraStore((s) => s.setView);
  const createProject = useOrchestraStore((s) => s.createProject);
  const selectProject = useOrchestraStore((s) => s.selectProject);

  const handleNewProject = async () => {
    const id = await createProject('New Project', '');
    selectProject(id);
    setView('canvas');
  };

  return (
    <div className="relative h-[52px] border-b bg-card/80 backdrop-blur-sm shrink-0">
      {/* Draggable background region (macOS titlebar overlay) */}
      <div
        data-tauri-drag-region
        className="absolute inset-0"
      />

      {/* Foreground controls */}
      <div className="h-full flex items-center pl-[70px] pr-4 pointer-events-none">
        {/* Project Selector */}
        <div className="flex items-center gap-3">
          <div className="pointer-events-auto" data-tauri-drag-region="false">
            <ProjectSelector />
          </div>
          <Separator orientation="vertical" className="h-6" />
        </div>

        {/* Navigation Segments - centered */}
        <div className="flex-1 flex justify-center">
          <div className="pointer-events-auto" data-tauri-drag-region="false">
            <NavigationSegments />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <div className="pointer-events-auto" data-tauri-drag-region="false">
            <SystemStatus />
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="pointer-events-auto" data-tauri-drag-region="false">
            <GlobalSearch />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 pointer-events-auto"
                onClick={handleNewProject}
                data-tauri-drag-region="false"
              >
                <Plus className="w-4 h-4" />
                New
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create new project (Cmd+N)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
