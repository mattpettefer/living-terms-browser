export function postCountLabel(count: number | null | undefined): string {
  return count == null ? 'Source post count unavailable' : count.toLocaleString() + ' source ' + (count === 1 ? 'post' : 'posts');
}

/** Total posts using this term on the source site, independent of active filters. */
export function TermPostCount({ count, label = postCountLabel(count) }: { count: number | null | undefined; label?: string }) {

  return <span class="ltb-term-count" title={label} aria-label={label}>{count == null ? '—' : count.toLocaleString()}</span>;
}
