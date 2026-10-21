import { describe, expect, it } from 'vitest';
import { createInitialState, newTempFilter, normalizeTempFilters, reducer, type Action } from './reducer';
import { applyTempFilter, getActiveTempFilter, getOverviewResults, getPostMatches, getPostOverlap, getTermWarning, getVisibleTerms, sortSelectedFirst } from './selectors';
import type { AppState, PostRecord, SourceTerm } from './types';

const source = { baseUrl: 'https://example.test', postsRestBase: 'posts' };

function term(taxonomy: 'category' | 'post_tag', id: number, name: string): SourceTerm {
  return { key: `${taxonomy}:${id}`, id, taxonomy, name, slug: name.toLowerCase().replace(/\s+/g, '-'), sourceCount: 1 };
}

function post(id: number, termKeys: PostRecord['termKeys']): PostRecord {
  return {
    id,
    title: `Post ${id}`,
    excerptHtml: '',
    sourceUrl: '',
    date: '2024-01-01T00:00:00',
    modified: '2024-01-01T00:00:00',
    featuredMediaId: 0,
    imageUrl: null,
    termKeys,
    termsComplete: true,
    contentLoaded: false,
  };
}

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state);
}

function withInventory(): AppState {
  const s = createInitialState(source);
  return run(
    s,
    { type: 'TERMS_LOAD_START', requestId: 'r1' },
    {
      type: 'TERMS_PAGE_LOADED',
      requestId: 'r1',
      loadedPages: 1,
      totalPages: 1,
      terms: [term('category', 10, 'Nutrition'), term('post_tag', 20, 'Football'), term('category', 30, 'Podcast'), term('post_tag', 40, 'Nutrition')],
    },
    { type: 'TERMS_LOAD_COMPLETE', requestId: 'r1', excludedTermKeys: ['category:30'] },
  );
}

describe('assignment transitions', () => {
  it('assigns an unassigned term immediately and bumps revision', () => {
    const s = run(withInventory(), { type: 'ASSIGN_TERM', termKey: 'category:10', destination: 'health-wellness' });
    expect(s.assignments['category:10']).toBe('health-wellness');
    expect(s.mappingRevision).toBe(1);
    expect(s.persistence.status).toBe('unsaved');
  });

  it('unassigns a term owned by the current tab', () => {
    const s = run(
      withInventory(),
      { type: 'ASSIGN_TERM', termKey: 'category:10', destination: 'health-wellness' },
      { type: 'UNASSIGN_TERM', termKey: 'category:10' },
    );
    expect(s.assignments['category:10']).toBeUndefined();
    expect(s.mappingRevision).toBe(2);
  });

  it('refuses to assign excluded terms', () => {
    const s = run(withInventory(), { type: 'ASSIGN_TERM', termKey: 'category:30', destination: 'athletics' });
    expect(s.assignments['category:30']).toBeUndefined();
    expect(s.mappingRevision).toBe(0);
  });

  it('cancel leaves state untouched; confirm moves exactly once and clears old owner', () => {
    const base = run(withInventory(), { type: 'ASSIGN_TERM', termKey: 'category:10', destination: 'health-wellness' });
    const opened = run(base, { type: 'OPEN_MOVE', termKey: 'category:10', fromCategory: 'health-wellness', toCategory: 'academics-careers' });
    expect(opened.ui.pendingTermMove).not.toBeNull();
    const cancelled = run(opened, { type: 'CANCEL_MOVE' });
    expect(cancelled.assignments).toEqual(base.assignments);
    expect(cancelled.mappingRevision).toBe(base.mappingRevision);
    const moved = run(opened, { type: 'CONFIRM_MOVE' });
    expect(moved.assignments['category:10']).toBe('academics-careers');
    expect(Object.values(moved.assignments).filter((d) => d === 'health-wellness')).toHaveLength(0);
    expect(moved.mappingRevision).toBe(base.mappingRevision + 1);
    expect(moved.ui.pendingTermMove).toBeNull();
  });

  it('rechecks ownership at confirmation time', () => {
    const opened = run(
      withInventory(),
      { type: 'ASSIGN_TERM', termKey: 'category:10', destination: 'health-wellness' },
      { type: 'OPEN_MOVE', termKey: 'category:10', fromCategory: 'health-wellness', toCategory: 'academics-careers' },
    );
    // Ownership changes behind the dialog's back (e.g. via import).
    const changed = run(opened, { type: 'IMPORT_CONFIG', assignments: { 'category:10': 'athletics' }, unresolved: [], replace: true });
    const reopened = run({ ...changed, ui: { ...changed.ui, pendingTermMove: opened.ui.pendingTermMove } }, { type: 'CONFIRM_MOVE' });
    expect(reopened.assignments['category:10']).toBe('athletics');
    expect(reopened.ui.pendingTermMove?.fromCategory).toBe('athletics');
  });

  it('keeps post records across assignment changes; overview results recompute immediately', () => {
    let s = withInventory();
    s = run(
      s,
      { type: 'INDEX_LOAD_START', requestId: 'i1' },
      { type: 'INDEX_PAGE_LOADED', requestId: 'i1', posts: [post(1, []), post(2, ['post_tag:20'])], loadedPages: 1, totalPages: 1, totalPosts: 2 },
      { type: 'INDEX_LOAD_COMPLETE', requestId: 'i1' },
    );
    expect(getOverviewResults(s, 'athletics').emptyAssignment).toBe(true);
    s = run(s, { type: 'ASSIGN_TERM', termKey: 'post_tag:20', destination: 'athletics' });
    expect(s.postsById[2]).toBeDefined();
    expect(getOverviewResults(s, 'athletics').matching.map((p) => p.id)).toEqual([2]);
    expect(getOverviewResults(s, 'all').matching.map((p) => p.id)).toEqual([2, 1]);
  });
});

