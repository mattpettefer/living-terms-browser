import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { Config } from './Config';
import { StoreProvider, useStore } from '../state/provider';
import { createInitialState } from '../state/reducer';
import { normalizePost, normalizeTerm } from '../services/normalize';
import type { SourceTerm } from '../state/types';

vi.mock('../effects/useTermInventory', () => ({ useTermInventory: () => ({ retry: vi.fn() }) }));
let host: HTMLDivElement;
let store: ReturnType<typeof useStore>;
function Harness() { store = useStore(); return <Config />; }
afterEach(() => { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); });

it('filters the Config inventory inclusively with synchronized controls without changing assignments or filter rules', () => {
  const state = createInitialState({ baseUrl: 'https://counts.test', postsRestBase: 'posts' });
  state.ui.activeConfigCategory = 'temp-filter';
  state.ui.categoriesOnly = false;
  state.termsInventory = { ...state.termsInventory, status: 'success', complete: true };
  const terms: SourceTerm[] = [
    { key: 'category:1', id: 1, taxonomy: 'category', name: 'Empty', slug: 'empty', sourceCount: 0 },
    { key: 'post_tag:2', id: 2, taxonomy: 'post_tag', name: 'Small', slug: 'small', sourceCount: 4 },
    { key: 'category:3', id: 3, taxonomy: 'category', name: 'Boundary category', slug: 'boundary-category', sourceCount: 5 },
    { key: 'post_tag:4', id: 4, taxonomy: 'post_tag', name: 'Boundary tag', slug: 'boundary-tag', sourceCount: 5 },
    { key: 'post_tag:5', id: 5, taxonomy: 'post_tag', name: 'Popular', slug: 'popular', sourceCount: 20 },
  ];
  state.termsByKey = Object.fromEntries(terms.map((t) => [t.key, t]));
  state.termOrder = terms.map((t) => t.key);
  state.assignments = { 'post_tag:2': 'campus-life' };
  state.tempFilters[0] = { ...state.tempFilters[0]!, termKeys: ['post_tag:2'] };
  host = document.createElement('div'); document.body.append(host);
  act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host));
  const field = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  const names = () => [...host.querySelectorAll('.ltb-term-list .ltb-term-label')].map((el) => el.textContent);
  const input = (control: HTMLInputElement, value: string) => act(() => { control.value = value; control.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(names()).toHaveLength(5);
  input(field, '5');
  expect(slider.value).toBe('5');
  expect(names()).toEqual(['Boundary category', 'Boundary tag', 'Popular']);
  expect(host.querySelector('.ltb-filter-lines')?.textContent).toContain('Small');
  expect(store.state.assignments).toEqual(state.assignments);
  expect(store.state.tempFilters).toEqual(state.tempFilters);
  input(slider, '20');
  expect(field.value).toBe('20');
  expect(names()).toEqual(['Popular']);
  input(field, '99');
  expect(field.value).toBe('20');
  input(slider, '0');
  expect(field.value).toBe('0');
  expect(names()).toHaveLength(5);
});

