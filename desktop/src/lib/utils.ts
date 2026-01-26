export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'var(--accent-success)';
    case 'in_progress':
    case 'running':
      return 'var(--accent-warning)';
    case 'needs_review':
      return 'var(--accent-error)';  // Red signal - human attention needed
    case 'failed':
      return 'var(--accent-error)';
    case 'blocked':
      return 'var(--accent-warning)';
    default:
      return 'var(--text-secondary)';
  }
}