describe('post index', () => {
  it('ignores pages from an outdated request and orders newest first with id tie-break', () => {
    let s = withInventory();
    const older = { ...post(5, []), date: '2023-01-01T00:00:00' };
    s = run(
      s,
      { type: 'INDEX_LOAD_START', requestId: 'old' },
      { type: 'INDEX_LOAD_START', requestId: 'new' },
      { type: 'INDEX_PAGE_LOADED', requestId: 'old', posts: [post(9, [])], loadedPages: 1, totalPages: 1, totalPosts: 1 },
      { type: 'INDEX_PAGE_LOADED', requestId: 'new', posts: [older, post(1, [])], loadedPages: 1, totalPages: 2, totalPosts: 3 },
      { type: 'INDEX_PAGE_LOADED', requestId: 'new', posts: [post(2, [])], loadedPages: 2, totalPages: 2, totalPosts: 3 },
      { type: 'INDEX_LOAD_COMPLETE', requestId: 'new' },
    );
    expect(s.postsById[9]).toBeUndefined();
    expect(s.postOrder).toEqual([2, 1, 5]);
    expect(s.postIndex.complete).toBe(true);
  });

  it('does not overwrite a cached article body with an index summary of the same revision', () => {
    let s = withInventory();
    const full = { ...post(1, []), contentHtml: '<p>body</p>', contentLoaded: true };
    s = run(
      s,
      { type: 'ARTICLE_START', postId: 1, requestId: 'a1' },
      { type: 'ARTICLE_SUCCESS', postId: 1, requestId: 'a1', post: full },
      { type: 'INDEX_LOAD_START', requestId: 'i' },
      { type: 'INDEX_PAGE_LOADED', requestId: 'i', posts: [post(1, [])], loadedPages: 1, totalPages: 1, totalPosts: 1 },
    );
    expect(s.postsById[1]?.contentHtml).toBe('<p>body</p>');
    expect(s.postsById[1]?.contentLoaded).toBe(true);
  });

  it('overview results combine destination matching with the temporary filter and count posts once', () => {
    let s = withInventory();
    s = run(
      s,
      { type: 'INDEX_LOAD_START', requestId: 'i' },
      {
        type: 'INDEX_PAGE_LOADED',
        requestId: 'i',
        posts: [post(1, ['category:10', 'post_tag:40']), post(2, ['post_tag:20']), post(3, ['category:30']), post(4, ['category:10', 'post_tag:20'])],
        loadedPages: 1,
        totalPages: 1,
        totalPosts: 4,
      },
      { type: 'INDEX_LOAD_COMPLETE', requestId: 'i' },
      { type: 'ASSIGN_TERM', termKey: 'category:10', destination: 'health-wellness' },
      { type: 'ASSIGN_TERM', termKey: 'post_tag:40', destination: 'health-wellness' },
      { type: 'ASSIGN_TERM', termKey: 'post_tag:20', destination: 'athletics' },
    );
    const hw = getOverviewResults(s, 'health-wellness');
    expect(hw.matching.map((p) => p.id)).toEqual([4, 1]);
    expect(hw.primaryCount).toBe(2);
    s = run(s, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:20' });
    const filtered = getOverviewResults(s, 'health-wellness');
    expect(filtered.matching.map((p) => p.id)).toEqual([4]);
    expect(filtered.primaryCount).toBe(2);
    expect(getOverviewResults(s, 'all').matching.map((p) => p.id)).toEqual([4, 2]);
  });
});

describe('overlap selectors', () => {
  const assignments = { 'category:10': 'health-wellness', 'post_tag:40': 'health-wellness', 'post_tag:20': 'athletics' } as const;
  const excluded = new Set<'category:30'>(['category:30']);

  it('counts a post once per destination even with several matching terms', () => {
    const m = getPostMatches(post(1, ['category:10', 'post_tag:40']), assignments, excluded);
    expect(Object.keys(m)).toEqual(['health-wellness']);
    expect(m['health-wellness']).toHaveLength(2);
    expect(getPostOverlap(post(1, ['category:10', 'post_tag:40']), assignments, excluded)).toBe(false);
  });

  it('flags overlap across destinations and explains each red term', () => {
    const p = post(2, ['category:10', 'post_tag:20', 'category:30']);
    expect(getPostOverlap(p, assignments, excluded)).toBe(true);
    const w = getTermWarning(p, 'post_tag:20', assignments, excluded);
    expect(w?.destination).toBe('athletics');
    expect(w?.otherDestinations).toEqual(['health-wellness']);
    expect(w?.explanation).toBe('Assigned to Athletics. This article also matches Health & Wellness.');
    expect(getTermWarning(p, 'category:30', assignments, excluded)).toBeNull();
  });

  it('excluded terms never match', () => {
    const m = getPostMatches(post(3, ['category:30']), { ...assignments, 'category:30': 'athletics' }, excluded);
    expect(Object.keys(m)).toEqual([]);
  });

  it('unassigned terms produce no match', () => {
    expect(getPostMatches(post(4, ['category:999']), assignments, excluded)).toEqual({});
  });
});

describe('visible terms', () => {
  it('excludes excluded terms, keeps same-name terms distinct, sorts alphabetically', () => {
    const s = withInventory();
    const names = getVisibleTerms(s, '').map((t) => `${t.key}:${t.name}`);
    expect(names).toEqual(['post_tag:20:Football', 'category:10:Nutrition', 'post_tag:40:Nutrition']);
    expect(getVisibleTerms(s, 'nutr')).toHaveLength(2);
    expect(getVisibleTerms(s, '', true).map((t) => t.key)).toEqual(['category:10']);
    expect(getVisibleTerms(s, 'nutr', true)).toHaveLength(1);
  });

  it('selected-first sort moves only the current tab\'s terms up, keeping alphabetical order', () => {
    const s = run(
      withInventory(),
      { type: 'ASSIGN_TERM', termKey: 'post_tag:40', destination: 'athletics' },
      { type: 'ASSIGN_TERM', termKey: 'category:10', destination: 'campus-life' },
    );
    const alpha = getVisibleTerms(s, '');
    expect(sortSelectedFirst(alpha, (t) => s.assignments[t.key] === 'athletics').map((t) => t.key)).toEqual(['post_tag:40', 'post_tag:20', 'category:10']);
    expect(sortSelectedFirst(alpha, (t) => s.assignments[t.key] === 'university-news')).toBe(alpha);
  });
});

describe('temporary filter', () => {
  const active = (s: AppState) => getActiveTempFilter(s).termKeys;

  it('always starts with one filter and toggles membership independently of assignments', () => {
    let s = run(withInventory(), { type: 'ASSIGN_TERM', termKey: 'category:10', destination: 'athletics' });
    expect(s.tempFilters).toHaveLength(1);
    s = run(s, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:10' }, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:20' });
    expect(active(s)).toEqual(['category:10', 'post_tag:20']);
    expect(s.assignments['category:10']).toBe('athletics');
    s = run(s, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:10' }, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:30' });
    expect(active(s)).toEqual(['post_tag:20']); // excluded terms are refused
    expect(active(run(s, { type: 'CLEAR_TEMP_FILTER' }))).toEqual([]);
  });

  it('adds, switches, renames and removes filters but never drops the last one', () => {
    let s = run(withInventory(), { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:20' });
    const first = s.activeTempFilterId;
    s = run(s, { type: 'ADD_TEMP_FILTER' });
    expect(s.tempFilters.map((f) => f.name)).toEqual(['Filter 1', 'Filter 2']);
    expect(s.activeTempFilterId).not.toBe(first);
    expect(active(s)).toEqual([]);
    s = run(s, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:10' }, { type: 'RENAME_TEMP_FILTER', filterId: s.activeTempFilterId, name: ' Sports ' });
    expect(getActiveTempFilter(s).name).toBe('Sports');
    expect(active(s)).toEqual(['category:10']);
    s = run(s, { type: 'SET_ACTIVE_TEMP_FILTER', filterId: first });
    expect(active(s)).toEqual(['post_tag:20']);
    s = run(s, { type: 'REMOVE_TEMP_FILTER', filterId: first });
    expect(s.tempFilters).toHaveLength(1);
    expect(getActiveTempFilter(s).name).toBe('Sports');
    expect(run(s, { type: 'REMOVE_TEMP_FILTER', filterId: s.activeTempFilterId }).tempFilters).toHaveLength(1);
  });

  it('normalizes a persisted snapshot with a stale active id', () => {
    const snap = normalizeTempFilters({ filters: [newTempFilter('A'), newTempFilter('B')], activeId: 'missing' });
    expect(snap.activeId).toBe(snap.filters[0]!.id);
    expect(normalizeTempFilters(null).filters).toHaveLength(1);
  });

  it('applyTempFilter requires every term (each added term narrows) and is a no-op when empty', () => {
    const posts = [post(1, ['category:10']), post(2, ['post_tag:20', 'category:30']), post(3, ['category:10', 'post_tag:20'])];
    expect(applyTempFilter(posts, [])).toBe(posts);
    expect(applyTempFilter(posts, ['post_tag:20']).map((p) => p.id)).toEqual([2, 3]);
    expect(applyTempFilter(posts, ['category:10', 'post_tag:20']).map((p) => p.id)).toEqual([3]);
    expect(applyTempFilter(posts, ['category:999'])).toEqual([]);
  });
});
