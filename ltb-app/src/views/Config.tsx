import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MoveTermDialog } from '../components/MoveTermDialog';
import { TermButton } from '../components/TermButton';
import { ErrorState, LoadingState } from '../components/States';
import { navigate } from '../effects/useHashRouter';
import { useTermInventory } from '../effects/useTermInventory';
import { destinationName } from '../state/destinations';
import { useStore } from '../state/provider';
import { getAssignmentCounts, getDuplicateNameCounts, getVisibleTerms } from '../state/selectors';
import type { DestinationId, SourceTerm } from '../state/types';
import { ImportExport } from './ImportExport';

const CHUNK = 200;

export function Config() {
  const { state, dispatch } = useStore();
  const { retry } = useTermInventory();
  const active = state.ui.activeConfigCategory;
  const search = state.ui.termSearch;
  const categoriesOnly = state.ui.categoriesOnly;
  const inventory = state.termsInventory;
  const counts = getAssignmentCounts(state);
  const duplicates = useMemo(() => getDuplicateNameCounts(state), [state.termOrder, state.termsByKey]);
  const visible = useMemo(
    () => getVisibleTerms(state, search, categoriesOnly),
    [state.termOrder, state.termsByKey, state.excludedTermKeys, search, categoriesOnly],
  );

  // Incremental rendering: grow the rendered window as the user scrolls near the end.
  const [limit, setLimit] = useState(CHUNK);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setLimit(CHUNK), [search, active, categoriesOnly]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= visible.length) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((l) => Math.min(l + CHUNK, visible.length)));
    io.observe(el);
    return () => io.disconnect();
  }, [limit, visible.length]);

  const lastTrigger = useRef<HTMLElement | null>(null);
  const onTermClick = (term: SourceTerm, ev?: Event) => {
    lastTrigger.current = (ev?.currentTarget as HTMLElement) ?? (document.activeElement as HTMLElement);
    const current = state.assignments[term.key];
    if (!current) dispatch({ type: 'ASSIGN_TERM', termKey: term.key, destination: active });
    else if (current === active) dispatch({ type: 'UNASSIGN_TERM', termKey: term.key });
    else dispatch({ type: 'OPEN_MOVE', termKey: term.key, fromCategory: current, toCategory: active });
  };
  const closeDialog = (type: 'CANCEL_MOVE' | 'CONFIRM_MOVE') => {
    dispatch({ type });
    requestAnimationFrame(() => lastTrigger.current?.focus());
  };

  const onTabKey = (e: KeyboardEvent, index: number) => {
    const ids = state.destinationCategories.map((d) => d.id);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % ids.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next === null) return;
    e.preventDefault();
    navigate({ view: 'config', category: ids[next]! });
    (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  };

  const pending = state.ui.pendingTermMove;
  const progress = inventory.totalPages ? `${inventory.loadedPages}/${inventory.totalPages} pages` : `${inventory.loadedPages} pages`;

  return (
    <section class="ltb-config">
      <div class="ltb-tabs" role="tablist" aria-label="Destination categories">
        {state.destinationCategories.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            id={`ltb-tab-${d.id}`}
            aria-selected={active === d.id}
            aria-controls="ltb-config-panel"
            tabIndex={active === d.id ? 0 : -1}
            class={`ltb-tab${active === d.id ? ' is-active' : ''}`}
            onClick={() => navigate({ view: 'config', category: d.id })}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {d.name}
            <span class="ltb-tab-count">{counts[d.id]}</span>
          </button>
        ))}
      </div>

      <div id="ltb-config-panel" role="tabpanel" aria-labelledby={`ltb-tab-${active}`} class="ltb-config-panel">
        <header class="ltb-config-header">
          <h2 class="ltb-h2">{destinationName(active)}</h2>
          <p class="ltb-muted">
            Click a term to assign it here. Click a highlighted term to unassign it. Terms owned by another category ask for confirmation before moving.
          </p>
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
          <span class="ltb-muted" role="status" aria-live="polite">
            {inventory.status === 'loading' && `Loading terms (${progress})… `}
            {visible.length.toLocaleString()} term{visible.length === 1 ? '' : 's'}
            {search && ' match'}
            {categoriesOnly && ' (source categories only)'}
            {!inventory.complete && inventory.status !== 'error' && ' so far'}
          </span>
        </div>

        {inventory.status === 'error' && <ErrorState message={`Could not load the term inventory: ${inventory.error}`} onRetry={retry} />}
        {inventory.status === 'loading' && visible.length === 0 && <LoadingState label="Loading terms…" />}

        <div class="ltb-term-list">
          {visible.slice(0, limit).map((t) => {
            const owner = state.assignments[t.key];
            const dup = (duplicates.get(t.name.toLowerCase()) ?? 0) > 1;
            const tooltip = owner && owner !== active ? `Assigned to ${destinationName(owner)}` : null;
            return (
              <TermButton
                key={t.key}
                term={t}
                selected={owner === active}
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
    </section>
  );
}

export type { DestinationId };
