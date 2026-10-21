import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AssignTermDialog } from '../components/AssignTermDialog';
import { MoveTermDialog } from '../components/MoveTermDialog';
import { TermButton } from '../components/TermButton';
import { ErrorState, LoadingState } from '../components/States';
import { navigate } from '../effects/useHashRouter';
import { useTermInventory } from '../effects/useTermInventory';
import { destinationName } from '../state/destinations';
import { useStore } from '../state/provider';
import { getActiveTempFilter, getAssignmentCounts, getDuplicateNameCounts, getVisibleTerms, sortSelectedFirst } from '../state/selectors';
import { TempFilterSwitcher } from '../components/TempFilterSwitcher';
import type { ConfigTab, DestinationId, SourceTerm } from '../state/types';
import { ImportExport } from './ImportExport';

const CHUNK = 200;
const UNASSIGNED = 'unassigned' as const;
const TEMP = 'temp-filter' as const;

export function Config() {
  const { state, dispatch } = useStore();
  const { retry } = useTermInventory();
  const active = state.ui.activeConfigCategory;
  const isUnassignedTab = active === UNASSIGNED;
  const isTempTab = active === TEMP;
  const activeDestination: DestinationId | null = active === UNASSIGNED || active === TEMP ? null : active;
  const activeFilter = getActiveTempFilter(state);
  const tempSet = useMemo(() => new Set(activeFilter.termKeys), [activeFilter.termKeys]);
  const search = state.ui.termSearch;
  const categoriesOnly = state.ui.categoriesOnly;
  const inventory = state.termsInventory;
  const counts = getAssignmentCounts(state);
  const duplicates = useMemo(() => getDuplicateNameCounts(state), [state.termOrder, state.termsByKey]);
  const termSort = state.ui.termSort;
  const alphabetical = useMemo(
    () => getVisibleTerms(state, search, categoriesOnly),
    [state.termOrder, state.termsByKey, state.excludedTermKeys, search, categoriesOnly],
  );
  const visible = useMemo(() => {
    if (isUnassignedTab) return alphabetical.filter((t) => !state.assignments[t.key]);
    if (termSort !== 'selected-first') return alphabetical;
    if (isTempTab) return sortSelectedFirst(alphabetical, (t) => tempSet.has(t.key));
    return sortSelectedFirst(alphabetical, (t) => state.assignments[t.key] === activeDestination);
  }, [alphabetical, termSort, state.assignments, activeDestination, isUnassignedTab, isTempTab, tempSet]);
  const unassignedCount = useMemo(
    () => getVisibleTerms(state, '', false).filter((t) => !state.assignments[t.key]).length,
    [state.termOrder, state.termsByKey, state.excludedTermKeys, state.assignments],
  );

  // Incremental rendering: grow the rendered window as the user scrolls near the end.
  const [limit, setLimit] = useState(CHUNK);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setLimit(CHUNK), [search, active, categoriesOnly, termSort]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= visible.length) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((l) => Math.min(l + CHUNK, visible.length)));
    io.observe(el);
    return () => io.disconnect();
  }, [limit, visible.length]);

  const lastTrigger = useRef<HTMLElement | null>(null);
  const [assigning, setAssigning] = useState<SourceTerm | null>(null);
  const onTermClick = (term: SourceTerm, ev?: Event) => {
    lastTrigger.current = (ev?.currentTarget as HTMLElement) ?? (document.activeElement as HTMLElement);
    if (isTempTab) {
      dispatch({ type: 'TOGGLE_TEMP_FILTER_TERM', termKey: term.key });
      return;
    }
    if (!activeDestination) {
      setAssigning(term);
      return;
    }
    const current = state.assignments[term.key];
    if (!current) dispatch({ type: 'ASSIGN_TERM', termKey: term.key, destination: activeDestination });
    else if (current === activeDestination) dispatch({ type: 'UNASSIGN_TERM', termKey: term.key });
    else dispatch({ type: 'OPEN_MOVE', termKey: term.key, fromCategory: current, toCategory: activeDestination });
  };
  const restoreFocus = () => requestAnimationFrame(() => lastTrigger.current?.focus());
  const closeDialog = (type: 'CANCEL_MOVE' | 'CONFIRM_MOVE') => {
    dispatch({ type });
    restoreFocus();
  };
  const closeAssign = (destination?: DestinationId) => {
    if (assigning && destination) dispatch({ type: 'ASSIGN_TERM', termKey: assigning.key, destination });
    setAssigning(null);
    restoreFocus();
  };

  const tabIds: ConfigTab[] = [...state.destinationCategories.map((d) => d.id), UNASSIGNED, TEMP];
  const onTabKey = (e: KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabIds.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabIds.length) % tabIds.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabIds.length - 1;
    if (next === null) return;
    e.preventDefault();
    navigate({ view: 'config', category: tabIds[next]! });
    (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  };

  const pending = state.ui.pendingTermMove;
  const progress = inventory.totalPages ? `${inventory.loadedPages}/${inventory.totalPages} pages` : `${inventory.loadedPages} pages`;
  const tabButton = (id: ConfigTab, label: string, count: number, index: number) => (
    <button
      key={id}
      type="button"
      role="tab"
      id={`ltb-tab-${id}`}
      aria-selected={active === id}
      aria-controls="ltb-config-panel"
      tabIndex={active === id ? 0 : -1}
      class={`ltb-tab${active === id ? ' is-active' : ''}${id === UNASSIGNED ? ' ltb-tab-unassigned' : ''}${id === TEMP ? ' ltb-tab-temp' : ''}`}
      data-destination={id === UNASSIGNED || id === TEMP ? undefined : id}
      onClick={() => navigate({ view: 'config', category: id })}
      onKeyDown={(e) => onTabKey(e, index)}
    >
      <span class="ltb-swatch" aria-hidden="true" />
      {label}
      <span class="ltb-tab-count">{count}</span>
    </button>
  );

  return (
    <section class="ltb-config">
      <div class="ltb-tabs" role="tablist" aria-label="Destination categories">
        {state.destinationCategories.map((d, i) => tabButton(d.id, d.name, counts[d.id], i))}
        {tabButton(UNASSIGNED, 'Unassigned', unassignedCount, tabIds.length - 2)}
        {tabButton(TEMP, state.tempFilters.length > 1 ? 'Temp Filters' : 'Temp Filter', activeFilter.termKeys.length, tabIds.length - 1)}
      </div>

      <div
        id="ltb-config-panel"
        role="tabpanel"
        aria-labelledby={`ltb-tab-${active}`}
        class={`ltb-config-panel${isTempTab ? ' is-temp' : ''}`}
        data-destination={activeDestination ?? undefined}
      >
        <header class="ltb-config-header">
          <h2 class="ltb-h2 ltb-config-title">
            <span class="ltb-swatch ltb-swatch-lg" aria-hidden="true" />
            {activeDestination ? destinationName(activeDestination) : isTempTab ? `Temporary filter: ${activeFilter.name}${state.tempFilterEnabled ? '' : ' (not applied)'}` : 'Unassigned'}
            {isTempTab && activeFilter.termKeys.length > 0 && (
              <button type="button" class="ltb-btn ltb-btn-small ltb-config-title-action" onClick={() => dispatch({ type: 'CLEAR_TEMP_FILTER' })}>
                Clear filter
              </button>
            )}
          </h2>
          {isTempTab && <TempFilterSwitcher manage />}
          {!isTempTab && (
            <p class="ltb-muted">
              {isUnassignedTab
                ? 'Terms not yet assigned to any destination category. Click a term to choose where it belongs.'
                : 'Click a term to assign it here. Click a highlighted term to unassign it. Terms colored for another category ask for confirmation before moving.'}
            </p>
          )}
        </header>

        <div class="ltb-config-toolbar">
          <label class="ltb-search">
            <span class="ltb-visually-hidden">Search terms</span>
            <input
              type="search"
              placeholder="Search terms…"
              value={search}
              onInput={(e) => dispatch({ type: 'SET_TERM_SEARCH', search: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
          <label class="ltb-checkbox ltb-toggle">
            <input
              type="checkbox"
              checked={categoriesOnly}
              onChange={(e) => dispatch({ type: 'SET_CATEGORIES_ONLY', categoriesOnly: (e.currentTarget as HTMLInputElement).checked })}
            />
            Categories only
          </label>
          {!isUnassignedTab && (
            <label class="ltb-checkbox ltb-toggle">
              <input
                type="checkbox"
                checked={termSort === 'selected-first'}
                onChange={(e) =>
                  dispatch({ type: 'SET_TERM_SORT', termSort: (e.currentTarget as HTMLInputElement).checked ? 'selected-first' : 'alpha' })
                }
              />
              Selected first
            </label>
          )}
          <span class="ltb-muted" role="status" aria-live="polite">
            {inventory.status === 'loading' && `Loading terms (${progress})… `}
            {visible.length.toLocaleString()} {isUnassignedTab ? 'unassigned ' : ''}term{visible.length === 1 ? '' : 's'}
            {isTempTab && ` · ${activeFilter.termKeys.length} in ${activeFilter.name}`}
            {search && ' match'}
            {categoriesOnly && ' (source categories only)'}
            {!inventory.complete && inventory.status !== 'error' && ' so far'}
          </span>
        </div>

        {inventory.status === 'error' && <ErrorState message={`Could not load the term inventory: ${inventory.error}`} onRetry={retry} />}
        {inventory.status === 'loading' && visible.length === 0 && <LoadingState label="Loading terms…" />}
        {isUnassignedTab && inventory.complete && visible.length === 0 && <p class="ltb-muted">Every eligible term is assigned.</p>}

        <div class="ltb-term-list">
          {visible.slice(0, limit).map((t) => {
            const owner = state.assignments[t.key];
            const dup = (duplicates.get(t.name.toLowerCase()) ?? 0) > 1;
            const inTemp = tempSet.has(t.key);
            const tooltip = owner && owner !== active ? `Assigned to ${destinationName(owner)}` : null;
            return (
              <TermButton
                key={t.key}
                term={t}
                selected={isTempTab ? inTemp : owner === active}
                owner={isTempTab && inTemp ? null : (owner ?? null)}
                tone={isTempTab ? 'filter' : 'destination'}
                tooltip={tooltip}
                detail={dup ? `Source ID ${t.id} (${t.taxonomy === 'category' ? 'category' : 'tag'})` : null}
                onClick={(term) => onTermClick(term)}
              />
            );
          })}
        </div>
        {limit < visible.length && (
          <div ref={sentinel} class="ltb-load-more">
            <button type="button" class="ltb-btn" onClick={() => setLimit((l) => Math.min(l + CHUNK, visible.length))}>
              Show more ({(visible.length - limit).toLocaleString()} remaining)
            </button>
          </div>
        )}
      </div>

      <ImportExport />

      {pending && (
        <MoveTermDialog
          move={pending}
          term={state.termsByKey[pending.termKey]}
          onCancel={() => closeDialog('CANCEL_MOVE')}
          onConfirm={() => closeDialog('CONFIRM_MOVE')}
        />
      )}
      {assigning && <AssignTermDialog term={assigning} destinations={state.destinationCategories} onChoose={closeAssign} onCancel={() => closeAssign()} />}
    </section>
  );
}
