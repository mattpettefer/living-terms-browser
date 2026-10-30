import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Overview } from '../views/Overview';
import { PostCard } from '../components/PostCard';
import { usePersistence } from '../effects/usePersistence';
import { parseHash, routeToHash } from '../effects/useHashRouter';
import { buildConfigDocument, localStorageAdapter, validateImport, wrapAsShortcode, unwrapShortcode } from '../services/persistence';
import { StoreProvider, useStore } from './provider';
import { createInitialState, reducer } from './reducer';
import { getOverviewResults, getSelectionResults, getSelectionCounts } from './selectors';
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

it('card choices support two categories, save after the debounce, and restore after remount', async () => {
  act(() => render(<StoreProvider initialState={fixture()}><Harness /></StoreProvider>, host));
  const choose = (name: string) => host.querySelector<HTMLButtonElement>('button[aria-label="' + name + '"]')!;
  act(() => choose('Athletics').click());
  act(() => choose('Campus Life').click());
  expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
  expect(choose('University News').disabled).toBe(true);
  act(() => choose('University News').click());
  expect(store.state.postSelections[42]).toEqual(['athletics', 'campus-life']);
  expect(choose('Campus Life').getAttribute('aria-pressed')).toBe('true');
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(localStorageAdapter.load(source.baseUrl)?.postSelections).toEqual({ 42: ['athletics', 'campus-life'] });
  expect(store.state.persistence.status).toBe('saved');
  const saved = validateImport(localStorageAdapter.load(source.baseUrl), ctx);
  act(() => render(null, host));
  act(() => render(<StoreProvider initialState={createInitialState(source, saved)}><Harness /></StoreProvider>, host));
  expect(choose('Campus Life').getAttribute('aria-pressed')).toBe('true');
  expect(choose('Athletics').getAttribute('aria-pressed')).toBe('true');
  act(() => choose('Campus Life').click());
  expect(store.state.postSelections[42]).toBe('athletics');
  expect(choose('University News').disabled).toBe(false);
  act(() => choose('Athletics').click());
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(localStorageAdapter.load(source.baseUrl)?.postSelections).toEqual({});
});

it('routes uncategorized selections and applies temporary filters to posts without a destination',()=>{
  let s=fixture();s.postsById[43]={...post,id:43,termKeys:[]};s.postOrder.push(43);
  expect(parseHash('#/selections/uncategorized')).toEqual({view:'selections',category:'uncategorized'});
  expect(routeToHash({view:'selections',category:'uncategorized'})).toBe('#/selections/uncategorized');
  expect(getSelectionResults(s,'uncategorized').matching.map(p=>p.id)).toEqual([42,43]);
  s=reducer(s,{type:'SELECT_POST_DESTINATION',postId:43,destination:'athletics'});
  expect(getSelectionResults(s,'uncategorized').matching.map(p=>p.id)).toEqual([42]);
  s=reducer(s,{type:'TOGGLE_TEMP_FILTER_TERM',termKey:'category:999'});
  expect(getSelectionResults(s,'uncategorized').matching).toEqual([]);
  s=reducer(s,{type:'SET_TEMP_FILTER_ENABLED',enabled:false});
  expect(getSelectionResults(s,'uncategorized').matching.map(p=>p.id)).toEqual([42]);
  s=reducer(s,{type:'SET_SELECTIONS_CATEGORY',category:'uncategorized'});
  s=reducer(s,{type:'NAVIGATE',view:'selections'});
  s=reducer(s,{type:'NAVIGATE',view:'article',postId:42});
  expect(s.ui.selectionsCategory).toBe('uncategorized');
  expect(s.ui.listView).toBe('selections');
});

it('shows the Uncategorized tab only in Selections and removes a post when categorized',()=>{
  const s=fixture();s.postIndex.status='success';s.ui.selectionsCategory='uncategorized';
  const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  try {
    act(()=>render(<StoreProvider initialState={s}><Overview mode="selections"/></StoreProvider>,host));
    const tab=[...host.querySelectorAll('nav button')].find(b=>b.textContent?.includes('Uncategorized'))!;
    expect(tab.getAttribute('aria-pressed')).toBe('true');
    expect(tab.textContent).toContain('1 posts');
    expect(host.querySelector('.ltb-bulk-selection')).toBeNull();
    expect(host.textContent).toContain('A campus athlete');
    act(()=>host.querySelector<HTMLButtonElement>('button[aria-label="Athletics"]')!.click());
    expect(host.textContent).not.toContain('A campus athlete');
    expect(host.textContent).toContain('All posts have a destination category.');
    act(()=>render(null,host));
    act(()=>render(<StoreProvider initialState={s}><Overview/></StoreProvider>,host));
    expect([...host.querySelectorAll('nav button')].some(b=>b.textContent?.includes('Uncategorized'))).toBe(false);
  } finally { scroll.mockRestore(); }
});

