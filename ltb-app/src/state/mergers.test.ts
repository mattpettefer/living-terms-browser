import { describe, expect, it } from 'vitest';
import { createInitialState, reducer } from './reducer';
import { combineMergers, getMergerIndex, groupTerms, validateMergers } from './mergers';
import { getOverviewResults, getSelectionResults, getVisibleTerms } from './selectors';
import { normalizePost, normalizeTerm } from '../services/normalize';
import { buildConfigDocument, validateImport, wrapAsShortcode, unwrapShortcode } from '../services/persistence';
import { getExcludedPosts } from '../components/ExcludedPostsCount';
import type { Merger } from './types';

const merger: Merger = { id: 'lead', name: 'Leadership', slug: 'leadership', termKeys: ['category:1', 'post_tag:1'] };
function fixture() {
  const state = createInitialState({ baseUrl: 'https://test.example', postsRestBase: 'posts' });
  const terms = [normalizeTerm({ id: 1, name: 'Leadership', slug: 'leadership', count: 13 }, 'category'), normalizeTerm({ id: 1, name: 'leadership', slug: 'leadership-tag', count: 14 }, 'post_tag'), normalizeTerm({ id: 2, name: 'Other', slug: 'other', count: 1 }, 'category')];
  state.termsByKey = Object.fromEntries(terms.map((t) => [t.key, t])); state.termOrder = terms.map((t) => t.key);
  const posts = Array.from({ length: 27 }, (_, i) => normalizePost({ id: i + 1, categories: i < 13 ? [1] : [], tags: i >= 13 ? [1] : [], title: { rendered: 'Post ' + i }, link: '', date: '', modified: '' }));
  state.postsById = Object.fromEntries(posts.map((p) => [p.id, p])); state.postOrder = posts.map((p) => p.id);
  state.postIndex = { ...state.postIndex, status: 'success', complete: true };
  state.mergers = [merger];
  return state;
}

describe('merger display derivation', () => {
  it('combines 13 and 14 disjoint posts into 27 and deduplicates overlapping posts', () => {
    let state = fixture();
    expect(getMergerIndex(state).counts.get('lead')).toBe(27);
    state = { ...state, postsById: { ...state.postsById, 1: { ...state.postsById[1]!, termKeys: ['category:1', 'post_tag:1', 'post_tag:1'] } } };
    expect(getMergerIndex(state).counts.get('lead')).toBe(27);
    state = { ...state, postOrder: [...state.postOrder, 1] };
    expect(getMergerIndex(state).counts.get('lead')).toBe(27);
    state = { ...state, mergers: [{ ...merger, termKeys: ['category:1'] }] };
    expect(getMergerIndex(state).counts.get('lead')).toBe(13);
  });
  it('retains first position, gathers later siblings, and adds missing companions without changing keys', () => {
    const state = fixture();
    const keys = ['post_tag:1', 'category:2', 'category:1'] as const;
    const groups = groupTerms(state, keys);
    expect(groups.map((g) => g.id)).toEqual(['merged:lead', 'category:2']);
    expect(groups[0]!.keys).toEqual(merger.termKeys);
    expect(groupTerms(state, ['category:1'])[0]!.present.has('post_tag:1')).toBe(false);
    expect(keys).toEqual(['post_tag:1', 'category:2', 'category:1']);
  });
  it('uses union counts for Minimum posts but keeps the source category gate', () => {
    const state = fixture();
    expect(getVisibleTerms(state, '', false, 20).map((t) => t.key)).toEqual(merger.termKeys);
    expect(getVisibleTerms(state, '', false, 28)).toEqual([]);
    const categoryResults = getVisibleTerms(state, '', true, 20);
    expect(categoryResults.map((t) => t.key)).toEqual(['category:1']);
    expect(groupTerms(state, categoryResults.map((t) => t.key))[0]!.keys).toEqual(merger.termKeys);
    const tagOnly = { ...state, mergers: [{ ...merger, termKeys: ['post_tag:1'] as Merger['termKeys'] }] };
    expect(getVisibleTerms(tagOnly, '', true, 14)).toEqual([]);
  });
  it('does not claim a total before the complete index or when post term data is incomplete', () => {
    let state = fixture();
    state = { ...state, postIndex: { ...state.postIndex, complete: false } };
    expect(getMergerIndex(state).counts.get('lead')).toBeNull();
    expect(getVisibleTerms(state, '', false, 20)).toHaveLength(2);
    state = { ...state, postIndex: { ...state.postIndex, complete: true }, postsById: { ...state.postsById, 1: { ...state.postsById[1]!, termsComplete: false } } };
    expect(getMergerIndex(state).counts.get('lead')).toBeNull();
  });
  it('never changes OR, AND, NOT, destination matching, explicit selections or excluded-post requirements', () => {
    const state = fixture();
    state.mergers = [];
    state.assignments = { 'category:1': 'campus-life' };
    state.postSelections = { 1: 'campus-life', 14: 'campus-life' };
    for (const operator of ['OR', 'AND'] as const) for (const notTermKeys of [[], ['post_tag:1']] as Merger['termKeys'][]) {
      state.tempFilters = [{ ...state.tempFilters[0]!, termKeys: merger.termKeys, notTermKeys, operator }];
      const before = [getOverviewResults(state, 'campus-life'), getSelectionResults(state, 'campus-life'), getExcludedPosts(state, new Set(merger.termKeys), 2)];
      const grouped = reducer(state, { type: 'SAVE_MERGER', merger });
      expect([getOverviewResults(grouped, 'campus-life'), getSelectionResults(grouped, 'campus-life'), getExcludedPosts(grouped, new Set(merger.termKeys), 2)]).toEqual(before);
      expect(grouped.tempFilters).toBe(state.tempFilters);
      expect(grouped.assignments).toBe(state.assignments);
      expect(grouped.postSelections).toBe(state.postSelections);
      expect(reducer(grouped, { type: 'REMOVE_MERGER', id: merger.id }).mergers).toEqual([]);
    }
  });
});

