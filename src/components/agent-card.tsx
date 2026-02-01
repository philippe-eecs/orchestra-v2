'use client';

import {
  Bot,
  Sparkles,
  Code,
  Globe,
  Layers,
  MoreHorizontal,
  Trash2,
  Edit,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrchestraStore } from '@/lib/store';
import type { AgentTemplate, PrimitiveAgentTemplate, ComposedAgentTemplate } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AgentCardProps {
  agent: AgentTemplate;
}

const agentIcons: Record<string, React.ElementType> = {
  claude: Sparkles,
  codex: Code,
  gemini: Globe,
};

const agentColors: Record<string, string> = {
  claude: 'text-orange-500 bg-orange-500/10',
  codex: 'text-green-500 bg-green-500/10',
  gemini: 'text-blue-500 bg-blue-500/10',
};

function getAgentIcon(agent: AgentTemplate): React.ElementType {
  if (agent.kind === 'primitive') {
    const primitiveAgent = agent as PrimitiveAgentTemplate;
    return agentIcons[primitiveAgent.agentType] || Bot;
  }
  return Layers;
}

function getAgentIconColor(agent: AgentTemplate): string {
  if (agent.kind === 'primitive') {
    const primitiveAgent = agent as PrimitiveAgentTemplate;
    return agentColors[primitiveAgent.agentType] || 'text-muted-foreground bg-muted';
  }
  return 'text-purple-500 bg-purple-500/10';
}

export default function AgentCard({ agent }: AgentCardProps) {
  const deleteAgentTemplate = useOrchestraStore((s) => s.deleteAgentTemplate);

  const isPrimitive = agent.kind === 'primitive';
  const isDefault = agent.id.endsWith('-default');
  const Icon = getAgentIcon(agent);

  const handleDelete = () => {
    if (isDefault) return;
    if (confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) {
      deleteAgentTemplate(agent.id);
    }
  };

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className={cn('p-2 rounded-lg', getAgentIconColor(agent))}>
            <Icon className="w-5 h-5" />
          </div>
          {!isDefault && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <CardTitle className="text-base mt-2">{agent.name}</CardTitle>
        <CardDescription className="line-clamp-2">
          {agent.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {agent.kind}
          </Badge>
          {agent.category && (
            <Badge variant="secondary" className="text-xs">
              {agent.category}
            </Badge>
          )}
          {isDefault && (
            <Badge variant="secondary" className="text-xs">
              Built-in
            </Badge>
          )}
        </div>
        {!isPrimitive && (
          <div className="mt-2 text-xs text-muted-foreground">
            {(agent as ComposedAgentTemplate).nodes.length} nodes
          </div>
        )}
      </CardContent>
    </Card>
  );
}