it('keeps two selections independent, caps them at two, and counts overlapping posts once in All', () => {
  const initial = fixture();
  const toggle = (s: ReturnType<typeof fixture>, destination: 'athletics' | 'campus-life' | 'university-news') => reducer(s, { type: 'TOGGLE_POST_DESTINATION', postId: 42, destination });
  let s = toggle(toggle(initial, 'athletics'), 'campus-life');
  expect(toggle(s, 'university-news')).toBe(s);
  expect(getSelectionResults(s, 'athletics').matching).toEqual([post]);
  expect(getSelectionResults(s, 'campus-life').matching).toEqual([post]);
  expect(getSelectionResults(s, 'all').matching).toEqual([post]);
  expect(getSelectionResults(s, 'uncategorized').matching).toEqual([]);
  expect(getSelectionCounts(s)).toMatchObject({ athletics: 1, 'campus-life': 1 });
  expect(s.assignments).toBe(initial.assignments);
  s = reducer(s, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:999' });
  expect(getSelectionResults(s, 'athletics').matching).toEqual([]);
  expect(getSelectionResults(s, 'campus-life').matching).toEqual([]);
  s = reducer(s, { type: 'SET_TEMP_FILTER_ENABLED', enabled: false });
  s = toggle(s, 'athletics');
  expect(s.postSelections[42]).toBe('campus-life');
  expect(getSelectionResults(s, 'athletics').matching).toEqual([]);
  s = toggle(s, 'campus-life');
  expect(getSelectionResults(s, 'uncategorized').matching).toEqual([post]);
});

it('bulk deselection removes only the current category, and explicit bulk replacement replaces both', () => {
  const s = fixture(); s.postIndex.status = 'success';
  s.postSelections = { 42: ['campus-life', 'athletics'] };
  for (const view of ['overview', 'selections'] as const) {
    const next = reducer(s, { type: 'DESELECT_ALL', view, destination: 'athletics' });
    expect(next.postSelections).toEqual({ 42: 'campus-life' });
  }
  expect(reducer(s, { type: 'SELECT_ALL_OVERVIEW', destination: 'athletics', replaceExisting: false })).toBe(s);
  expect(reducer(s, { type: 'SELECT_ALL_OVERVIEW', destination: 'athletics', replaceExisting: true }).postSelections).toEqual({ 42: 'athletics' });
});

it('round-trips two categories and imports legacy selections without losing the second category on unrelated imports', () => {
  const s = fixture(); s.postSelections = { 42: ['athletics', 'campus-life'] };
  const doc = buildConfigDocument({ ...s, sourceUrl: source.baseUrl, tempFilters: { filters: s.tempFilters, activeId: s.activeTempFilterId, enabled: s.tempFilterEnabled } });
  expect(doc.schemaVersion).toBe(4);
  const imported = validateImport(JSON.parse(unwrapShortcode(wrapAsShortcode(JSON.stringify(doc)))), ctx);
  expect(createInitialState(source, imported).postSelections).toEqual(s.postSelections);
  expect(validateImport({ assignments: {}, postSelections: { 42: ['student-life', 'alumni'] } }, ctx).postSelections).toEqual({ 42: ['campus-life', 'alumni-community'] });
  const old = validateImport({ schemaVersion: 3, assignments: {} }, ctx);
  expect(reducer(s, { type: 'IMPORT_CONFIG', ...old, replace: true }).postSelections).toEqual(s.postSelections);
  expect(reducer(s, { type: 'IMPORT_CONFIG', assignments: {}, unresolved: [], postSelections: { 43: 'athletics' }, replace: false }).postSelections).toEqual({ ...s.postSelections, 43: 'athletics' });
  expect(reducer(s, { type: 'IMPORT_CONFIG', assignments: {}, unresolved: [], postSelections: imported.postSelections, replace: true }).postSelections).toEqual(s.postSelections);
});

it.each([[], ['athletics','athletics'], ['student-life','campus-life'], ['athletics','bad'], ['athletics','campus-life','university-news'], [null]].map(selection => ({ selection })))('rejects invalid multi-category selection $selection', ({ selection }) => {
  expect(() => validateImport({ assignments: {}, postSelections: { 42: selection } }, ctx)).toThrow();
});
