import { useCallback, useEffect, useMemo } from 'preact/hooks';
import { ALL_QUERY_PREFIX } from '../state/reducer';
import { useStore } from '../state/provider';
import { getAssignedTermKeys, getOverviewResults } from '../state/selectors';
import type { DestinationId, QueryEntry } from '../state/types';
import { parseTermKey } from '../services/normalize';
import { isAbortError, newRequestId, releaseController, takeController } from '../services/requestCache';
import { buildQueryKey, describeError, fetchPosts } from '../services/wordpress';

const SCOPE = 'overview';

export function useOverviewQuery(category: DestinationId | 'all') {
  const { state, dispatch } = useStore();

  const filter = useMemo(() => {
    if (category === 'all') return { categoryIds: [], tagIds: [], empty: false };
    const keys = getAssignedTermKeys(state.assignments, category).filter((k) => !state.excludedTermKeys.includes(k));
    const categoryIds: number[] = [];
    const tagIds: number[] = [];
    for (const k of keys) {
      const parsed = parseTermKey(k);
      if (!parsed) continue;
      (parsed.taxonomy === 'category' ? categoryIds : tagIds).push(parsed.id);
    }
    return { categoryIds, tagIds, empty: keys.length === 0 };
  }, [category, state.assignments, state.excludedTermKeys]);

  const queryKey = category === 'all' ? `${ALL_QUERY_PREFIX}posts` : buildQueryKey(category, filter.categoryIds, filter.tagIds);
  const entry: QueryEntry | undefined = state.queriesByKey[queryKey];

  const load = useCallback(
    (page: number) => {
      if (filter.empty) return;
      const requestId = newRequestId('posts');
      const controller = takeController(SCOPE);
      dispatch({ type: 'QUERY_START', queryKey, requestId, page });
      fetchPosts(state.source, { categoryIds: filter.categoryIds, tagIds: filter.tagIds, page }, controller.signal)
        .then((r) => {
          if (r.terms.length) dispatch({ type: 'TERMS_RESOLVED', terms: r.terms });
          dispatch({ type: 'QUERY_SUCCESS', queryKey, requestId, page, posts: r.posts, totalPosts: r.total, totalPages: r.totalPages });
        })
        .catch((e) => {
          if (!isAbortError(e)) dispatch({ type: 'QUERY_ERROR', queryKey, requestId, error: describeError(e) });
        })
        .finally(() => releaseController(SCOPE, controller));
    },
    [dispatch, filter, queryKey, state.source],
  );

  useEffect(() => {
    if (filter.empty) return;
    if (!entry || (entry.status === 'idle' && entry.postIds.length === 0)) load(1);
  }, [queryKey, filter.empty, entry, load]);

  const posts = getOverviewResults(state, queryKey);
  const hasMore = !!entry && entry.totalPages !== null && entry.page < entry.totalPages;

  return {
    queryKey,
    entry,
    posts,
    isEmptyAssignment: filter.empty,
    hasMore,
    loadMore: () => entry && entry.status !== 'loading' && load(entry.page + 1),
    retry: () => load(entry && entry.postIds.length ? entry.page : 1),
  };
}
