import { stat, readFile } from 'node:fs/promises';

export type ReadTextPreviewOptions = {
  maxLines: number;
  maxBytes: number;
};

export type TextPreview = {
  content: string;
  truncated: boolean;
  fileSizeBytes: number;
};

export async function readTextPreview(filePath: string, opts: ReadTextPreviewOptions): Promise<TextPreview> {
  const s = await stat(filePath);
  const maxBytes = Math.max(1, opts.maxBytes);
  const buf = await readFile(filePath);
  const slice = buf.subarray(0, Math.min(buf.length, maxBytes));
  const text = slice.toString('utf8');

  const lines = text.split(/\r?\n/);
  const maxLines = Math.max(1, opts.maxLines);
  const truncatedByLines = lines.length > maxLines;
  const truncatedByBytes = buf.length > maxBytes;

  const contentLines = truncatedByLines ? lines.slice(0, maxLines) : lines;
  const content = contentLines.join('\n') + (truncatedByLines || truncatedByBytes ? '\n...' : '');

  return {
    content,
    truncated: truncatedByLines || truncatedByBytes,
    fileSizeBytes: s.size,
  };
}

