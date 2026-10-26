import { useEffect } from 'preact/hooks';
import { useStore } from '../state/provider';
import type { PostRecord } from '../state/types';
import { isAbortError } from '../services/requestCache';
import { fetchMediaBatch } from '../services/wordpress';

const inflight = new Set<number>();

/**
 * Resolve featured images for the posts currently displayed, one batched
 * `/media?include=` request per set of unresolved IDs. Results land in
 * `state.mediaById`; posts that already carry an `imageUrl` (from an article
 * fetch) are skipped.
 */
export function useMediaBatch(posts: PostRecord[]) {
  const { state, dispatch } = useStore();
  const missing = posts
    .filter((p) => p.featuredMediaId > 0 && !p.imageUrl && !(p.featuredMediaId in state.mediaById) && !inflight.has(p.featuredMediaId))
    .map((p) => p.featuredMediaId);
  const key = missing.join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',').map(Number);
    for (const id of ids) inflight.add(id);
    const controller = new AbortController();
    fetchMediaBatch(state.source, ids, controller.signal)
      .then((media) => dispatch({ type: 'MEDIA_RESOLVED', media }))
      .catch((e) => {
        if (!isAbortError(e)) console.error('[ltb] media batch failed:', e);
      })
      .finally(() => ids.forEach((id) => inflight.delete(id)));
    return () => controller.abort();
  }, [key, state.source, dispatch]);
}

export function imageFor(post: PostRecord, mediaById: Record<number, string | null>): string | null {
  return post.imageUrl ?? mediaById[post.featuredMediaId] ?? null;
}
