import { DESTINATIONS } from './destinations';
import type {
  AppState,
  Assignments,
  ConfigTab,
  DestinationId,
  FilterOperator,
  PostRecord,
  SourceTerm,
  TempFilter,
  TermKey,
  TermSort,
  UnresolvedAssignment,
} from './types';

export type Action =
  | { type: 'NAVIGATE'; view: 'overview' }
  | { type: 'NAVIGATE'; view: 'config'; category?: ConfigTab }
  | { type: 'NAVIGATE'; view: 'article'; postId: number }
  | { type: 'SET_OVERVIEW_CATEGORY'; category: DestinationId | 'all' }
  | { type: 'SET_OVERVIEW_SCROLL'; scrollY: number }
  | { type: 'SET_CONFIG_CATEGORY'; category: ConfigTab }
  | { type: 'SET_TERM_SEARCH'; search: string }
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
  | { type: 'SHOW_MORE_POSTS'; pageSize: number }
  | { type: 'ARTICLE_START'; postId: number; requestId: string }
  | { type: 'ARTICLE_SUCCESS'; postId: number; requestId: string; post: PostRecord }
  | { type: 'ARTICLE_ERROR'; postId: number; requestId: string; error: string }
  | { type: 'ASSIGN_TERM'; termKey: TermKey; destination: DestinationId }
  | { type: 'UNASSIGN_TERM'; termKey: TermKey }
  | { type: 'OPEN_MOVE'; termKey: TermKey; fromCategory: DestinationId; toCategory: DestinationId }
  | { type: 'CANCEL_MOVE' }
  | { type: 'CONFIRM_MOVE' }
  | { type: 'IMPORT_CONFIG'; assignments: Assignments; unresolved: UnresolvedAssignment[]; replace: boolean; tempFilters?: TempFilterSnapshot | null }
  | { type: 'TOGGLE_TEMP_FILTER_TERM'; termKey: TermKey; filterId?: string }
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
  return { id: `tf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, termKeys, operator: 'OR' };
}

/** Guarantee at least one filter and a valid active ID. */
export function normalizeTempFilters(snapshot?: Partial<TempFilterSnapshot> | null): TempFilterSnapshot {
  const filters: TempFilter[] = snapshot?.filters?.length
    ? snapshot.filters.map((f) => ({ ...f, operator: f.operator === 'AND' ? 'AND' : 'OR' }))
    : [newTempFilter('Filter 1')];
  const activeId = filters.some((f) => f.id === snapshot?.activeId) ? snapshot!.activeId! : filters[0]!.id;
  return { filters, activeId, enabled: snapshot?.enabled ?? true };
}

export function createInitialState(
  source: AppState['source'],
  saved?: { assignments: Assignments; unresolved: UnresolvedAssignment[] },
  tempFilters?: Partial<TempFilterSnapshot> | null,
  pageSeed: string | null = null,
): AppState {
  const tf = normalizeTempFilters(tempFilters);
  return {
    source,
    pageSeed,
    destinationCategories: [...DESTINATIONS],
    termsByKey: {},
    termOrder: [],
    excludedTermKeys: [],
    termsInventory: { status: 'idle', error: null, requestId: null, complete: false, fetchedAt: null, loadedPages: 0, totalPages: null },
    assignments: saved?.assignments ?? {},
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
      overviewCategory: 'all',
      overviewPage: 1,
      overviewScrollY: 0,
      activeConfigCategory: 'campus-life',
      termSearch: '',
      categoriesOnly: true,
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
    termsByKey[t.key] = t;
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
    mappingRevision: state.mappingRevision + 1,
    ui: { ...state.ui, pendingTermMove: null },
    persistence: { ...state.persistence, status: 'unsaved' },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'NAVIGATE': {
      const ui = { ...state.ui, pendingTermMove: null, view: action.view };
      if (action.view === 'config' && action.category) ui.activeConfigCategory = action.category;
      if (action.view === 'article') ui.selectedPostId = action.postId;
      return { ...state, ui };
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
        termKeys: f.termKeys.includes(action.termKey) ? f.termKeys.filter((k) => k !== action.termKey) : [...f.termKeys, action.termKey],
      }));
      return next === state || id !== state.activeTempFilterId || state.tempFilterEnabled ? next : { ...next, tempFilterEnabled: true };
    }
    case 'SET_TEMP_FILTER_OPERATOR': {
      const next = updateTempFilter(state, action.filterId, (f) => f.operator === action.operator ? f : { ...f, operator: action.operator });
      return next === state || action.filterId !== state.activeTempFilterId || !state.tempFilterEnabled
        ? next
        : { ...next, ui: { ...next.ui, overviewPage: 1, overviewScrollY: 0 } };
    }
    case 'CLEAR_TEMP_FILTER':
      return updateTempFilter(state, action.filterId ?? state.activeTempFilterId, (f) => (f.termKeys.length ? { ...f, termKeys: [] } : f));
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
