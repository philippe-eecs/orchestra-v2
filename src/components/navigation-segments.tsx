'use client';

import { useEffect } from 'react';
import {
  LayoutDashboard,
  Workflow,
  Bot,
  History,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrchestraStore } from '@/lib/store';
import type { AppView } from '@/lib/types';

interface NavItem {
  id: AppView;
  label: string;
  icon: React.ElementType;
  shortcut: string;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: '1' },
  { id: 'canvas', label: 'Canvas', icon: Workflow, shortcut: '2' },
  { id: 'agents', label: 'Agents', icon: Bot, shortcut: '3' },
  { id: 'runs', label: 'Runs', icon: History, shortcut: '4' },
  { id: 'settings', label: 'Settings', icon: Settings, shortcut: '5' },
];

export default function NavigationSegments() {
  const currentView = useOrchestraStore((s) => s.currentView);
  const setView = useOrchestraStore((s) => s.setView);

  // Keyboard shortcuts (Cmd+1 through Cmd+5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const item = navItems.find((item) => item.shortcut === e.key);
        if (item) {
          e.preventDefault();
          setView(item.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView]);

  return (
    <div className="flex items-center bg-muted/50 rounded-lg p-1 gap-0.5">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              'hover:bg-background/60',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
