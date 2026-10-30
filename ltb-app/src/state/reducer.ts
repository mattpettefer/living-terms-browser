import { selectedDestinations, packSelection } from './postSelections';
import { combineMergers, validateMergers, prepareMergerSave } from './mergers';
import { mergeFinalTerms, validateFinalTerms } from './finalTerms';
import type { Merger, FinalTerms } from './types';
import { DESTINATIONS } from './destinations';
import { getOverviewResults, getSelectionResults } from './selectors';
import type {
  AppState,
  Assignments,
  ConfigTab,
  SelectionsCategory,
  DestinationId,
  DestinationExclusions,
  FilterOperator,
  PostRecord,
  PostSelections,
  SourceTerm,
  TempFilter,
  TermKey,
  TermSort,
  UnresolvedAssignment,
} from './types';

export type Action =
  | { type: 'NAVIGATE'; view: 'final'; category?: DestinationId | 'all' }
  | { type: 'SET_FINAL_TERMS'; destination: DestinationId | 'all'; termKeys: TermKey[]; allowed: boolean }
  | { type: 'NAVIGATE'; view: 'mergers' }
  | { type: 'SAVE_MERGER'; merger: Merger; moves?: Partial<Record<TermKey, string>> }
  | { type: 'REMOVE_MERGER'; id: string }
  | { type: 'NAVIGATE'; view: 'overview' | 'selections' }
  | { type: 'NAVIGATE'; view: 'config'; category?: ConfigTab }
  | { type: 'NAVIGATE'; view: 'article'; postId: number }
  | { type: 'DESELECT_ALL'; destination: DestinationId; view: 'overview' | 'selections' }
  | { type: 'SELECT_ALL_OVERVIEW'; destination: DestinationId; replaceExisting?: boolean }
  | { type: 'TOGGLE_POST_DESTINATION'; postId: number; destination: DestinationId }
  | { type: 'SELECT_POST_DESTINATION'; postId: number; destination: DestinationId | null }
  | { type: 'SET_SELECTIONS_CATEGORY'; category: SelectionsCategory }
  | { type: 'SET_SELECTIONS_SCROLL'; scrollY: number }
  | { type: 'SET_OVERVIEW_CATEGORY'; category: DestinationId | 'all' }
  | { type: 'SET_OVERVIEW_SCROLL'; scrollY: number }
  | { type: 'SET_CONFIG_CATEGORY'; category: ConfigTab }
  | { type: 'SET_TERM_SEARCH'; search: string }
  | { type: 'SET_MIN_TERM_POST_COUNT'; count: number }
  | { type: 'SET_CATEGORIES_ONLY'; categoriesOnly: boolean }
  | { type: 'SET_TERM_SORT'; termSort: TermSort }
  | { type: 'TERMS_LOAD_START'; requestId: string }
  | { type: 'TERMS_PAGE_LOADED'; requestId: string; terms: SourceTerm[]; loadedPages: number; totalPages: number | null }
  | { type: 'TERMS_LOAD_COMPLETE'; requestId: string; excludedTermKeys: TermKey[] }
  | { type: 'TERMS_LOAD_ERROR'; requestId: string; error: string }
  | { type: 'TERMS_LOAD_RESET' }
  | { type: 'TERMS_RESOLVED'; terms: SourceTerm[] }
  | { type: 'INDEX_LOAD_START'; requestId: string }
  | { type: 'INDEX_PAGE_LOADED'; requestId: string; posts: PostRecord[]; loadedPages: number; totalPages: number | null; totalPosts: number | null }
  | { type: 'INDEX_LOAD_COMPLETE'; requestId: string }
  | { type: 'INDEX_LOAD_ERROR'; requestId: string; error: string }
  | { type: 'INDEX_LOAD_RESET' }
  | { type: 'MEDIA_RESOLVED'; media: Record<number, string | null> }
  | { type: 'SHOW_MORE_POSTS'; pageSize: number; view?: 'overview' | 'selections' }
  | { type: 'ARTICLE_START'; postId: number; requestId: string }
  | { type: 'ARTICLE_SUCCESS'; postId: number; requestId: string; post: PostRecord }
  | { type: 'ARTICLE_ERROR'; postId: number; requestId: string; error: string }
  | { type: 'TOGGLE_DESTINATION_NOT_TERM'; destination: DestinationId; termKey: TermKey }
  | { type: 'SELECT_DESTINATION_TERMS'; termKeys: TermKey[]; destination: DestinationId; line: 'match' | 'not' }
  | { type: 'ASSIGN_TERM'; termKey: TermKey; destination: DestinationId }
  | { type: 'UNASSIGN_TERM'; termKey: TermKey }
  | { type: 'OPEN_MOVE'; termKey: TermKey; fromCategory: DestinationId; toCategory: DestinationId }
  | { type: 'CANCEL_MOVE' }
  | { type: 'CONFIRM_MOVE' }
  | { type: 'IMPORT_CONFIG'; mergers?: Merger[] | null; finalTerms?: FinalTerms | null; assignments: Assignments; unresolved: UnresolvedAssignment[]; replace: boolean; destinationExclusions?: DestinationExclusions | null; postSelections?: PostSelections | null; tempFilters?: TempFilterSnapshot | null }
  | { type: 'TOGGLE_TEMP_FILTER_NOT_TERM'; termKey: TermKey; filterId?: string }
  | { type: 'TOGGLE_TEMP_FILTER_TERM'; termKey: TermKey; filterId?: string }
  | { type: 'SELECT_TEMP_FILTER_TERMS'; termKeys: TermKey[]; line: 'match' | 'not' }
  | { type: 'SET_TEMP_FILTER_OPERATOR'; filterId: string; operator: FilterOperator }
  | { type: 'CLEAR_TEMP_FILTER'; filterId?: string }
  | { type: 'ADD_TEMP_FILTER'; name?: string }
  | { type: 'REMOVE_TEMP_FILTER'; filterId: string }
  | { type: 'RENAME_TEMP_FILTER'; filterId: string; name: string }
  | { type: 'SET_ACTIVE_TEMP_FILTER'; filterId: string }
  | { type: 'SET_TEMP_FILTER_ENABLED'; enabled: boolean }
  | { type: 'PERSIST_STATUS'; status: AppState['persistence']['status']; error?: string | null };