describe('merger persistence', () => {
  const ctx = { sourceUrl: 'https://test.example', knownTermKeys: null, excludedTermKeys: new Set<never>() };
  it('round-trips definitions with raw filter IDs and operators through export and reload', () => {
    const state = fixture();
    state.tempFilters[0]!.termKeys = ['category:1']; state.tempFilters[0]!.operator = 'AND';
    const doc = buildConfigDocument({ sourceUrl: ctx.sourceUrl, mergers: state.mergers, assignments: state.assignments, excludedTermKeys: [], unresolvedAssignments: [], tempFilters: { filters: state.tempFilters, activeId: state.activeTempFilterId } });
    const imported = validateImport(JSON.parse(unwrapShortcode(wrapAsShortcode(JSON.stringify(doc)))), ctx);
    expect(imported.mergers).toEqual([merger]);
    const restored = createInitialState(state.source, imported, imported.tempFilters);
    expect(restored.mergers).toEqual([merger]); expect(restored.tempFilters[0]!.termKeys).toEqual(['category:1']); expect(restored.tempFilters[0]!.operator).toBe('AND');
  });
  it('accepts legacy documents and preserves existing mergers when the field is absent', () => {
    const state = fixture();
    const imported = validateImport({ schemaVersion: 1, assignments: {} }, ctx);
    expect(imported.mergers).toBeNull();
    expect(reducer(state, { type: 'IMPORT_CONFIG', ...imported, replace: true }).mergers).toEqual([merger]);
    expect(reducer(state, { type: 'IMPORT_CONFIG', ...imported, mergers: [], replace: true }).mergers).toEqual([]);
  });
  it('rejects duplicate membership, duplicate slugs, malformed members and empty mergers', () => {
    expect(() => validateMergers([{ ...merger, termKeys: [] }])).toThrow(/at least one/);
    expect(() => validateMergers([{ ...merger, termKeys: ['merged:lead'] }])).toThrow(/Invalid/);
    expect(() => combineMergers([merger], [{ ...merger, id: 'second', slug: 'second' }])).toThrow(/only one/);
    expect(() => validateMergers([merger, { ...merger, id: 'second', termKeys: ['category:2'] }])).toThrow(/unique destination slug/);
    expect(combineMergers([merger], [{ ...merger, name: 'Renamed' }])[0]!.name).toBe('Renamed');
  });
});
