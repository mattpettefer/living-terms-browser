import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { PostCard } from '../components/PostCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { navigate } from '../effects/useHashRouter';
import { imageFor, useMediaBatch } from '../effects/useMediaBatch';
import { usePostIndex } from '../effects/usePostIndex';
import { OVERVIEW_PAGE_SIZE } from '../state/reducer';
import { useStore } from '../state/provider';
import { TempFilterSwitcher } from '../components/TempFilterSwitcher';
import {
  getActiveTempFilter,
  getAssignmentCounts,
  getExcludedSet,
  getMatchedDestinations,
  getOverviewResults,
  getPostMatches,
  getTempFilterTerms,
} from '../state/selectors';
import type { DestinationId } from '../state/types';

export function Overview() {
  const { state, dispatch } = useStore();
  const category = state.ui.overviewCategory;
  const { index, retry } = usePostIndex();
  const excluded = getExcludedSet(state);
  const counts = getAssignmentCounts(state);
  const restored = useRef(false);

  // Everything below is derived locally from the complete post index.
  const { matching, primaryCount, emptyAssignment } = useMemo(
    () => getOverviewResults(state, category),
    [state.postOrder, state.postsById, state.assignments, state.excludedTermKeys, state.tempFilters, state.activeTempFilterId, state.tempFilterEnabled, category],
  );
  const shown = matching.slice(0, state.ui.overviewPage * OVERVIEW_PAGE_SIZE);
  const hasMore = shown.length < matching.length;
  useMediaBatch(shown);

  const activeFilter = getActiveTempFilter(state);
  const tempActive = state.tempFilterEnabled && activeFilter.termKeys.length > 0;
  const showTempBar = state.tempFilters.some((f) => f.termKeys.length > 0);
  const tempTerms = getTempFilterTerms(state, activeFilter);
  const partial = !index.complete && index.status !== 'error';

  // Restore scroll position once results for the remembered selection are present.
  useLayoutEffect(() => {
    if (restored.current || shown.length === 0) return;
    restored.current = true;
    if (state.ui.overviewScrollY > 0) window.scrollTo(0, state.ui.overviewScrollY);
  }, [shown.length, state.ui.overviewScrollY]);

  useEffect(() => {
    return () => dispatch({ type: 'SET_OVERVIEW_SCROLL', scrollY: window.scrollY });
  }, [dispatch]);

  const select = (next: DestinationId | 'all') => {
    restored.current = true;
    navigate({ view: 'overview', category: next });
  };

  const label = category === 'all' ? 'All Posts' : state.destinationCategories.find((d) => d.id === category)?.name;
  const countLabel = tempActive
    ? `${matching.length.toLocaleString()} of ${primaryCount.toLocaleString()} match ${activeFilter.name}`
    : `${matching.length.toLocaleString()} post${matching.length === 1 ? '' : 's'}`;
  const progress = index.totalPages ? ` · loading ${index.loadedPages}/${index.totalPages} pages` : '';

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

      {showTempBar && (
        <div class="ltb-temp-bar" role="region" aria-label="Temporary filter">
          <TempFilterSwitcher />
          {state.tempFilterEnabled && (
            <span class="ltb-temp-label">{tempActive ? 'Posts must also have' : `${activeFilter.name} has no requirements`}</span>
          )}
          <div class="ltb-temp-terms">
            {state.tempFilterEnabled && tempTerms.map(({ key, term }, i) => (
              <span key={key} class="ltb-temp-term-wrap">
                {i > 0 && <span class="ltb-temp-and">and</span>}
                <button
                  type="button"
                  class="ltb-term ltb-term-sm is-filter is-selected"
                  title={`Remove from ${activeFilter.name}`}
                  aria-label={`Remove ${term?.name ?? key} from ${activeFilter.name}`}
                  onClick={() => dispatch({ type: 'TOGGLE_TEMP_FILTER_TERM', termKey: key })}
                >
                  <span class="ltb-term-label">{term?.name ?? key}</span>
                  <span aria-hidden="true" class="ltb-term-x">×</span>
                </button>
              </span>
            ))}
          </div>
          <span class="ltb-temp-actions">
            <a href="#/config/temp-filter">Edit</a>
            {tempActive && (
              <button type="button" class="ltb-link-btn" onClick={() => dispatch({ type: 'CLEAR_TEMP_FILTER' })}>
                Clear
              </button>
            )}
          </span>
        </div>
      )}

      <header class="ltb-results-header">
        <h2 id="ltb-overview-heading" class="ltb-h2">
          {label}
        </h2>
        {!emptyAssignment && (
          <span class="ltb-results-count" role="status" aria-live="polite">
            {countLabel}
            {partial && <span class="ltb-partial">{index.status === 'loading' ? `${progress} (partial)` : ' (partial)'}</span>}
          </span>
        )}
      </header>

      {emptyAssignment ? (
        <EmptyState title="No terms are assigned to this category yet.">
          <p>
            Assign source terms in <a href={`#/config/${category}`}>Config</a> to see matching posts here.
          </p>
        </EmptyState>
      ) : index.status === 'error' && state.postOrder.length === 0 ? (
        <ErrorState message={`Could not load posts: ${index.error ?? 'request failed'}`} onRetry={retry} />
      ) : index.status === 'loading' && state.postOrder.length === 0 ? (
        <LoadingState label="Loading posts…" />
      ) : matching.length === 0 && index.complete ? (
        <EmptyState title={tempActive ? `No posts in this category carry every term required by ${activeFilter.name}.` : 'No published posts match the assigned terms.'} />
      ) : (
        <>
          <div class="ltb-grid">
            {shown.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                imageUrl={imageFor(p, state.mediaById)}
                matchedDestinations={getMatchedDestinations(getPostMatches(p, state.assignments, excluded))}
              />
            ))}
          </div>
          <div class="ltb-load-more">
            {index.status === 'error' && <ErrorState message={`Post index incomplete: ${index.error ?? 'request failed'}`} onRetry={retry} />}
            {matching.length === 0 && partial && <LoadingState label="Searching remaining posts…" />}
            {hasMore && (
              <button type="button" class="ltb-btn" onClick={() => dispatch({ type: 'SHOW_MORE_POSTS', pageSize: OVERVIEW_PAGE_SIZE })}>
                Show more ({(matching.length - shown.length).toLocaleString()} remaining)
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
