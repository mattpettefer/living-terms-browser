import { useEffect, useRef } from 'preact/hooks';
import { useStore } from '../state/provider';
import type { PostRecord } from '../state/types';
import { isAbortError } from '../services/requestCache';
import { fetchMediaBatch } from '../services/wordpress';

/** Resolve visible images without cancelling pending batches when the index or view changes. */
export function useMediaBatch(posts: PostRecord[]) {
  const { state, dispatch } = useStore();
  const baseUrl = state.source.baseUrl;
  const requests = useRef<{ pending: Set<number> } | null>(null);
  // Pending requests must not affect this key: doing so cancels their own subscription
  // on the next render. Sort and deduplicate so post ordering cannot restart a batch.
  const key = [...new Set(posts
    .filter((p) => p.featuredMediaId > 0 && !p.imageUrl && !(p.featuredMediaId in state.mediaById))
    .map((p) => p.featuredMediaId))].sort((a, b) => a - b).join(',');

  useEffect(() => {
    const scope = { pending: new Set<number>() };
    requests.current = scope;
    return () => { if (requests.current === scope) requests.current = null; };
  }, [baseUrl]);

  useEffect(() => {
    const scope = requests.current;
    if (!key || !scope) return;
    const ids = key.split(',').map(Number).filter((id) => !scope.pending.has(id));
    if (!ids.length) return;
    for (const id of ids) scope.pending.add(id);
    // Let shared requests finish and populate this store even if the visible cards
    // change. A remounted consumer can join the request without inheriting an abort.
    fetchMediaBatch({ baseUrl, postsRestBase: state.source.postsRestBase }, ids)
      .then((media) => {
        if (requests.current === scope) dispatch({ type: 'MEDIA_RESOLVED', media });
      })
      .catch((e) => {
        if (requests.current === scope && !isAbortError(e)) console.error('[ltb] media batch failed:', e);
      })
      .finally(() => ids.forEach((id) => scope.pending.delete(id)));
  }, [key, baseUrl, dispatch]);
}

export function imageFor(post: PostRecord, mediaById: Record<number, string | null>): string | null {
  return post.imageUrl ?? mediaById[post.featuredMediaId] ?? null;
}