it('excluded-post coverage uses selected MATCH terms including hidden tags and assigned categories', async () => {
  const state = createInitialState({ baseUrl: 'https://counts.test', postsRestBase: 'posts' });
  state.ui.activeConfigCategory = 'unassigned';
  state.ui.categoriesOnly = true;
  state.ui.termSearch = 'nothing matches';
  state.ui.minTermPostCount = 9;
  state.termsInventory = { ...state.termsInventory, status: 'success', complete: true };
  const terms = [
    normalizeTerm({ id: 1, name: 'Low category', slug: 'low', count: 7 }, 'category'),
    normalizeTerm({ id: 2, name: 'Kept tag', slug: 'tag', count: 12 }, 'post_tag'),
    normalizeTerm({ id: 3, name: 'Kept category', slug: 'category', count: 20 }, 'category'),
    normalizeTerm({ id: 4, name: 'Low tag', slug: 'low-tag', count: 2 }, 'post_tag'),
  ];
  state.termsByKey = Object.fromEntries(terms.map((t) => [t.key, t]));
  state.termOrder = terms.map((t) => t.key);
  state.assignments = { 'category:3': 'campus-life' };
  state.tempFilters[0] = { ...state.tempFilters[0]!, termKeys: ['post_tag:2', 'category:3'] };
  const posts = [
    normalizePost({ id: 1, title: { rendered: 'Kept by hidden tag' }, categories: [1], tags: [2], date: '', modified: '', link: '' }),
    normalizePost({ id: 2, title: { rendered: 'Excluded by minimum' }, categories: [1], tags: [4], date: '', modified: '', link: '' }),
    normalizePost({ id: 3, title: { rendered: 'Kept by assigned category' }, categories: [3], tags: [], date: '', modified: '', link: '' }),
  ];
  state.postsById = Object.fromEntries(posts.map((p) => [p.id, p]));
  state.postOrder = posts.map((p) => p.id);
  state.postIndex = { ...state.postIndex, status: 'success', complete: true };
  host = document.createElement('div'); document.body.append(host);
  act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host));
  expect(host.querySelectorAll('.ltb-term-list button')).toHaveLength(0);
  const calculate = () => act(async () => { host.querySelector<HTMLButtonElement>('.ltb-excluded-posts-summary button')!.click(); });
  await calculate();
  expect(host.querySelector('.ltb-excluded-posts-summary')?.textContent).toContain('Excluded Posts: 1');
  expect([...host.querySelectorAll('.ltb-card-title')].map((el) => el.textContent)).toEqual(['Excluded by minimum']);
  act(() => {
    store.dispatch({ type: 'SET_CATEGORIES_ONLY', categoriesOnly: false });
    store.dispatch({ type: 'SET_TERM_SEARCH', search: '' });
    store.dispatch({ type: 'SET_CONFIG_CATEGORY', category: 'temp-filter' });
  });
  expect(host.querySelector('.ltb-excluded-posts-summary')?.textContent).toContain('Excluded Posts: 1');
  act(() => store.dispatch({ type: 'SET_MIN_TERM_POST_COUNT', count: 13 }));
  expect(host.querySelectorAll('.ltb-card')).toHaveLength(1);
  act(() => store.dispatch({ type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'post_tag:2' }));
  expect(host.querySelectorAll('.ltb-card')).toHaveLength(0);
  await calculate();
  expect([...host.querySelectorAll('.ltb-card-title')].map((el) => el.textContent)).toEqual(['Kept by hidden tag', 'Excluded by minimum']);
});

it.each([true, false])('selects all displayed terms in the active temp-filter row with Categories only=%s', (categoriesOnly) => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  const state = createInitialState({ baseUrl: 'https://counts.test', postsRestBase: 'posts' });
  state.ui.activeConfigCategory = 'temp-filter';
  state.ui.categoriesOnly = categoriesOnly;
  state.ui.minTermPostCount = 9;
  state.ui.termSearch = 'Keep';
  state.tempFilterEnabled = false;
  state.termsInventory = { ...state.termsInventory, status: 'success', complete: true };
  const terms = [
    ...Array.from({ length: 201 }, (_, i) => normalizeTerm({ id: i + 1, name: 'Keep category ' + i, slug: 'keep-' + i, count: 9 }, 'category')),
    normalizeTerm({ id: 300, name: 'Keep tag', slug: 'keep-tag', count: 10 }, 'post_tag'),
    normalizeTerm({ id: 301, name: 'Keep low category', slug: 'keep-low-category', count: 8 }, 'category'),
    normalizeTerm({ id: 302, name: 'Keep low tag', slug: 'keep-low-tag', count: 8 }, 'post_tag'),
    normalizeTerm({ id: 303, name: 'Hidden by search', slug: 'hidden', count: 20 }, 'post_tag'),
  ];
  state.termsByKey = Object.fromEntries(terms.map((t) => [t.key, t]));
  state.termOrder = terms.map((t) => t.key);
  state.tempFilters[0] = { ...state.tempFilters[0]!, operator: 'AND', termKeys: ['post_tag:303'] };
  state.tempFilters.push({ id: 'other', name: 'Other', operator: 'OR', termKeys: ['post_tag:302'], notTermKeys: [] });
  host = document.createElement('div'); document.body.append(host);
  act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host));
  const button = () => [...host.querySelectorAll('button')].find((el) => el.textContent === 'Select all shown')!;
  expect(host.querySelectorAll('.ltb-term-list button')).toHaveLength(200);
  act(() => button().click());
  const expected = terms.filter((term) => term.name.startsWith('Keep') && term.sourceCount! >= 9 && (!categoriesOnly || term.taxonomy === 'category')).map((term) => term.key);
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['post_tag:303', ...expected]);
  expect(store.state.tempFilters[0]!.operator).toBe('AND');
  expect(store.state.tempFilters[1]).toEqual(state.tempFilters[1]);
  expect(store.state.tempFilterEnabled).toBe(true);
  const selected = store.state.tempFilters;
  act(() => button().click());
  expect(store.state.tempFilters).toBe(selected);
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Edit NOT terms"]')!.click());
  act(() => button().click());
  expect(store.state.tempFilters[0]!.notTermKeys).toEqual(expected);
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['post_tag:303']);
});
