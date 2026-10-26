import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Overview } from './Overview';
import { StoreProvider, useStore } from '../state/provider';
import { createInitialState, reducer } from '../state/reducer';
import type { AppState, PostRecord } from '../state/types';

vi.mock('../effects/usePostIndex', () => ({
  usePostIndex: () => ({ index: useStore().state.postIndex, retry: vi.fn() }),
}));
vi.mock('../effects/useMediaBatch', () => ({
  useMediaBatch: () => undefined, imageFor: () => null,
}));

function fixture(): AppState {
  const state = createInitialState({ baseUrl: 'https://bulk.test', postsRestBase: 'posts' });
  state.ui.overviewCategory = 'campus-life';
  state.assignments = { 'category:1': 'campus-life' };
  state.postIndex = { ...state.postIndex, status: 'success', complete: true };
  for (let id = 1; id <= 61; id++) {
    const post: PostRecord = { id, title: 'Post ' + id, excerptHtml: '', sourceUrl: 'https://bulk.test/' + id, date: '2026-10-26', modified: '', featuredMediaId: 0, imageUrl: null, termKeys: ['category:1', ...(id % 2 === 0 ? ['post_tag:2' as const] : [])], termsComplete: true, contentLoaded: false };
    state.postsById[id] = post;
    state.postOrder.push(id);
  }
  state.postsById[999] = { ...state.postsById[1]!, id: 999, termKeys: [] };
  state.postOrder.push(999);
  state.postSelections = { 1: 'athletics', 999: 'university-news' };
  return state;
}

let host: HTMLDivElement;
let store: ReturnType<typeof useStore>;
function Harness({ mode = 'overview' }: { mode?: 'overview' | 'selections' }) {
  store = useStore();
  return <Overview mode={mode} />;
}
beforeEach(() => { window.scrollTo = vi.fn(); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => render(null, host)); host.remove(); });

describe('Overview select all', () => {
  it('selects unselected matches beyond the 24 rendered cards and preserves existing choices by default', () => {
    const state = fixture();
    act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host));
    expect(host.querySelectorAll('.ltb-card')).toHaveLength(24);
    act(() => host.querySelector<HTMLButtonElement>('.ltb-bulk-selection button')!.click());
    expect(Object.values(store.state.postSelections).filter((d) => d === 'campus-life')).toHaveLength(60);
    expect(store.state.postSelections[1]).toBe('athletics');
    expect(store.state.postSelections[61]).toBe('campus-life');
    expect(store.state.postSelections[999]).toBe('university-news');
    expect(store.state.assignments).toEqual(state.assignments);
    expect(store.state.persistence.status).toBe('unsaved');
    expect(host.querySelector('.ltb-bulk-selection')?.textContent).toContain('Every matching post already has a selection');
    expect(host.querySelector<HTMLButtonElement>('.ltb-bulk-selection button')!.disabled).toBe(true);
  });

  it('only replaces existing choices when the toggle is enabled, and can switch back to preserving them', () => {
    act(() => render(<StoreProvider initialState={fixture()}><Harness /></StoreProvider>, host));
    const toggle = host.querySelector<HTMLInputElement>('.ltb-bulk-selection input[type="checkbox"]')!;
    const select = host.querySelector<HTMLButtonElement>('.ltb-bulk-selection button')!;
    expect(toggle.checked).toBe(false);
    act(() => select.click());
    expect(select.disabled).toBe(true);
    act(() => toggle.click());
    expect(select.disabled).toBe(false);
    expect(host.querySelector('.ltb-bulk-selection')?.textContent).toContain('Existing choices will be replaced');
    act(() => select.click());
    expect(store.state.postSelections[1]).toBe('campus-life');
    expect(store.state.postSelections[999]).toBe('university-news');
    expect(select.disabled).toBe(true);
    act(() => toggle.click());
    act(() => store.dispatch({ type: 'SELECT_POST_DESTINATION', postId: 61, destination: 'athletics' }));
    expect(select.disabled).toBe(true);
    expect(reducer(store.state, { type: 'SELECT_ALL_OVERVIEW', destination: 'campus-life' })).toBe(store.state);
  });

  it.each(['loading', 'error'] as const)('cannot select a partial index with status %s', (status) => {
    const state = fixture();
    state.postIndex = { ...state.postIndex, complete: false, status };
    act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host));
    expect(host.querySelector<HTMLButtonElement>('.ltb-bulk-selection button')!.disabled).toBe(true);
    expect(reducer(state, { type: 'SELECT_ALL_OVERVIEW', destination: 'campus-life' })).toBe(state);
    act(() => store.dispatch({ type: 'INDEX_LOAD_START', requestId: 'complete' }));
    act(() => store.dispatch({ type: 'INDEX_LOAD_COMPLETE', requestId: 'complete' }));
    expect(host.querySelector<HTMLButtonElement>('.ltb-bulk-selection button')!.disabled).toBe(false);
  });

  it('respects the active temporary filter across the whole index', () => {
    let state = fixture();
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:2' });
    state = reducer(state, { type: 'SELECT_ALL_OVERVIEW', destination: 'campus-life' });
    expect(Object.values(state.postSelections).filter((d) => d === 'campus-life')).toHaveLength(30);
    expect(state.postSelections[60]).toBe('campus-life');
    expect(state.postSelections[1]).toBe('athletics');
    expect(state.postSelections[61]).toBeUndefined();
  });

  it('does not offer select all without a destination or inside Selections', () => {
    const state = fixture();
    state.ui.overviewCategory = 'all';
    act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host));
    expect(host.querySelector('.ltb-bulk-selection')).toBeNull();
    act(() => render(null, host));
    act(() => render(<StoreProvider initialState={fixture()}><Harness mode="selections" /></StoreProvider>, host));
    expect(host.querySelector('.ltb-bulk-selection')).toBeNull();
  });
});


