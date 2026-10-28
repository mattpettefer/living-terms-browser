import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../views/Config';
import { StoreProvider, useStore } from '../state/provider';
import { createInitialState, reducer } from '../state/reducer';
import { getPostMatches, applyTempFilter, getActiveTempFilter, getOverviewResults, getSelectionResults } from '../state/selectors';
import { buildConfigDocument, parseTempFilters, saveTempFilters, loadTempFilters, validateImport, unwrapShortcode, wrapAsShortcode } from '../services/persistence';
import { DESTINATIONS } from '../state/destinations';
import { usePersistence } from '../effects/usePersistence';
import { localStorageAdapter } from '../services/persistence';
import type { PostRecord, TermKey } from '../state/types';
vi.mock('../effects/useTermInventory', () => ({ useTermInventory: () => ({ retry: vi.fn() }) }));
const source = { baseUrl: 'https://not.test', postsRestBase: 'posts' };
const post = (id: number, termKeys: TermKey[]): PostRecord => ({ id, termKeys, title: 'Post ' + id, excerptHtml: '', sourceUrl: '', date: '', modified: '', featuredMediaId: 0, imageUrl: null, termsComplete: true, contentLoaded: false });
const posts = [post(1, ['category:1']), post(2, ['category:1', 'post_tag:2']), post(3, ['post_tag:2']), post(4, [])];
const ids = (items: PostRecord[]) => items.map((p) => p.id);

describe('NOT filtering', () => {
  it('supports exclusion-only rules and excludes any NOT term regardless of OR/AND', () => {
    expect(ids(applyTempFilter(posts, [], 'OR', ['post_tag:2']))).toEqual([1, 4]);
    expect(ids(applyTempFilter(posts, ['category:1', 'post_tag:2'], 'OR', ['post_tag:2']))).toEqual([1]);
    expect(ids(applyTempFilter(posts, ['category:1'], 'AND', ['post_tag:2']))).toEqual([1]);
    expect(ids(applyTempFilter(posts, ['category:1', 'post_tag:2'], 'AND', ['post_tag:2']))).toEqual([]);
    expect(ids(applyTempFilter(posts, [], 'AND', ['category:1', 'post_tag:2']))).toEqual([4]);
  });

  it('applies exclusions to Overview, Selections and bulk changes; No Filter bypasses both rows', () => {
    let state = createInitialState(source);
    state.postOrder = posts.map((p) => p.id);
    state.postsById = Object.fromEntries(posts.map((p) => [p.id, p]));
    state.assignments = { 'category:1': 'campus-life' };
    state.postSelections = { 1: 'campus-life', 2: 'campus-life' };
    state.postIndex = { ...state.postIndex, complete: true, status: 'success' };
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_NOT_TERM', termKey: 'post_tag:2' });
    expect(ids(getOverviewResults(state, 'campus-life').matching)).toEqual([1]);
    expect(ids(getSelectionResults(state, 'campus-life').matching)).toEqual([1]);
    state = reducer(state, { type: 'DESELECT_ALL', destination: 'campus-life', view: 'selections' });
    expect(state.postSelections).toEqual({ 2: 'campus-life' });
    state = reducer(state, { type: 'SELECT_ALL_OVERVIEW', destination: 'campus-life' });
    expect(state.postSelections).toEqual({ 1: 'campus-life', 2: 'campus-life' });
    state = reducer(state, { type: 'SET_TEMP_FILTER_ENABLED', enabled: false });
    expect(ids(getOverviewResults(state, 'campus-life').matching)).toEqual([1, 2]);
    expect(ids(getSelectionResults(state, 'campus-life').matching)).toEqual([1, 2]);
  });

  it('moves terms between rows, keeps named filters independent, and clears both rows', () => {
    let state = createInitialState(source);
    const firstId = state.activeTempFilterId;
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:1' });
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_NOT_TERM', termKey: 'category:1' });
    expect(getActiveTempFilter(state).termKeys).toEqual([]);
    expect(getActiveTempFilter(state).notTermKeys).toEqual(['category:1']);
    state = reducer(state, { type: 'ADD_TEMP_FILTER', name: 'Second' });
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_NOT_TERM', termKey: 'post_tag:2' });
    expect(state.tempFilters.find((f) => f.id === firstId)?.notTermKeys).toEqual(['category:1']);
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:2' });
    expect(getActiveTempFilter(state).notTermKeys).toEqual([]);
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_NOT_TERM', termKey: 'category:1' });
    state = reducer(state, { type: 'CLEAR_TEMP_FILTER' });
    expect(getActiveTempFilter(state).termKeys).toEqual([]);
    expect(getActiveTempFilter(state).notTermKeys).toEqual([]);
  });

  it('round-trips NOT-only filters through reload and shortcode export, and reads old configs', () => {
    const snapshot = parseTempFilters({ filters: [{ id: 'one', name: 'Exclude', termKeys: ['category:1'], notTermKeys: ['category:1', 'post_tag:2', 'bad'], operator: 'AND' }], activeId: 'one' })!;
    expect(snapshot.filters[0]?.termKeys).toEqual([]);
    expect(snapshot.filters[0]?.notTermKeys).toEqual(['category:1', 'post_tag:2']);
    saveTempFilters(source.baseUrl, snapshot);
    expect(loadTempFilters(source.baseUrl)).toEqual(snapshot);
    const doc = buildConfigDocument({ sourceUrl: source.baseUrl, assignments: {}, excludedTermKeys: [], unresolvedAssignments: [], tempFilters: snapshot });
    const restored = validateImport(JSON.parse(unwrapShortcode(wrapAsShortcode(JSON.stringify(doc)))), { sourceUrl: source.baseUrl, excludedTermKeys: new Set(), knownTermKeys: null });
    expect(restored.tempFilters).toEqual(snapshot);
    expect(parseTempFilters({ filters: [{ id: 'old', name: 'Old', termKeys: [] }] })?.filters[0]?.notTermKeys).toEqual([]);
  });
});

