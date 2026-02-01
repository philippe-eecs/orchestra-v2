import * as React from 'react';
import { cn } from './cn';

interface CollapsibleProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function Collapsible({
  title,
  count,
  defaultOpen = false,
  children,
  className,
  actions,
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={cn('border-b border-border', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
      >
        <svg
          className={cn('h-3 w-3 shrink-0 transition-transform', isOpen && 'rotate-90')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="flex-1">{title}</span>
        {typeof count === 'number' && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            {count}
          </span>
        )}
        {actions && (
          <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
            {actions}
          </span>
        )}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

interface CollapsibleControlledProps {
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function CollapsibleControlled({
  title,
  count,
  isOpen,
  onToggle,
  children,
  className,
  actions,
}: CollapsibleControlledProps) {
  return (
    <div className={cn('border-b border-border', className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
      >
        <svg
          className={cn('h-3 w-3 shrink-0 transition-transform', isOpen && 'rotate-90')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="flex-1">{title}</span>
        {typeof count === 'number' && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            {count}
          </span>
        )}
        {actions && (
          <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
            {actions}
          </span>
        )}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
