'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface PromptEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialPrompt: string;
  onSave: (prompt: string) => void;
}

export function PromptEditorModal({
  open,
  onOpenChange,
  title,
  initialPrompt,
  onSave,
}: PromptEditorModalProps) {
  const [localPrompt, setLocalPrompt] = useState(initialPrompt);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setLocalPrompt(initialPrompt);
      }
      onOpenChange(nextOpen);
    },
    [initialPrompt, onOpenChange]
  );

  const handleSave = useCallback(() => {
    onSave(localPrompt);
    onOpenChange(false);
  }, [localPrompt, onSave, onOpenChange]);

  const handleCancel = useCallback(() => {
    setLocalPrompt(initialPrompt);
    onOpenChange(false);
  }, [initialPrompt, onOpenChange]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl h-[80vh] flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-muted-foreground">Editing prompt for:</span>
            <span>{title || 'Untitled Node'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          <Textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            placeholder="Enter your prompt here..."
            className="h-full w-full resize-none font-mono text-sm"
          />
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Press <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">⌘S</kbd> to save
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