let host: HTMLDivElement | undefined;
let store: ReturnType<typeof useStore>;
function Harness() { store = useStore(); usePersistence(localStorageAdapter); return <Config />; }
afterEach(() => { if (host) { act(() => render(null, host!)); host.remove(); host = undefined; } localStorage.clear(); vi.useRealTimers(); });

it('Config lets the user edit the NOT row, add a term, and remove it from the row', () => {
  const state = createInitialState(source);
  state.ui.activeConfigCategory = 'temp-filter';
  state.termsInventory = { ...state.termsInventory, status: 'success', complete: true };
  state.termsByKey = { 'category:1': { key: 'category:1', id: 1, taxonomy: 'category', name: 'Faces of LIFE', slug: 'faces-of-life', sourceCount: 20 } };
  state.termOrder = ['category:1'];
  host = document.createElement('div'); document.body.append(host);
  act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host!));
  act(() => host!.querySelector<HTMLButtonElement>('[aria-label="Edit NOT terms"]')!.click());
  act(() => host!.querySelector<HTMLButtonElement>('.ltb-term-list button')!.click());
  expect(getActiveTempFilter(store.state).notTermKeys).toEqual(['category:1']);
  expect(getActiveTempFilter(store.state).termKeys).toEqual([]);
  expect(host!.querySelector('.ltb-filter-line.is-not')?.textContent).toContain('Faces of LIFE');
  act(() => host!.querySelector<HTMLButtonElement>('[aria-label="Remove Faces of LIFE from NOT, 20 source posts"]')!.click());
  expect(getActiveTempFilter(store.state).notTermKeys).toEqual([]);
});


