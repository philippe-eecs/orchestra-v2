'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, FolderKanban, Bot, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useOrchestraStore, selectCurrentProject } from '@/lib/store';
import type { AppView } from '@/lib/types';

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const projects = useOrchestraStore((s) => s.projects);
  const currentProject = useOrchestraStore(selectCurrentProject);
  const agentLibrary = useOrchestraStore((s) => s.agentLibrary);
  const selectProject = useOrchestraStore((s) => s.selectProject);
  const selectNode = useOrchestraStore((s) => s.selectNode);
  const setView = useOrchestraStore((s) => s.setView);

  // Cmd+K to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const projectList = useMemo(() => Object.values(projects), [projects]);
  const agentList = useMemo(() => Object.values(agentLibrary), [agentLibrary]);
  const currentNodes = useMemo(
    () => currentProject?.nodes || [],
    [currentProject]
  );

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
    setView('canvas');
    setOpen(false);
  };

  const handleSelectNode = (nodeId: string) => {
    selectNode(nodeId);
    setView('canvas');
    setOpen(false);
  };

  const handleNavigate = (view: AppView) => {
    setView(view);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="w-4 h-4" />
        <span className="hidden md:inline text-xs">Search</span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search projects, nodes, agents..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Quick Navigation */}
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => handleNavigate('dashboard')}>
              <Workflow className="mr-2 h-4 w-4" />
              Dashboard
            </CommandItem>
            <CommandItem onSelect={() => handleNavigate('canvas')}>
              <Workflow className="mr-2 h-4 w-4" />
              Canvas
            </CommandItem>
            <CommandItem onSelect={() => handleNavigate('agents')}>
              <Bot className="mr-2 h-4 w-4" />
              Agents
            </CommandItem>
            <CommandItem onSelect={() => handleNavigate('runs')}>
              <Workflow className="mr-2 h-4 w-4" />
              Runs
            </CommandItem>
            <CommandItem onSelect={() => handleNavigate('settings')}>
              <Workflow className="mr-2 h-4 w-4" />
              Settings
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          {/* Projects */}
          {projectList.length > 0 && (
            <CommandGroup heading="Projects">
              {projectList.map((project) => (
                <CommandItem
                  key={project.id}
                  onSelect={() => handleSelectProject(project.id)}
                >
                  <FolderKanban className="mr-2 h-4 w-4" />
                  <span>{project.name}</span>
                  {project.description && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      {project.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Current project nodes */}
          {currentNodes.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Nodes in ${currentProject?.name}`}>
                {currentNodes.map((node) => (
                  <CommandItem
                    key={node.id}
                    onSelect={() => handleSelectNode(node.id)}
                  >
                    <Workflow className="mr-2 h-4 w-4" />
                    <span>{node.title}</span>
                    <span className="ml-2 text-muted-foreground text-xs capitalize">
                      {node.agent.type}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Agents */}
          <CommandSeparator />
          <CommandGroup heading="Agents">
            {agentList.map((agent) => (
              <CommandItem
                key={agent.id}
                onSelect={() => handleNavigate('agents')}
              >
                <Bot className="mr-2 h-4 w-4" />
                <span>{agent.name}</span>
                <span className="ml-2 text-muted-foreground text-xs">
                  {agent.kind}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
