import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { PostCard } from '../components/PostCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { navigate } from '../effects/useHashRouter';
import { useOverviewQuery } from '../effects/useOverviewQuery';
import { useStore } from '../state/provider';
import { getAssignmentCounts, getExcludedSet, getMatchedDestinations, getPostMatches } from '../state/selectors';
import type { DestinationId } from '../state/types';

export function Overview() {
  const { state, dispatch } = useStore();
  const category = state.ui.overviewCategory;
  const { entry, posts, isEmptyAssignment, hasMore, loadMore, retry } = useOverviewQuery(category);
  const excluded = getExcludedSet(state);
  const counts = getAssignmentCounts(state);
  const restored = useRef(false);

  // Restore scroll position once results for the remembered selection are present.
  useLayoutEffect(() => {
    if (restored.current || posts.length === 0) return;
    restored.current = true;
    if (state.ui.overviewScrollY > 0) window.scrollTo(0, state.ui.overviewScrollY);
  }, [posts.length, state.ui.overviewScrollY]);

  useEffect(() => {
    return () => dispatch({ type: 'SET_OVERVIEW_SCROLL', scrollY: window.scrollY });
  }, [dispatch]);

  const select = (next: DestinationId | 'all') => {
    restored.current = true;
    navigate({ view: 'overview', category: next });
  };

  const status = entry?.status ?? (isEmptyAssignment ? 'success' : 'idle');
  const label = category === 'all' ? 'All Posts' : state.destinationCategories.find((d) => d.id === category)?.name;

  return (
    <section class="ltb-overview" aria-labelledby="ltb-overview-heading">
      <nav class="ltb-filter-bar" aria-label="Destination category filter">
        <button type="button" class={`ltb-filter${category === 'all' ? ' is-active' : ''}`} aria-pressed={category === 'all'} onClick={() => select('all')}>
          All Posts
        </button>
        {state.destinationCategories.map((d) => (
          <button
            key={d.id}
            type="button"
            class={`ltb-filter${category === d.id ? ' is-active' : ''}`}
            aria-pressed={category === d.id}
            onClick={() => select(d.id)}
            title={`${counts[d.id]} assigned term${counts[d.id] === 1 ? '' : 's'}`}
          >
            {d.name}
            <span class="ltb-filter-count" aria-hidden="true">
              {counts[d.id]}
            </span>
          </button>
        ))}
      </nav>

      <header class="ltb-results-header">
        <h2 id="ltb-overview-heading" class="ltb-h2">
          {label}
        </h2>
        {entry?.totalPosts !== null && entry?.totalPosts !== undefined && (
          <span class="ltb-results-count">
            {entry.totalPosts.toLocaleString()} post{entry.totalPosts === 1 ? '' : 's'}
          </span>
        )}
      </header>

      {isEmptyAssignment ? (
        <EmptyState title="No terms are assigned to this category yet.">
          <p>
            Assign source terms in <a href={`#/config/${category}`}>Config</a> to see matching posts here.
          </p>
        </EmptyState>
      ) : status === 'error' && posts.length === 0 ? (
        <ErrorState message={entry?.error ?? 'Request failed'} onRetry={retry} />
      ) : status === 'loading' && posts.length === 0 ? (
        <LoadingState label="Loading posts…" />
      ) : posts.length === 0 && status === 'success' ? (
        <EmptyState title="No published posts match the assigned terms." />
      ) : (
        <>
          <div class="ltb-grid">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} matchedDestinations={getMatchedDestinations(getPostMatches(p, state.assignments, excluded))} />
            ))}
          </div>
          <div class="ltb-load-more">
            {status === 'error' && <ErrorState message={entry?.error ?? 'Request failed'} onRetry={retry} />}
            {status === 'loading' && <LoadingState label="Loading more…" />}
            {hasMore && status === 'success' && (
              <button type="button" class="ltb-btn" onClick={loadMore}>
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