describe('deselect all', () => {
  it.each(['overview', 'selections'] as const)('clears every matching selection beyond rendered cards in %s, preserving other destinations', (view) => {
    const state = fixture();
    state.ui.selectionsCategory = 'campus-life';
    for (let id = 2; id <= 61; id++) state.postSelections[id] = 'campus-life';
    act(() => render(<StoreProvider initialState={state}><Harness mode={view} /></StoreProvider>, host));
    expect(host.querySelectorAll('.ltb-card')).toHaveLength(24);
    const button = [...host.querySelectorAll<HTMLButtonElement>('.ltb-bulk-selection button')].find((b) => b.textContent === 'Deselect all')!;
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(store.state.postSelections).toEqual({ 1: 'athletics', 999: 'university-news' });
    expect(store.state.assignments).toEqual(state.assignments);
    expect(store.state.persistence.status).toBe('unsaved');
    expect(button.disabled).toBe(true);
    if (view === 'selections') expect(host.querySelectorAll('.ltb-card')).toHaveLength(0);
  });

  it.each(['overview', 'selections'] as const)('honors temporary filters and refuses incomplete indexes in %s', (view) => {
    let state = fixture();
    for (let id = 2; id <= 61; id++) state.postSelections[id] = 'campus-life';
    state = reducer(state, { type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:2' });
    const partial = { ...state, postIndex: { ...state.postIndex, complete: false } };
    expect(reducer(partial, { type: 'DESELECT_ALL', destination: 'campus-life', view })).toBe(partial);
    const failed = { ...state, postIndex: { ...state.postIndex, status: 'error' as const } };
    expect(reducer(failed, { type: 'DESELECT_ALL', destination: 'campus-life', view })).toBe(failed);
    const cleared = reducer(state, { type: 'DESELECT_ALL', destination: 'campus-life', view });
    expect(cleared.postSelections[60]).toBeUndefined();
    expect(cleared.postSelections[61]).toBe('campus-life');
    expect(cleared.postSelections[1]).toBe('athletics');
    expect(cleared.postSelections[999]).toBe('university-news');
    expect(Object.values(cleared.postSelections).filter((d) => d === 'campus-life')).toHaveLength(30);
  });

  it('Selections clears explicit choices even if the source terms no longer match', () => {
    const state = fixture();
    state.postSelections[999] = 'campus-life';
    const overview = reducer(state, { type: 'DESELECT_ALL', destination: 'campus-life', view: 'overview' });
    expect(overview.postSelections[999]).toBe('campus-life');
    const selections = reducer(state, { type: 'DESELECT_ALL', destination: 'campus-life', view: 'selections' });
    expect(selections.postSelections[999]).toBeUndefined();
  });
});


it('labels badges with matching post counts and keeps them aligned with the list as filters change', () => {
  act(() => render(<StoreProvider initialState={fixture()}><Harness /></StoreProvider>, host));
  const badge = () => host.querySelector('.ltb-filter.is-active .ltb-filter-count')!.textContent;
  expect(badge()).toBe('61 posts');
  expect(host.querySelector('.ltb-results-count')?.textContent).toBe('61 matching posts');
  act(() => store.dispatch({ type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:2' }));
  expect(badge()).toBe('30 posts');
  act(() => store.dispatch({ type: 'TOGGLE_DESTINATION_NOT_TERM', destination: 'campus-life', termKey: 'post_tag:2' }));
  expect(badge()).toBe('0 posts');
  act(() => store.dispatch({ type: 'SET_TEMP_FILTER_ENABLED', enabled: false }));
  expect(badge()).toBe('31 posts');
});

it('labels Selections badges as selected and applies the same temporary filter as the list', () => {
  const state = fixture();
  state.ui.selectionsCategory = 'campus-life';
  state.postSelections = { 1: 'campus-life', 2: 'campus-life' };
  act(() => render(<StoreProvider initialState={state}><Harness mode="selections" /></StoreProvider>, host));
  expect(host.querySelector('.ltb-filter.is-active .ltb-filter-count')?.textContent).toBe('2 selected');
  act(() => store.dispatch({ type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:2' }));
  expect(host.querySelector('.ltb-filter.is-active .ltb-filter-count')?.textContent).toBe('1 selected');
  expect(host.querySelectorAll('.ltb-card')).toHaveLength(1);
});
