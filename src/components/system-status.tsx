'use client';

import { useEffect } from 'react';
import { Circle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useOrchestraStore } from '@/lib/store';

interface StatusItemProps {
  label: string;
  available: boolean;
}

function StatusItem({ label, available }: StatusItemProps) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1.5">
        <Circle
          className={cn(
            'w-2 h-2 fill-current',
            available ? 'text-green-500' : 'text-muted-foreground/30'
          )}
        />
        <span
          className={cn(
            'text-xs',
            available ? 'text-green-500' : 'text-muted-foreground'
          )}
        >
          {available ? 'Ready' : 'Not found'}
        </span>
      </div>
    </div>
  );
}

export default function SystemStatus() {
  const systemStatus = useOrchestraStore((s) => s.systemStatus);
  const checkSystemStatus = useOrchestraStore((s) => s.checkSystemStatus);

  // Check status on mount and periodically
  useEffect(() => {
    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkSystemStatus]);

  const allReady =
    systemStatus.claudeCliDetected &&
    systemStatus.codexCliDetected &&
    systemStatus.geminiCliDetected &&
    systemStatus.dockerAvailable;

  const someReady =
    systemStatus.claudeCliDetected ||
    systemStatus.codexCliDetected ||
    systemStatus.geminiCliDetected;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Circle
            className={cn(
              'w-3 h-3 fill-current',
              allReady
                ? 'text-green-500'
                : someReady
                ? 'text-yellow-500'
                : 'text-red-500'
            )}
          />
          {!allReady && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-500 rounded-full" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px]" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">System Status</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => checkSystemStatus()}
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh status</TooltipContent>
            </Tooltip>
          </div>

          <div className="border-t pt-2 space-y-0.5">
            <StatusItem label="Claude CLI" available={systemStatus.claudeCliDetected} />
            <StatusItem label="Codex CLI" available={systemStatus.codexCliDetected} />
            <StatusItem label="Gemini CLI" available={systemStatus.geminiCliDetected} />
            <StatusItem label="Docker" available={systemStatus.dockerAvailable} />
          </div>

          {systemStatus.lastChecked && (
            <p className="text-xs text-muted-foreground pt-1 border-t">
              Last checked:{' '}
              {new Date(systemStatus.lastChecked).toLocaleTimeString()}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
