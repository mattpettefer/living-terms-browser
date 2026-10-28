import { useEffect, useMemo, useState } from 'preact/hooks';
import { usePostIndex } from '../effects/usePostIndex';
import { useStore } from '../state/provider';
import { ExcludedPostsList } from './ExcludedPostsList';
import { getActiveTempFilter } from '../state/selectors';
import type { AppState, PostRecord, TermKey } from '../state/types';

/** Count distinct selected MATCH terms per post; taxonomy is part of each term key. */
export function getExcludedPosts(state: Pick<AppState, 'postsById' | 'postOrder'>, retained: ReadonlySet<TermKey>, minimumMatches = 1): PostRecord[] {
  const excluded: PostRecord[] = [];
  for (const id of state.postOrder) {
    const post = state.postsById[id];
    if (!post?.termsComplete) throw new Error('Some posts are missing category or tag data. An accurate count is unavailable.');
    let matches = 0;
    for (const key of new Set(post.termKeys)) {
      if (retained.has(key)) matches += 1;
      if (matches >= minimumMatches) break;
    }
    if (matches < minimumMatches) excluded.push(post);
  }
  return excluded;
}

export function ExcludedPostsCount() {
  const { state } = useStore();
  const activeFilter = getActiveTempFilter(state);
  const [minimumMatches, setMinimumMatches] = useState(1);
  // Compare the selected MATCH set and requirement without scanning posts live.
  const signature = useMemo(() => JSON.stringify([activeFilter.id, minimumMatches, [...activeFilter.termKeys].sort()]),
    [activeFilter.id, activeFilter.termKeys, minimumMatches]);
  const [requested, setRequested] = useState<string | null>(null);
  const [result, setResult] = useState<{ signature: string; posts: PostRecord[]; total: number; fetchedAt: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { index, retry } = usePostIndex(requested !== null);
  const ready = state.termsInventory.complete && state.termsInventory.status === 'success';
  const current = result && result.signature === signature && result.fetchedAt === index.fetchedAt && index.complete && index.status === 'success';
  const busy = requested !== null && requested === signature;

  useEffect(() => {
    if (requested === null) return;
    if (requested !== signature || !ready) { setRequested(null); return; }
    if (index.status === 'error') { setError(index.error ?? 'Could not load source posts.'); setRequested(null); return; }
    if (!index.complete || index.status !== 'success') return;
    try {
      const posts = getExcludedPosts(state, new Set(activeFilter.termKeys), minimumMatches);
      setResult({ signature, posts, total: state.postOrder.length, fetchedAt: index.fetchedAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not calculate excluded posts.');
    }
    setRequested(null);
  }, [requested, signature, ready, index.status, index.complete, index.fetchedAt, index.error, state.postsById, state.postOrder]);

  const calculate = () => {
    setError(null);
    if (index.status === 'error') retry();
    setRequested(signature);
  };
  return (
    <section class="ltb-excluded-posts" aria-label="Excluded Posts">
      <div class="ltb-excluded-posts-summary">
        <strong role="status" aria-live="polite">Excluded Posts: {current ? result.posts.length.toLocaleString() : '—'}</strong>
        <button type="button" class="ltb-btn" disabled={!ready || busy} onClick={calculate}>
          {busy ? 'Calculating…' : error ? 'Retry calculation' : result ? 'Recalculate Excluded Posts' : 'Calculate Excluded Posts'}
        </button>
        <label class="ltb-min-matches">
          <span>Minimum matching terms: <strong>{minimumMatches}</strong></span>
          <input type="range" min="1" max="20" step="1" value={minimumMatches}
            aria-label="Minimum matching terms" aria-valuetext={minimumMatches + ' selected MATCH terms'}
            onInput={(e) => setMinimumMatches(Number(e.currentTarget.value))} />
        </label>
      </div>
      <p class="ltb-muted">Shows posts with fewer than {minimumMatches} of “{activeFilter.name}”’s {activeFilter.termKeys.length.toLocaleString()} selected MATCH terms. Counts categories and tags together; NOT terms and the AND/OR setting do not affect this check.</p>
      {activeFilter.termKeys.length === 0 && <p class="ltb-muted">No MATCH terms selected. Calculating will include every source post.</p>}
      {!ready && <p class="ltb-muted">Load the complete term inventory before calculating.</p>}
      {busy && <p class="ltb-muted" role="status">{index.status === 'loading' ? 'Loading source posts (' + index.loadedPages + (index.totalPages ? '/' + index.totalPages : '') + ' pages)…' : 'Calculating…'}</p>}
      {current && <p class="ltb-muted">{result.posts.length.toLocaleString()} of {result.total.toLocaleString()} posts match fewer than {minimumMatches} selected {minimumMatches === 1 ? 'term' : 'terms'}.</p>}
      {result && !current && !busy && <p class="ltb-muted">The MATCH terms, requirement, or post index changed. Recalculate for the current filter.</p>}
      {error && <p role="alert">{error}</p>}
      {current && !busy && !error && <ExcludedPostsList key={result.signature} posts={result.posts} />}
    </section>
  );
}
