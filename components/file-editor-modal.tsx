'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface FileEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectLocation: string;
  path: string;
}

export function FileEditorModal({ open, onOpenChange, projectLocation, path }: FileEditorModalProps) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => path.split('/').pop() || path, [path]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch('/api/files/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, projectLocation }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setContent(String(data.content ?? ''));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, path, projectLocation]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, projectLocation, content }),
      });
      if (!res.ok) throw new Error(await res.text());
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  }, [content, onOpenChange, path, projectLocation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit: {title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {error && (
            <div className="text-xs text-destructive mb-2 whitespace-pre-wrap">{error}</div>
          )}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={isLoading ? 'Loading...' : ''}
            disabled={isLoading}
            className="h-full w-full resize-none font-mono text-sm"
          />
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {isLoading ? 'Loading…' : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

