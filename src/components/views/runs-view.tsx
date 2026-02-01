'use client';

import { useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrchestraStore } from '@/lib/store';
import RunCard from '@/components/run-card';

export default function RunsView() {
  const runHistory = useOrchestraStore((s) => s.runHistory);
  const setView = useOrchestraStore((s) => s.setView);
  const selectProject = useOrchestraStore((s) => s.selectProject);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const completedRuns = useMemo(
    () => runHistory.filter((r) => r.status === 'completed'),
    [runHistory]
  );

  const failedRuns = useMemo(
    () => runHistory.filter((r) => r.status === 'failed'),
    [runHistory]
  );

  const runningRuns = useMemo(
    () => runHistory.filter((r) => r.status === 'running'),
    [runHistory]
  );

  const filteredRuns = useMemo(() => {
    let list = runHistory;
    if (activeTab === 'running') list = runningRuns;
    if (activeTab === 'completed') list = completedRuns;
    if (activeTab === 'failed') list = failedRuns;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter((r) => r.projectName.toLowerCase().includes(query));
    }

    return list;
  }, [runHistory, runningRuns, completedRuns, failedRuns, activeTab, searchQuery]);

  const handleViewProject = (projectId: string) => {
    selectProject(projectId);
    setView('canvas');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Run History</h1>
            <p className="text-muted-foreground">
              View and manage your workflow executions
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Running</span>
              <span className="ml-auto font-bold">{runningRuns.length}</span>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Completed</span>
              <span className="ml-auto font-bold">{completedRuns.length}</span>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Failed</span>
              <span className="ml-auto font-bold">{failedRuns.length}</span>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="ml-auto font-bold">{runHistory.length}</span>
            </div>
          </Card>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search runs..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="running" className="gap-1.5">
                <Zap className="w-3 h-3" />
                Running
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-1.5">
                <CheckCircle2 className="w-3 h-3" />
                Completed
              </TabsTrigger>
              <TabsTrigger value="failed" className="gap-1.5">
                <XCircle className="w-3 h-3" />
                Failed
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Run List */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {filteredRuns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No runs found</p>
              <p className="text-sm">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Run a project to see execution history'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRuns.map((run) => (
                <RunCard
                  key={run.id}
                  run={run}
                  onViewProject={() => handleViewProject(run.projectId)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