export interface TempFilterSnapshot {
  filters: TempFilter[];
  activeId: string;
  enabled?: boolean;
}

export function newTempFilter(name: string, termKeys: TermKey[] = []): TempFilter {
  return { id: `tf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, termKeys, notTermKeys: [], operator: 'OR' };
}

/** Guarantee at least one filter and a valid active ID. */
export function normalizeTempFilters(snapshot?: Partial<TempFilterSnapshot> | null): TempFilterSnapshot {
  const filters: TempFilter[] = snapshot?.filters?.length
    ? snapshot.filters.map((f) => ({ ...f, termKeys: f.termKeys.filter((key) => !(f.notTermKeys ?? []).includes(key)), notTermKeys: f.notTermKeys ?? [], operator: f.operator === 'AND' ? 'AND' : 'OR' }))
    : [newTempFilter('Filter 1')];
  const activeId = filters.some((f) => f.id === snapshot?.activeId) ? snapshot!.activeId! : filters[0]!.id;
  return { filters, activeId, enabled: snapshot?.enabled ?? true };
}

export function createInitialState(
  source: AppState['source'],
  saved?: { mergers?: Merger[] | null; finalTerms?: FinalTerms | null; assignments: Assignments; unresolved: UnresolvedAssignment[]; destinationExclusions?: DestinationExclusions | null; postSelections?: PostSelections | null },
  tempFilters?: Partial<TempFilterSnapshot> | null,
  pageSeed: string | null = null,
): AppState {
  const tf = normalizeTempFilters(tempFilters);
  return {
    source,
    mergers: saved?.mergers ?? [],
    finalTerms: saved?.finalTerms ?? {},
    pageSeed,
    destinationCategories: [...DESTINATIONS],
    termsByKey: {},
    termOrder: [],
    excludedTermKeys: [],
    termsInventory: { status: 'idle', error: null, requestId: null, complete: false, fetchedAt: null, loadedPages: 0, totalPages: null },
    assignments: saved?.assignments ?? {},
    destinationExclusions: saved?.destinationExclusions ?? {},
    postSelections: saved?.postSelections ?? {},
    mappingRevision: 0,
    tempFilters: tf.filters,
    activeTempFilterId: tf.activeId,
    tempFilterEnabled: tf.enabled ?? true,
    unresolvedAssignments: saved?.unresolved ?? [],
    postsById: {},
    postOrder: [],
    postIndex: { status: 'idle', error: null, requestId: null, complete: false, loadedPages: 0, totalPages: null, totalPosts: null, fetchedAt: null },
    mediaById: {},
    articleRequestsById: {},
    ui: {
      view: 'overview',
      finalCategory: 'all',
      listView: 'overview',
      selectionsCategory: 'all',
      selectionsPage: 1,
      selectionsScrollY: 0,
      overviewCategory: 'all',
      overviewPage: 1,
      overviewScrollY: 0,
      activeConfigCategory: 'campus-life',
      termSearch: '',
      categoriesOnly: true,
      minTermPostCount: 0,
      termSort: 'selected-first',
      selectedPostId: null,
      pendingTermMove: null,
    },
    persistence: { status: 'saved', error: null, lastSavedAt: null },
  };
}

export const OVERVIEW_PAGE_SIZE = 24;

function mergePost(existing: PostRecord | undefined, incoming: PostRecord): PostRecord {
  if (!existing) return incoming;
  const changed = existing.modified !== incoming.modified;
  const keepBody = !changed && existing.contentLoaded && !incoming.contentLoaded;
  return {
    ...existing,
    ...incoming,
    imageUrl: incoming.imageUrl ?? existing.imageUrl,
    termKeys: incoming.termsComplete || !existing.termsComplete ? incoming.termKeys : existing.termKeys,
    termsComplete: incoming.termsComplete || existing.termsComplete,
    contentHtml: keepBody ? existing.contentHtml : incoming.contentHtml,
    contentLoaded: keepBody ? existing.contentLoaded : incoming.contentLoaded,
  };
}

function mergePosts(postsById: AppState['postsById'], posts: PostRecord[]): AppState['postsById'] {
  const next = { ...postsById };
  for (const p of posts) next[p.id] = mergePost(next[p.id], p);
  return next;
}

/** Newest first, ties broken by higher ID first, so merged pages produce a deterministic order. */
function sortPostIds(postsById: AppState['postsById'], ids: Iterable<number>): number[] {
  return [...ids].sort((a, b) => {
    const pa = postsById[a]!;
    const pb = postsById[b]!;
    return pb.date.localeCompare(pa.date) || b - a;
  });
}

function mergeTerms(state: AppState, terms: SourceTerm[]): Pick<AppState, 'termsByKey' | 'termOrder'> {
  const termsByKey = { ...state.termsByKey };
  let added = false;
  for (const t of terms) {
    if (!termsByKey[t.key]) added = true;
    // Embedded article terms may omit count; retain the inventory total.
    termsByKey[t.key] = { ...t, sourceCount: t.sourceCount ?? termsByKey[t.key]?.sourceCount ?? null };
  }
  if (!added) return { termsByKey, termOrder: state.termOrder };
  const termOrder = (Object.keys(termsByKey) as TermKey[]).sort((a, b) => {
    const ta = termsByKey[a]!;
    const tb = termsByKey[b]!;
    return ta.name.localeCompare(tb.name, undefined, { sensitivity: 'base' }) || ta.taxonomy.localeCompare(tb.taxonomy) || ta.id - tb.id;
  });
  return { termsByKey, termOrder };
}

function updateTempFilter(state: AppState, filterId: string, fn: (f: TempFilter) => TempFilter): AppState {
  let changed = false;
  const tempFilters = state.tempFilters.map((f) => {
    if (f.id !== filterId) return f;
    const next = fn(f);
    if (next !== f) changed = true;
    return next;
  });
  return changed ? { ...state, tempFilters } : state;
}

function nextFilterName(filters: readonly TempFilter[]): string {
  const taken = new Set(filters.map((f) => f.name));
  for (let n = filters.length + 1; ; n++) if (!taken.has(`Filter ${n}`)) return `Filter ${n}`;
}

/** Commit an assignment change: bump revision and mark unsaved. Overview lists derive from the index, so nothing to invalidate. */
function commitAssignments(state: AppState, assignments: Assignments): AppState {
  return {
    ...state,
    assignments,
    destinationExclusions: Object.fromEntries(Object.entries(state.destinationExclusions).map(([destination, keys]) => [destination, keys.filter((key) => assignments[key] !== destination)])),
    mappingRevision: state.mappingRevision + 1,
    ui: { ...state.ui, pendingTermMove: null },
    persistence: { ...state.persistence, status: 'unsaved' },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FINAL_TERMS': {
      const finalTerms = { ...state.finalTerms };
      let changed = false;
      for (const destination of state.destinationCategories) {
        if (action.destination !== 'all' && destination.id !== action.destination) continue;
        const previous = state.finalTerms[destination.id] ?? [];
        const keys = new Set(previous);
        for (const key of action.termKeys) action.allowed ? keys.add(key) : keys.delete(key);
        if (keys.size === previous.length && previous.every(key => keys.has(key))) continue;
        finalTerms[destination.id] = [...keys]; changed = true;
      }
      return changed ? { ...state, finalTerms, persistence: { ...state.persistence, status: 'unsaved', error: null } } : state;
    }
    case 'SAVE_MERGER': {
      const mergers = prepareMergerSave(state.mergers, action.merger, action.moves);
      return { ...state, mergers, persistence: { ...state.persistence, status: 'unsaved' } };
    }
    case 'REMOVE_MERGER':
      return { ...state, mergers: state.mergers.filter((m) => m.id !== action.id), persistence: { ...state.persistence, status: 'unsaved' } };
    case 'NAVIGATE': {
      const ui = { ...state.ui, pendingTermMove: null, view: action.view };
      if (action.view === 'overview' || action.view === 'selections') ui.listView = action.view;
      if (action.view === 'config' && action.category) ui.activeConfigCategory = action.category;
      if (action.view === 'final' && action.category) ui.finalCategory = action.category;
      if (action.view === 'article') ui.selectedPostId = action.postId;
      return { ...state, ui };
    }
    case 'SET_SELECTIONS_CATEGORY':
      return state.ui.selectionsCategory === action.category ? state : { ...state, ui: { ...state.ui, selectionsCategory: action.category, selectionsPage: 1, selectionsScrollY: 0 } };
    case 'SET_SELECTIONS_SCROLL':
      return { ...state, ui: { ...state.ui, selectionsScrollY: action.scrollY } };
    case 'DESELECT_ALL': {
      if (!state.postIndex.complete || state.postIndex.status !== 'success') return state;
      const { matching } = action.view === 'selections' ? getSelectionResults(state, action.destination) : getOverviewResults(state, action.destination);
      const postSelections = { ...state.postSelections };
      let changed = false;
      for (const post of matching) {
        const selected = selectedDestinations(state, post.id);
        if (!selected.includes(action.destination)) continue;
        const remaining = packSelection(selected.filter(d => d !== action.destination));
        if (remaining) postSelections[post.id] = remaining;
        else delete postSelections[post.id];
        changed = true;
      }
      return changed ? { ...state, postSelections, persistence: { ...state.persistence, status: 'unsaved', error: null } } : state;
    }
    case 'SELECT_ALL_OVERVIEW': {
      // Never commit a partial selection while source pages are still loading.
      if (!state.postIndex.complete || state.postIndex.status !== 'success') return state;
      const { matching } = getOverviewResults(state, action.destination);
      const postSelections = { ...state.postSelections };
      let changed = false;
      for (const post of matching) {
        if (postSelections[post.id] === action.destination || (!action.replaceExisting && postSelections[post.id] != null)) continue;
        postSelections[post.id] = action.destination;
        changed = true;
      }
      return changed ? { ...state, postSelections, persistence: { ...state.persistence, status: 'unsaved', error: null } } : state;
    }
    case 'TOGGLE_POST_DESTINATION': {
      if (!Number.isSafeInteger(action.postId) || action.postId <= 0 || !state.destinationCategories.some(d => d.id === action.destination)) return state;
      const selected = selectedDestinations(state, action.postId);
      const removing = selected.includes(action.destination);
      if (!removing && selected.length >= 2) return state;
      const next = packSelection(removing ? selected.filter(d => d !== action.destination) : [...selected, action.destination]);
      const postSelections = { ...state.postSelections };
      if (next) postSelections[action.postId] = next;
      else delete postSelections[action.postId];
      return { ...state, postSelections, persistence: { ...state.persistence, status: 'unsaved', error: null } };
    }
    case 'SELECT_POST_DESTINATION': {
      if (!Number.isSafeInteger(action.postId) || action.postId <= 0) return state;
      if ((state.postSelections[action.postId] ?? null) === action.destination) return state;
      const postSelections = { ...state.postSelections };
      if (action.destination) postSelections[action.postId] = action.destination;
      else delete postSelections[action.postId];
      return { ...state, postSelections, persistence: { ...state.persistence, status: 'unsaved', error: null } };
    }
    case 'SET_OVERVIEW_CATEGORY':
      if (state.ui.overviewCategory === action.category) return state;
      return { ...state, ui: { ...state.ui, overviewCategory: action.category, overviewPage: 1, overviewScrollY: 0 } };
    case 'SET_OVERVIEW_SCROLL':
      return { ...state, ui: { ...state.ui, overviewScrollY: action.scrollY } };
    case 'SET_CONFIG_CATEGORY':
      return { ...state, ui: { ...state.ui, activeConfigCategory: action.category, pendingTermMove: null } };
    case 'SET_TERM_SEARCH':
      return { ...state, ui: { ...state.ui, termSearch: action.search } };
    case 'SET_CATEGORIES_ONLY':
      return { ...state, ui: { ...state.ui, categoriesOnly: action.categoriesOnly } };
    case 'SET_MIN_TERM_POST_COUNT':
      return { ...state, ui: { ...state.ui, minTermPostCount: Number.isFinite(action.count) ? Math.max(0, Math.min(20, Math.trunc(action.count))) : 0 } };
    case 'SET_TERM_SORT':
      return { ...state, ui: { ...state.ui, termSort: action.termSort } };

    case 'TERMS_LOAD_START':
      return {
        ...state,
        termsInventory: { ...state.termsInventory, status: 'loading', error: null, requestId: action.requestId },
      };
    case 'TERMS_PAGE_LOADED': {
      if (state.termsInventory.requestId !== action.requestId) return state;
      return {
        ...state,
        ...mergeTerms(state, action.terms),
        termsInventory: { ...state.termsInventory, loadedPages: action.loadedPages, totalPages: action.totalPages },
      };
    }
    case 'TERMS_LOAD_COMPLETE':
      if (state.termsInventory.requestId !== action.requestId) return state;
      return {
        ...state,
        excludedTermKeys: action.excludedTermKeys,
        termsInventory: { ...state.termsInventory, status: 'success', complete: true, fetchedAt: Date.now() },
      };
    case 'TERMS_LOAD_ERROR':
      if (state.termsInventory.requestId !== action.requestId) return state;
      return { ...state, termsInventory: { ...state.termsInventory, status: 'error', error: action.error } };
    case 'TERMS_LOAD_RESET':
      return { ...state, termsInventory: { ...state.termsInventory, status: 'idle', error: null, requestId: null } };
    case 'TERMS_RESOLVED':
      return { ...state, ...mergeTerms(state, action.terms) };

    case 'INDEX_LOAD_START':
      return { ...state, postIndex: { ...state.postIndex, status: 'loading', error: null, requestId: action.requestId } };
    case 'INDEX_PAGE_LOADED': {
      if (state.postIndex.requestId !== action.requestId) return state;
      const postsById = mergePosts(state.postsById, action.posts);
      const ids = new Set(state.postOrder);
      for (const p of action.posts) ids.add(p.id);
      return {
        ...state,
        postsById,
        postOrder: sortPostIds(postsById, ids),
        postIndex: { ...state.postIndex, loadedPages: action.loadedPages, totalPages: action.totalPages, totalPosts: action.totalPosts },
      };
    }
    case 'INDEX_LOAD_COMPLETE':
      if (state.postIndex.requestId !== action.requestId) return state;
      return { ...state, postIndex: { ...state.postIndex, status: 'success', complete: true, fetchedAt: Date.now() } };
    case 'INDEX_LOAD_ERROR':
      if (state.postIndex.requestId !== action.requestId) return state;
      return { ...state, postIndex: { ...state.postIndex, status: 'error', error: action.error } };
    case 'INDEX_LOAD_RESET':
      return { ...state, postIndex: { ...state.postIndex, status: 'idle', error: null, requestId: null } };
    case 'MEDIA_RESOLVED':
      return { ...state, mediaById: { ...state.mediaById, ...action.media } };
    case 'SHOW_MORE_POSTS':
      if (action.view === 'selections') return { ...state, ui: { ...state.ui, selectionsPage: state.ui.selectionsPage + 1 } };
      return { ...state, ui: { ...state.ui, overviewPage: state.ui.overviewPage + 1 } };

    case 'ARTICLE_START':
      return {
        ...state,
        articleRequestsById: { ...state.articleRequestsById, [action.postId]: { status: 'loading', error: null, requestId: action.requestId } },
      };
    case 'ARTICLE_SUCCESS': {
      if (state.articleRequestsById[action.postId]?.requestId !== action.requestId) return state;
      return {
        ...state,
        postsById: mergePosts(state.postsById, [action.post]),
        articleRequestsById: { ...state.articleRequestsById, [action.postId]: { status: 'success', error: null, requestId: action.requestId } },
      };
    }
    case 'ARTICLE_ERROR': {
      if (state.articleRequestsById[action.postId]?.requestId !== action.requestId) return state;
      return {
        ...state,
        articleRequestsById: { ...state.articleRequestsById, [action.postId]: { status: 'error', error: action.error, requestId: action.requestId } },
      };
    }

    case 'TOGGLE_DESTINATION_NOT_TERM': {
      if (state.excludedTermKeys.includes(action.termKey)) return state;
      const keys = state.destinationExclusions[action.destination] ?? [];
      const removing = keys.includes(action.termKey);
      const assignments = { ...state.assignments };
      if (!removing && assignments[action.termKey] === action.destination) delete assignments[action.termKey];
      return {
        ...commitAssignments(state, assignments),
        destinationExclusions: { ...state.destinationExclusions, [action.destination]: removing ? keys.filter((key) => key !== action.termKey) : [...keys, action.termKey] },
      };
    }
    case 'SELECT_DESTINATION_TERMS': {
      const keys = [...new Set(action.termKeys)].filter((key) => state.termsByKey[key] && !state.excludedTermKeys.includes(key));
      if (!keys.length) return state;
      const assignments = { ...state.assignments };
      const existingNot = state.destinationExclusions[action.destination] ?? [];
      if (action.line === 'match') {
        if (keys.every((key) => assignments[key] === action.destination && !existingNot.includes(key))) return state;
        for (const key of keys) assignments[key] = action.destination;
        return commitAssignments(state, assignments);
      }
      if (keys.every((key) => existingNot.includes(key) && assignments[key] !== action.destination)) return state;
      for (const key of keys) if (assignments[key] === action.destination) delete assignments[key];
      return { ...commitAssignments(state, assignments), destinationExclusions: { ...state.destinationExclusions, [action.destination]: [...new Set([...existingNot, ...keys])] } };
    }
    case 'ASSIGN_TERM': {
      if (state.excludedTermKeys.includes(action.termKey)) return state;
      if (state.assignments[action.termKey] === action.destination) return state;
      return commitAssignments(state, { ...state.assignments, [action.termKey]: action.destination });
    }
    case 'UNASSIGN_TERM': {
      if (!state.assignments[action.termKey]) return state;
      const { [action.termKey]: _removed, ...rest } = state.assignments;
      return commitAssignments(state, rest);
    }
    case 'OPEN_MOVE':
      return { ...state, ui: { ...state.ui, pendingTermMove: { termKey: action.termKey, fromCategory: action.fromCategory, toCategory: action.toCategory } } };
    case 'CANCEL_MOVE':
      return state.ui.pendingTermMove ? { ...state, ui: { ...state.ui, pendingTermMove: null } } : state;
    case 'CONFIRM_MOVE': {
      const move = state.ui.pendingTermMove;
      if (!move) return state;
      const current = state.assignments[move.termKey];
      if (current !== move.fromCategory) {
        // Ownership changed while the dialog was open: refresh the confirmation rather than moving from an unexpected owner.
        if (!current) return commitAssignments(state, { ...state.assignments, [move.termKey]: move.toCategory });
        return { ...state, ui: { ...state.ui, pendingTermMove: { ...move, fromCategory: current } } };
      }
      return commitAssignments(state, { ...state.assignments, [move.termKey]: move.toCategory });
    }

    case 'IMPORT_CONFIG': {
      const assignments: Assignments = action.replace ? {} : { ...state.assignments };
      for (const [k, v] of Object.entries(action.assignments) as [TermKey, DestinationId][]) {
        if (!state.excludedTermKeys.includes(k)) assignments[k] = v;
      }
      const next = { ...commitAssignments(state, assignments), unresolvedAssignments: action.unresolved };
      if (action.finalTerms != null) next.finalTerms = action.replace ? validateFinalTerms(action.finalTerms) : mergeFinalTerms(state.finalTerms, validateFinalTerms(action.finalTerms));
      if (action.mergers != null) next.mergers = action.replace ? validateMergers(action.mergers) : combineMergers(state.mergers, action.mergers);
      if (action.destinationExclusions != null) {
        next.destinationExclusions = action.replace ? { ...action.destinationExclusions } : { ...state.destinationExclusions };
        if (!action.replace) for (const [destination, keys] of Object.entries(action.destinationExclusions) as [DestinationId, TermKey[]][]) {
          next.destinationExclusions[destination] = [...new Set([...(next.destinationExclusions[destination] ?? []), ...keys])];
        }
      }
      // Imported NOT rules take precedence over positive rules for the same destination.
      for (const [destination, keys] of Object.entries(next.destinationExclusions)) for (const key of keys) {
        if (next.assignments[key] === destination) delete next.assignments[key];
      }
      if (action.postSelections != null) next.postSelections = action.replace ? { ...action.postSelections } : { ...state.postSelections, ...action.postSelections };
      if (action.tempFilters) {
        const tf = normalizeTempFilters(action.tempFilters);
        return { ...next, tempFilters: tf.filters, activeTempFilterId: tf.activeId, tempFilterEnabled: tf.enabled ?? true };
      }
      return next;
    }

    case 'TOGGLE_TEMP_FILTER_TERM': {
      if (state.excludedTermKeys.includes(action.termKey)) return state;
      const id = action.filterId ?? state.activeTempFilterId;
      const next = updateTempFilter(state, id, (f) => ({
        ...f,
        notTermKeys: (f.notTermKeys ?? []).filter((key) => key !== action.termKey),
        termKeys: f.termKeys.includes(action.termKey) ? f.termKeys.filter((k) => k !== action.termKey) : [...f.termKeys, action.termKey],
      }));
      return next === state || id !== state.activeTempFilterId || state.tempFilterEnabled ? next : { ...next, tempFilterEnabled: true };
    }
    case 'TOGGLE_TEMP_FILTER_NOT_TERM': {
      if (state.excludedTermKeys.includes(action.termKey)) return state;
      const id = action.filterId ?? state.activeTempFilterId;
      const next = updateTempFilter(state, id, (f) => ({
        ...f,
        termKeys: f.termKeys.filter((key) => key !== action.termKey),
        notTermKeys: (f.notTermKeys ?? []).includes(action.termKey)
          ? (f.notTermKeys ?? []).filter((key) => key !== action.termKey)
          : [...(f.notTermKeys ?? []), action.termKey],
      }));
      return next === state || id !== state.activeTempFilterId || state.tempFilterEnabled ? next : { ...next, tempFilterEnabled: true };
    }
    case 'SELECT_TEMP_FILTER_TERMS': {
      const excluded = new Set(state.excludedTermKeys);
      const keys = [...new Set(action.termKeys)].filter((key) => state.termsByKey[key] && !excluded.has(key));
      if (!keys.length) return state;
      const selected = new Set(keys);
      const next = updateTempFilter(state, state.activeTempFilterId, (filter) => {
        const existing = action.line === 'match' ? filter.termKeys : filter.notTermKeys ?? [];
        const other = action.line === 'match' ? filter.notTermKeys ?? [] : filter.termKeys;
        const combined = [...new Set([...existing, ...keys])];
        const remaining = other.filter((key) => !selected.has(key));
        if (combined.length === existing.length && remaining.length === other.length) return filter;
        return action.line === 'match'
          ? { ...filter, termKeys: combined, notTermKeys: remaining }
          : { ...filter, notTermKeys: combined, termKeys: remaining };
      });
      return next.tempFilterEnabled ? next : { ...next, tempFilterEnabled: true };
    }
    case 'SET_TEMP_FILTER_OPERATOR': {
      const next = updateTempFilter(state, action.filterId, (f) => f.operator === action.operator ? f : { ...f, operator: action.operator });
      return next === state || action.filterId !== state.activeTempFilterId || !state.tempFilterEnabled
        ? next
        : { ...next, ui: { ...next.ui, overviewPage: 1, overviewScrollY: 0 } };
    }
    case 'CLEAR_TEMP_FILTER':
      return updateTempFilter(state, action.filterId ?? state.activeTempFilterId, (f) => (f.termKeys.length || f.notTermKeys?.length ? { ...f, termKeys: [], notTermKeys: [] } : f));
    case 'ADD_TEMP_FILTER': {
      const name = action.name?.trim() || nextFilterName(state.tempFilters);
      const filter = newTempFilter(name);
      return { ...state, tempFilters: [...state.tempFilters, filter], activeTempFilterId: filter.id };
    }
    case 'REMOVE_TEMP_FILTER': {
      if (state.tempFilters.length <= 1) return state; // Always keep at least one.
      const idx = state.tempFilters.findIndex((f) => f.id === action.filterId);
      if (idx < 0) return state;
      const tempFilters = state.tempFilters.filter((f) => f.id !== action.filterId);
      const activeTempFilterId =
        state.activeTempFilterId === action.filterId ? (tempFilters[Math.min(idx, tempFilters.length - 1)]!.id) : state.activeTempFilterId;
      return { ...state, tempFilters, activeTempFilterId };
    }
    case 'RENAME_TEMP_FILTER': {
      const name = action.name.trim();
      if (!name) return state;
      return updateTempFilter(state, action.filterId, (f) => (f.name === name ? f : { ...f, name }));
    }
    case 'SET_ACTIVE_TEMP_FILTER':
      if (!state.tempFilters.some((f) => f.id === action.filterId)) return state;
      if (state.activeTempFilterId === action.filterId && state.tempFilterEnabled) return state;
      return { ...state, activeTempFilterId: action.filterId, tempFilterEnabled: true };
    case 'SET_TEMP_FILTER_ENABLED':
      return state.tempFilterEnabled === action.enabled ? state : { ...state, tempFilterEnabled: action.enabled };

    case 'PERSIST_STATUS':
      return {
        ...state,
        persistence: {
          status: action.status,
          error: action.error ?? null,
          lastSavedAt: action.status === 'saved' ? Date.now() : state.persistence.lastSavedAt,
        },
      };
    default:
      return state;
  }
}