describe('destination NOT rules', () => {
  const ctx = { sourceUrl: source.baseUrl, excludedTermKeys: new Set<TermKey>(), knownTermKeys: null };
  it('excludes matches locally, keeps editorial choices, and bulk selects the complete eligible list', () => {
    let state = createInitialState(source);
    state.assignments = { 'category:1': 'athletics', 'post_tag:2': 'campus-life' };
    const all = Array.from({ length: 61 }, (_, i) => post(i + 1, i % 2 ? ['category:1', 'post_tag:2'] : ['category:1']));
    state.postOrder = all.map((p) => p.id);
    state.postsById = Object.fromEntries(all.map((p) => [p.id, p]));
    state.postIndex = { ...state.postIndex, complete: true, status: 'success' };
    state.postSelections = { 2: 'athletics' };
    state = reducer(state, { type: 'TOGGLE_DESTINATION_NOT_TERM', destination: 'athletics', termKey: 'post_tag:2' });
    expect(state.assignments['post_tag:2']).toBe('campus-life');
    expect(getOverviewResults(state, 'athletics').matching).toHaveLength(31);
    expect(getOverviewResults(state, 'campus-life').matching).toHaveLength(30);
    expect(getOverviewResults(state, 'all').matching).toHaveLength(61);
    expect(ids(getSelectionResults(state, 'athletics').matching)).toEqual([2]);
    expect(getPostMatches(all[1]!, state.assignments, new Set(), state.destinationExclusions)).toEqual({ 'campus-life': ['post_tag:2'] });
    state = reducer(state, { type: 'SELECT_ALL_OVERVIEW', destination: 'athletics' });
    expect(Object.keys(state.postSelections)).toHaveLength(32);
    expect(state.postSelections[61]).toBe('athletics');
    expect(state.postSelections[60]).toBeUndefined();
    state = reducer(state, { type: 'DESELECT_ALL', destination: 'athletics', view: 'overview' });
    expect(state.postSelections).toEqual({ 2: 'athletics' });
  });

  it('moves a term between MATCH and NOT only in the affected destination, including confirmed moves', () => {
    let state = createInitialState(source);
    state = reducer(state, { type: 'ASSIGN_TERM', destination: 'athletics', termKey: 'category:1' });
    state = reducer(state, { type: 'TOGGLE_DESTINATION_NOT_TERM', destination: 'athletics', termKey: 'category:1' });
    expect(state.assignments).toEqual({});
    state = reducer(state, { type: 'TOGGLE_DESTINATION_NOT_TERM', destination: 'campus-life', termKey: 'category:1' });
    state = reducer(state, { type: 'ASSIGN_TERM', destination: 'athletics', termKey: 'category:1' });
    expect(state.destinationExclusions).toEqual({ athletics: [], 'campus-life': ['category:1'] });
    state = reducer(state, { type: 'OPEN_MOVE', fromCategory: 'athletics', toCategory: 'campus-life', termKey: 'category:1' });
    state = reducer(state, { type: 'CONFIRM_MOVE' });
    expect(state.destinationExclusions['campus-life']).toEqual([]);
    expect(state.assignments['category:1']).toBe('campus-life');
  });

  it('exports and restores exclusions, supports old documents, and merges or replaces rules', () => {
    const doc = buildConfigDocument({ sourceUrl: source.baseUrl, assignments: { 'category:1': 'athletics' }, destinationExclusions: { athletics: ['post_tag:2'] }, excludedTermKeys: [], unresolvedAssignments: [] });
    const parsed = validateImport(JSON.parse(unwrapShortcode(wrapAsShortcode(JSON.stringify(doc)))), ctx);
    let state = createInitialState(source, parsed);
    expect(state.destinationExclusions).toEqual({ athletics: ['post_tag:2'] });
    expect(validateImport({ assignments: {} }, ctx).destinationExclusions).toBeNull();
    state = reducer(state, { type: 'IMPORT_CONFIG', ...validateImport({ assignments: {} }, ctx), replace: true });
    expect(state.destinationExclusions).toEqual({ athletics: ['post_tag:2'] });
    state = reducer(state, { type: 'IMPORT_CONFIG', ...validateImport({ assignments: {}, destinationExclusions: { athletics: ['category:3'] } }, ctx), replace: false });
    expect(state.destinationExclusions.athletics).toEqual(['post_tag:2', 'category:3']);
    state = reducer(state, { type: 'IMPORT_CONFIG', ...validateImport({ assignments: {}, destinationExclusions: {} }, ctx), replace: true });
    expect(state.destinationExclusions).toEqual({});
    const conflict = validateImport({ assignments: { 'category:1': 'athletics' }, destinationExclusions: { athletics: ['category:1'] } }, ctx);
    expect(conflict.assignments).toEqual({});
    expect(() => validateImport({ assignments: {}, destinationExclusions: { bogus: [] } }, ctx)).toThrow();
    expect(() => validateImport({ assignments: {}, destinationExclusions: { athletics: ['bad'] } }, ctx)).toThrow();
  });

  it.each(DESTINATIONS)('edits and autosaves the NOT row in $name, but hides it in Unassigned', async (destination) => {
    vi.useFakeTimers();
    const state = createInitialState(source);
    state.ui.activeConfigCategory = destination.id;
    state.termsInventory = { ...state.termsInventory, status: 'success', complete: true };
    state.termsByKey = { 'category:1': { key: 'category:1', id: 1, taxonomy: 'category', name: 'Faces of LIFE', slug: 'faces-of-life', sourceCount: 20 } };
    state.termOrder = ['category:1'];
    host = document.createElement('div'); document.body.append(host);
    act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host!));
    act(() => host!.querySelector<HTMLButtonElement>('[aria-label="Edit NOT terms"]')!.click());
    act(() => host!.querySelector<HTMLButtonElement>('.ltb-term-list button')!.click());
    expect(store.state.destinationExclusions[destination.id]).toEqual(['category:1']);
    expect(host!.querySelector('.ltb-term-list button')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const saved = validateImport(localStorageAdapter.load(source.baseUrl), ctx);
    expect(createInitialState(source, saved).destinationExclusions[destination.id]).toEqual(['category:1']);
    act(() => store.dispatch({ type: 'SET_CONFIG_CATEGORY', category: 'unassigned' }));
    expect(host!.querySelector('[aria-label="Edit NOT terms"]')).toBeNull();
    expect(host!.querySelector('.ltb-term-list')?.textContent).toContain('Faces of LIFE');
  });
});
