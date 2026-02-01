'use client';

import { useMemo } from 'react';
import {
  Play,
  FolderKanban,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOrchestraStore, selectCurrentProject, selectRunningSessions } from '@/lib/store';
import { runProject } from '@/lib/execution';
import RecentProjects from '@/components/recent-projects';

export default function DashboardView() {
  const projects = useOrchestraStore((s) => s.projects);
  const currentProject = useOrchestraStore(selectCurrentProject);
  const runningSessions = useOrchestraStore(selectRunningSessions);
  const runHistory = useOrchestraStore((s) => s.runHistory);
  const setView = useOrchestraStore((s) => s.setView);

  const projectList = useMemo(() => Object.values(projects), [projects]);
  const recentRuns = useMemo(() => runHistory.slice(0, 5), [runHistory]);

  const stats = useMemo(() => {
    const completed = runHistory.filter((r) => r.status === 'completed').length;
    const failed = runHistory.filter((r) => r.status === 'failed').length;
    const running = runningSessions.length;

    return { completed, failed, running, total: projectList.length };
  }, [runHistory, runningSessions, projectList]);

  const handleRunLastProject = async () => {
    if (currentProject) {
      await runProject(currentProject.id);
    }
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome to Orchestra</h1>
            <p className="text-muted-foreground">
              DAG-based AI agent orchestration for complex workflows
            </p>
          </div>
          {currentProject && (
            <Button onClick={handleRunLastProject} className="gap-2">
              <Play className="w-4 h-4" />
              Run {currentProject.name}
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Projects</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <FolderKanban className="w-4 h-4" />
                <span>Total workflows</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Running</CardDescription>
              <CardTitle className="text-3xl text-yellow-500">{stats.running}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Zap className="w-4 h-4" />
                <span>Active sessions</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-3xl text-green-500">{stats.completed}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4" />
                <span>Successful runs</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
              <CardTitle className="text-3xl text-red-500">{stats.failed}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <XCircle className="w-4 h-4" />
                <span>Need attention</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Projects */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Projects</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setView('canvas')}>
                  View all
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <RecentProjects />
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Activity</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setView('runs')}>
                  View all
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentRuns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No runs yet</p>
                  <p className="text-sm">Run a project to see activity here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRuns.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {run.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : run.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <Zap className="w-4 h-4 text-yellow-500 animate-pulse" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{run.projectName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(run.startedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          run.status === 'completed'
                            ? 'default'
                            : run.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {run.nodesCompleted}/{run.nodesTotal} nodes
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setView('canvas')}>
                <FolderKanban className="w-4 h-4 mr-2" />
                Open Canvas
              </Button>
              <Button variant="outline" onClick={() => setView('agents')}>
                <Zap className="w-4 h-4 mr-2" />
                Browse Agents
              </Button>
              <Button variant="outline" onClick={() => setView('runs')}>
                <Clock className="w-4 h-4 mr-2" />
                View Run History
              </Button>
              <Button variant="outline" onClick={() => setView('settings')}>
                <ArrowRight className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
