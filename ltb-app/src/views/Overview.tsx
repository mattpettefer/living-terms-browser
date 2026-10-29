import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CopyToFinal } from '../components/CopyToFinal';
import { PostCard } from '../components/PostCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { navigate } from '../effects/useHashRouter';
import { imageFor, useMediaBatch } from '../effects/useMediaBatch';
import { usePostIndex } from '../effects/usePostIndex';
import { OVERVIEW_PAGE_SIZE } from '../state/reducer';
import { useStore } from '../state/provider';
import { TempFilterLines } from '../components/TempFilterLines';
import { TempFilterSwitcher } from '../components/TempFilterSwitcher';
import {
  getActiveTempFilter,
  getExcludedSet,
  getMatchedDestinations,
  getOverviewResults,
  getSelectionResults,
  getPostMatches,
} from '../state/selectors';
import type { DestinationId } from '../state/types';

export function Overview({ mode = 'overview' }: { mode?: 'overview' | 'selections' }) {
  const { state, dispatch } = useStore();
  const [replaceExisting, setReplaceExisting] = useState(false);
  const selections = mode === 'selections';
  const category = selections ? state.ui.selectionsCategory : state.ui.overviewCategory;
  const page = selections ? state.ui.selectionsPage : state.ui.overviewPage;
  const scrollY = selections ? state.ui.selectionsScrollY : state.ui.overviewScrollY;
  const { index, retry } = usePostIndex();
  const excluded = getExcludedSet(state);
  const counts = useMemo(() => Object.fromEntries(state.destinationCategories.map((d) => [
    d.id, (selections ? getSelectionResults(state, d.id) : getOverviewResults(state, d.id)).matching.length,
  ])) as Record<DestinationId, number>, [mode, state.destinationCategories, state.postSelections, state.postOrder, state.postsById, state.assignments, state.destinationExclusions, state.excludedTermKeys, state.tempFilters, state.activeTempFilterId, state.tempFilterEnabled]);
  const restored = useRef(false);

  // Everything below is derived locally from the complete post index.
  const { matching, primaryCount, emptyAssignment } = useMemo(
    () => selections ? getSelectionResults(state, category) : getOverviewResults(state, category),
    [mode, state.postSelections, state.postOrder, state.postsById, state.assignments, state.destinationExclusions, state.excludedTermKeys, state.tempFilters, state.activeTempFilterId, state.tempFilterEnabled, category],
  );
  const shown = matching.slice(0, page * OVERVIEW_PAGE_SIZE);
  const hasMore = shown.length < matching.length;
  const selectedCount = matching.filter((post) => state.postSelections[post.id] === category).length;
  const allSelected = matching.length > 0 && selectedCount === matching.length;
  const unselectedCount = matching.filter((post) => state.postSelections[post.id] == null).length;
  const selectableCount = replaceExisting ? matching.length - selectedCount : unselectedCount;
  const bulkReady = index.complete && index.status === 'success';
  useMediaBatch(shown);

  const activeFilter = getActiveTempFilter(state);
  const tempActive = state.tempFilterEnabled && (activeFilter.termKeys.length > 0 || (activeFilter.notTermKeys?.length ?? 0) > 0);
  const showTempBar = state.tempFilters.some((f) => f.termKeys.length > 0 || (f.notTermKeys?.length ?? 0) > 0);
  const partial = !index.complete && index.status !== 'error';

  // Restore scroll position once results for the remembered selection are present.
  useLayoutEffect(() => {
    if (restored.current || shown.length === 0) return;
    restored.current = true;
    window.scrollTo(0, scrollY);
  }, [shown.length, scrollY]);

  useEffect(() => {
    return () => dispatch({ type: selections ? 'SET_SELECTIONS_SCROLL' : 'SET_OVERVIEW_SCROLL', scrollY: window.scrollY });
  }, [dispatch, selections]);

  const select = (next: DestinationId | 'all') => {
    restored.current = true;
    navigate({ view: mode, category: next });
  };

  const label = category === 'all' ? 'All Posts' : state.destinationCategories.find((d) => d.id === category)?.name;
  const countLabel = tempActive
    ? `${matching.length.toLocaleString()} of ${primaryCount.toLocaleString()} match ${activeFilter.name}`
    : `${matching.length.toLocaleString()} ${category === 'all' ? '' : selections ? 'selected ' : 'matching '}post${matching.length === 1 ? '' : 's'}`;
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
            title={`${counts[d.id].toLocaleString()} ${selections ? 'selected' : 'matching'} posts${tempActive ? ' after temporary filtering' : ''}${!bulkReady ? ' (partial index)' : ''}`}
          >
            {d.name}
            <span class="ltb-filter-count">
              {counts[d.id].toLocaleString()}{!bulkReady ? '+' : ''} {selections ? 'selected' : counts[d.id] === 1 ? 'post' : 'posts'}
            </span>
          </button>
        ))}
      </nav>

      <p class="ltb-muted">{selections ? 'Posts grouped by the destination selected on each card.' : 'Posts matching Config rules. A post can match more than one destination.'}{tempActive ? ' Counts reflect the active temporary filter.' : ''}</p>
      {state.persistence.status === 'error' && <ErrorState message={state.persistence.error ?? 'Could not save selections.'} onRetry={() => dispatch({ type: 'PERSIST_STATUS', status: 'unsaved' })} />}
      {showTempBar && (
        <div class="ltb-temp-bar" role="region" aria-label="Temporary filter">
          <TempFilterSwitcher />
          {state.tempFilterEnabled && <TempFilterLines />}
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

      {!selections && category !== 'all' && <div class="ltb-final-actions"><CopyToFinal key={category} destination={category} /><a href={'#/final/' + category}>Review Final tags</a></div>}
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

      {category !== 'all' && (
        <div class="ltb-bulk-selection">
          {!selections && <button type="button" class="ltb-btn ltb-btn-primary" disabled={!bulkReady || selectableCount === 0}
            onClick={() => dispatch({ type: 'SELECT_ALL_OVERVIEW', destination: category, replaceExisting })}>
            {bulkReady && allSelected ? 'All selected' : 'Select all'}
          </button>}
          <button type="button" class="ltb-btn" disabled={!bulkReady || selectedCount === 0}
            title={'Clear ' + label + ' selections for every matching post, including posts behind Show more.'}
            onClick={() => dispatch({ type: 'DESELECT_ALL', destination: category, view: mode })}>
            Deselect all
          </button>
          {!selections && <label class="ltb-checkbox ltb-toggle">
            <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.currentTarget.checked)} />
            Replace existing selections
          </label>}
          <span class="ltb-muted" role="status" aria-live="polite">
            {!bulkReady
              ? index.status === 'error' ? 'Finish loading all posts before changing selections. Retry below.' : 'Loading all posts before selection controls are available…'
              : selections ? 'Clear ' + selectedCount.toLocaleString() + ' matching selections for ' + label + ', including posts behind Show more.'
              : allSelected ? 'All ' + matching.length.toLocaleString() + ' matching posts are selected for ' + label + '.'
              : replaceExisting ? 'Select all ' + matching.length.toLocaleString() + ' matching posts for ' + label + ', including posts behind Show more. Existing choices will be replaced.'
              : unselectedCount === 0 ? 'Every matching post already has a selection. Enable Replace existing selections to change destinations.'
              : 'Select ' + unselectedCount.toLocaleString() + ' unselected matching posts for ' + label + ', including posts behind Show more. Existing selections will be kept.'}
          </span>
        </div>
      )}

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
        <EmptyState title={tempActive ? "No posts in this category match the temporary filter." : selections ? "No posts have been selected for this destination yet." : "No published posts match the assigned terms."} />
      ) : (
        <>
          <div class="ltb-grid">
            {shown.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                imageUrl={imageFor(p, state.mediaById)}
                matchedDestinations={getMatchedDestinations(getPostMatches(p, state.assignments, excluded, state.destinationExclusions))}
              />
            ))}
          </div>
          <div class="ltb-load-more">
            {index.status === 'error' && <ErrorState message={`Post index incomplete: ${index.error ?? 'request failed'}`} onRetry={retry} />}
            {matching.length === 0 && partial && <LoadingState label="Searching remaining posts…" />}
            {hasMore && (
              <button type="button" class="ltb-btn" onClick={() => dispatch({ type: 'SHOW_MORE_POSTS', pageSize: OVERVIEW_PAGE_SIZE, view: mode })}>
                Show more ({(matching.length - shown.length).toLocaleString()} remaining)
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
