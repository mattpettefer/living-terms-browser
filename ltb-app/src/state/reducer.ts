import { DESTINATIONS } from './destinations';
import type {
  AppState,
  Assignments,
  DestinationId,
  PostRecord,
  SourceTerm,
  TermKey,
  UnresolvedAssignment,
} from './types';

export type Action =
  | { type: 'NAVIGATE'; view: 'overview' }
  | { type: 'NAVIGATE'; view: 'config'; category?: DestinationId }
  | { type: 'NAVIGATE'; view: 'article'; postId: number }
  | { type: 'SET_OVERVIEW_CATEGORY'; category: DestinationId | 'all' }
  | { type: 'SET_OVERVIEW_SCROLL'; scrollY: number }
  | { type: 'SET_CONFIG_CATEGORY'; category: DestinationId }
  | { type: 'SET_TERM_SEARCH'; search: string }
  | { type: 'SET_CATEGORIES_ONLY'; categoriesOnly: boolean }
  | { type: 'TERMS_LOAD_START'; requestId: string }
  | { type: 'TERMS_PAGE_LOADED'; requestId: string; terms: SourceTerm[]; loadedPages: number; totalPages: number | null }
  | { type: 'TERMS_LOAD_COMPLETE'; requestId: string; excludedTermKeys: TermKey[] }
  | { type: 'TERMS_LOAD_ERROR'; requestId: string; error: string }
  | { type: 'TERMS_LOAD_RESET' }
  | { type: 'TERMS_RESOLVED'; terms: SourceTerm[] }
  | { type: 'QUERY_START'; queryKey: string; requestId: string; page: number }
  | {
      type: 'QUERY_SUCCESS';
      queryKey: string;
      requestId: string;
      page: number;
      posts: PostRecord[];
      totalPosts: number | null;
      totalPages: number | null;
    }
  | { type: 'QUERY_ERROR'; queryKey: string; requestId: string; error: string }
  | { type: 'ARTICLE_START'; postId: number; requestId: string }
  | { type: 'ARTICLE_SUCCESS'; postId: number; requestId: string; post: PostRecord }
  | { type: 'ARTICLE_ERROR'; postId: number; requestId: string; error: string }
  | { type: 'ASSIGN_TERM'; termKey: TermKey; destination: DestinationId }
  | { type: 'UNASSIGN_TERM'; termKey: TermKey }
  | { type: 'OPEN_MOVE'; termKey: TermKey; fromCategory: DestinationId; toCategory: DestinationId }
  | { type: 'CANCEL_MOVE' }
  | { type: 'CONFIRM_MOVE' }
  | { type: 'IMPORT_CONFIG'; assignments: Assignments; unresolved: UnresolvedAssignment[]; replace: boolean }
  | { type: 'PERSIST_STATUS'; status: AppState['persistence']['status']; error?: string | null };

export function createInitialState(source: AppState['source'], saved?: { assignments: Assignments; unresolved: UnresolvedAssignment[] }): AppState {
  return {
    source,
    destinationCategories: [...DESTINATIONS],
    termsByKey: {},
    termOrder: [],
    excludedTermKeys: [],
    termsInventory: { status: 'idle', error: null, requestId: null, complete: false, fetchedAt: null, loadedPages: 0, totalPages: null },
    assignments: saved?.assignments ?? {},
    mappingRevision: 0,
    unresolvedAssignments: saved?.unresolved ?? [],
    postsById: {},
    queriesByKey: {},
    articleRequestsById: {},
    ui: {
      view: 'overview',
      overviewCategory: 'all',
      overviewPage: 1,
      overviewScrollY: 0,
      activeConfigCategory: 'campus-life',
      termSearch: '',
      categoriesOnly: false,
      selectedPostId: null,
      pendingTermMove: null,
    },
    persistence: { status: 'saved', error: null, lastSavedAt: null },
  };
}

export const ALL_QUERY_PREFIX = 'all|';

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

/** Commit an assignment change: bump revision, drop destination-filtered result lists, mark unsaved. */
function commitAssignments(state: AppState, assignments: Assignments): AppState {
  const queriesByKey: AppState['queriesByKey'] = {};
  for (const [k, v] of Object.entries(state.queriesByKey)) if (k.startsWith(ALL_QUERY_PREFIX)) queriesByKey[k] = v;
  return {
    ...state,
    assignments,
    mappingRevision: state.mappingRevision + 1,
    queriesByKey,
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

    case 'QUERY_START': {
      const prev = state.queriesByKey[action.queryKey];
      const entry = prev ?? {
        status: 'idle',
        error: null,
        requestId: null,
        postIds: [],
        totalPosts: null,
        totalPages: null,
        page: 0,
        fetchedAt: null,
        mappingRevision: state.mappingRevision,
      };
      return {
        ...state,
        queriesByKey: {
          ...state.queriesByKey,
          [action.queryKey]: { ...entry, status: 'loading', error: null, requestId: action.requestId },
        },
      };
    }
    case 'QUERY_SUCCESS': {
      const prev = state.queriesByKey[action.queryKey];
      if (!prev || prev.requestId !== action.requestId) return state;
      const incomingIds = action.posts.map((p) => p.id);
      const postIds = action.page <= 1 ? incomingIds : [...prev.postIds, ...incomingIds.filter((id) => !prev.postIds.includes(id))];
      return {
        ...state,
        postsById: mergePosts(state.postsById, action.posts),
        queriesByKey: {
          ...state.queriesByKey,
          [action.queryKey]: {
            ...prev,
            status: 'success',
            error: null,
            postIds,
            totalPosts: action.totalPosts,
            totalPages: action.totalPages,
            page: action.page,
            fetchedAt: Date.now(),
            mappingRevision: state.mappingRevision,
          },
        },
      };
    }
    case 'QUERY_ERROR': {
      const prev = state.queriesByKey[action.queryKey];
      if (!prev || prev.requestId !== action.requestId) return state;
      return { ...state, queriesByKey: { ...state.queriesByKey, [action.queryKey]: { ...prev, status: 'error', error: action.error } } };
    }

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
      return { ...commitAssignments(state, assignments), unresolvedAssignments: action.unresolved };
    }

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
