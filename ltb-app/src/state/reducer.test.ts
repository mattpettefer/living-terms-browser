import { describe, expect, it } from 'vitest';
import { createInitialState, reducer, type Action } from './reducer';
import { getPostMatches, getPostOverlap, getTermWarning, getVisibleTerms, sortSelectedFirst } from './selectors';
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

  it('invalidates destination queries but keeps All Posts queries and post records', () => {
    let s = withInventory();
    s = run(
      s,
      { type: 'QUERY_START', queryKey: 'all|p', requestId: 'q1', page: 1 },
      { type: 'QUERY_SUCCESS', queryKey: 'all|p', requestId: 'q1', page: 1, posts: [post(1, [])], totalPosts: 1, totalPages: 1 },
      { type: 'QUERY_START', queryKey: 'athletics|c:|t:20', requestId: 'q2', page: 1 },
      { type: 'QUERY_SUCCESS', queryKey: 'athletics|c:|t:20', requestId: 'q2', page: 1, posts: [post(2, ['post_tag:20'])], totalPosts: 1, totalPages: 1 },
      { type: 'ASSIGN_TERM', termKey: 'post_tag:20', destination: 'athletics' },
    );
    expect(Object.keys(s.queriesByKey)).toEqual(['all|p']);
    expect(s.postsById[2]).toBeDefined();
  });
});

describe('stale responses', () => {
  it('ignores a query response whose requestId is outdated', () => {
    let s = withInventory();
    s = run(
      s,
      { type: 'QUERY_START', queryKey: 'k', requestId: 'old', page: 1 },
      { type: 'QUERY_START', queryKey: 'k', requestId: 'new', page: 1 },
      { type: 'QUERY_SUCCESS', queryKey: 'k', requestId: 'old', page: 1, posts: [post(1, [])], totalPosts: 1, totalPages: 1 },
    );
    expect(s.queriesByKey.k?.status).toBe('loading');
    expect(s.queriesByKey.k?.postIds).toEqual([]);
  });

  it('does not overwrite cached body with a summary of the same revision', () => {
    let s = withInventory();
    const full = { ...post(1, []), contentHtml: '<p>body</p>', contentLoaded: true };
    s = run(
      s,
      { type: 'ARTICLE_START', postId: 1, requestId: 'a1' },
      { type: 'ARTICLE_SUCCESS', postId: 1, requestId: 'a1', post: full },
      { type: 'QUERY_START', queryKey: 'all|p', requestId: 'q', page: 1 },
      { type: 'QUERY_SUCCESS', queryKey: 'all|p', requestId: 'q', page: 1, posts: [post(1, [])], totalPosts: 1, totalPages: 1 },
    );
    expect(s.postsById[1]?.contentHtml).toBe('<p>body</p>');
    expect(s.postsById[1]?.contentLoaded).toBe(true);
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
    expect(sortSelectedFirst(alpha, s.assignments, 'athletics').map((t) => t.key)).toEqual(['post_tag:40', 'post_tag:20', 'category:10']);
    expect(sortSelectedFirst(alpha, s.assignments, 'university-news')).toBe(alpha);
  });
});
