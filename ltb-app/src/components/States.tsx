import type { ComponentChildren } from 'preact';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div class="ltb-state ltb-state-loading" role="status" aria-live="polite">
      <span class="ltb-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ComponentChildren }) {
  return (
    <div class="ltb-state ltb-state-error" role="alert">
      <p>{message}</p>
      {children}
      {onRetry && (
        <button type="button" class="ltb-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="ltb-state ltb-state-empty">
      <p class="ltb-state-title">{title}</p>
      {children}
    </div>
  );
}
