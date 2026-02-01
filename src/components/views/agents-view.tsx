'use client';

import { useMemo, useState } from 'react';
import {
  Bot,
  Cpu,
  Layers,
  Search,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrchestraStore } from '@/lib/store';
import AgentCard from '@/components/agent-card';

export default function AgentsView() {
  const agentLibrary = useOrchestraStore((s) => s.agentLibrary);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const agents = useMemo(() => Object.values(agentLibrary), [agentLibrary]);

  const primitiveAgents = useMemo(
    () => agents.filter((a) => a.kind === 'primitive'),
    [agents]
  );

  const composedAgents = useMemo(
    () => agents.filter((a) => a.kind === 'composed'),
    [agents]
  );

  const filteredAgents = useMemo(() => {
    let list = agents;
    if (activeTab === 'primitive') list = primitiveAgents;
    if (activeTab === 'composed') list = composedAgents;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query)
      );
    }

    return list;
  }, [agents, primitiveAgents, composedAgents, activeTab, searchQuery]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Agent Library</h1>
            <p className="text-muted-foreground">
              Manage your primitive and composed agents
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Agent
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all" className="gap-1.5">
                <Bot className="w-4 h-4" />
                All ({agents.length})
              </TabsTrigger>
              <TabsTrigger value="primitive" className="gap-1.5">
                <Cpu className="w-4 h-4" />
                Primitive ({primitiveAgents.length})
              </TabsTrigger>
              <TabsTrigger value="composed" className="gap-1.5">
                <Layers className="w-4 h-4" />
                Composed ({composedAgents.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Agent Grid */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No agents found</p>
              <p className="text-sm">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create a composed agent from a project'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
