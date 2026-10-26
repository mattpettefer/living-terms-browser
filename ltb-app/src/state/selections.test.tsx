import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostCard } from '../components/PostCard';
import { usePersistence } from '../effects/usePersistence';
import { parseHash, routeToHash } from '../effects/useHashRouter';
import { buildConfigDocument, localStorageAdapter, validateImport, wrapAsShortcode, unwrapShortcode } from '../services/persistence';
import { StoreProvider, useStore } from './provider';
import { createInitialState, reducer } from './reducer';
import { getOverviewResults, getSelectionResults } from './selectors';
import type { PostRecord } from './types';

const source = { baseUrl: 'https://selections.test', postsRestBase: 'posts' };
const post: PostRecord = { id: 42, title: 'A campus athlete', excerptHtml: '', sourceUrl: 'https://selections.test/post', date: '2026-10-26', modified: '', featuredMediaId: 0, imageUrl: null, termKeys: ['category:1', 'category:2'], termsComplete: true, contentLoaded: false };
const ctx = { sourceUrl: source.baseUrl, excludedTermKeys: new Set<never>(), knownTermKeys: null };
function fixture() {
  const state = createInitialState(source);
  state.postsById = { 42: post };
  state.postOrder = [42];
  state.assignments = { 'category:1': 'athletics', 'category:2': 'campus-life' };
  state.postIndex.complete = true;
  return state;
}

describe('explicit destination selections', () => {
  it('replaces or clears the single selection without changing term matches', () => {
    let state = reducer(fixture(), { type: 'SELECT_POST_DESTINATION', postId: 42, destination: 'university-news' });
    expect(getSelectionResults(state, 'university-news').matching).toEqual([post]);
    expect(getSelectionResults(state, 'athletics').matching).toEqual([]);
    expect(getOverviewResults(state, 'athletics').matching).toEqual([post]);
    expect(getOverviewResults(state, 'campus-life').matching).toEqual([post]);
    state = reducer(state, { type: 'SELECT_POST_DESTINATION', postId: 42, destination: 'alumni-community' });
    expect(state.postSelections).toEqual({ 42: 'alumni-community' });
    expect(getSelectionResults(state, 'university-news').matching).toEqual([]);
    state = reducer(state, { type: 'ASSIGN_TERM', termKey: 'category:1', destination: 'health-wellness' });
    expect(state.postSelections[42]).toBe('alumni-community');
    state = reducer(state, { type: 'SELECT_POST_DESTINATION', postId: 42, destination: null });
    expect(state.postSelections).toEqual({});
    expect(getSelectionResults(state, 'all').matching).toEqual([post]);
  });

  it('keeps the temporary filter working on explicitly selected posts', () => {
    let state = reducer(fixture(), { type: 'SELECT_POST_DESTINATION', postId: 42, destination: 'university-news' });
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:999' });
    expect(getSelectionResults(state, 'university-news').matching).toEqual([]);
    state = reducer(state, { type: 'SET_TEMP_FILTER_ENABLED', enabled: false });
    expect(getSelectionResults(state, 'university-news').matching).toEqual([post]);
  });

  it('round-trips through shortcode JSON and keeps old documents compatible', () => {
    const doc = buildConfigDocument({ sourceUrl: source.baseUrl, assignments: {}, excludedTermKeys: [], unresolvedAssignments: [], postSelections: { 42: 'campus-life' } });
    const imported = validateImport(JSON.parse(unwrapShortcode(wrapAsShortcode(JSON.stringify(doc)))), ctx);
    expect(imported.postSelections).toEqual({ 42: 'campus-life' });
    const selected = reducer(fixture(), { type: 'SELECT_POST_DESTINATION', postId: 42, destination: 'athletics' });
    const old = validateImport({ assignments: {} }, ctx);
    expect(old.postSelections).toBeNull();
    const kept = reducer(selected, { type: 'IMPORT_CONFIG', assignments: old.assignments, unresolved: old.unresolved, postSelections: old.postSelections, replace: true });
    expect(kept.postSelections).toEqual({ 42: 'athletics' });
    const merged = reducer(selected, { type: 'IMPORT_CONFIG', assignments: {}, unresolved: [], postSelections: { 43: 'campus-life' }, replace: false });
    expect(merged.postSelections).toEqual({ 42: 'athletics', 43: 'campus-life' });
    const replaced = reducer(merged, { type: 'IMPORT_CONFIG', assignments: {}, unresolved: [], postSelections: {}, replace: true });
    expect(replaced.postSelections).toEqual({});
  });

  it.each([{ nope: 'athletics' }, { 42: 'invalid' }, [], null])('rejects malformed selection data %j', (postSelections) => {
    expect(() => validateImport({ assignments: {}, postSelections }, ctx)).toThrow();
  });

  it('supports direct links and remembers which list the article came from', () => {
    expect(parseHash('#/selections/athletics')).toEqual({ view: 'selections', category: 'athletics' });
    expect(routeToHash({ view: 'selections', category: 'all' })).toBe('#/selections');
    let state = reducer(fixture(), { type: 'SET_SELECTIONS_CATEGORY', category: 'athletics' });
    state = reducer(state, { type: 'NAVIGATE', view: 'selections' });
    state = reducer(state, { type: 'NAVIGATE', view: 'article', postId: 42 });
    expect(state.ui.listView).toBe('selections');
    expect(state.ui.selectionsCategory).toBe('athletics');
    expect(state.ui.overviewCategory).toBe('all');
  });
});

let host: HTMLDivElement;
let store: ReturnType<typeof useStore>;
function Harness() {
  store = useStore();
  usePersistence(localStorageAdapter);
  return <PostCard post={post} imageUrl={null} matchedDestinations={['athletics', 'campus-life']} />;
}
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => render(null, host)); host.remove(); vi.useRealTimers(); });

it('card choices are exclusive, save after the debounce, and restore after remount', async () => {
  act(() => render(<StoreProvider initialState={fixture()}><Harness /></StoreProvider>, host));
  const choose = (name: string) => host.querySelector<HTMLButtonElement>('button[aria-label="' + name + '"]')!;
  act(() => choose('Athletics').click());
  act(() => choose('Campus Life').click());
  expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  expect(choose('Campus Life').getAttribute('aria-pressed')).toBe('true');
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(localStorageAdapter.load(source.baseUrl)?.postSelections).toEqual({ 42: 'campus-life' });
  expect(store.state.persistence.status).toBe('saved');
  const saved = validateImport(localStorageAdapter.load(source.baseUrl), ctx);
  act(() => render(null, host));
  act(() => render(<StoreProvider initialState={createInitialState(source, saved)}><Harness /></StoreProvider>, host));
  expect(choose('Campus Life').getAttribute('aria-pressed')).toBe('true');
  act(() => choose('Campus Life').click());
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(localStorageAdapter.load(source.baseUrl)?.postSelections).toEqual({});
});
