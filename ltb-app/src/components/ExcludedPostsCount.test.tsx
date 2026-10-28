import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { ExcludedPostsCount, getExcludedPosts } from './ExcludedPostsCount';
import { StoreProvider, useStore } from '../state/provider';
import { createInitialState } from '../state/reducer';
import { normalizePost, normalizeTerm } from '../services/normalize';
import { fetchMediaBatch, fetchPostIndex } from '../services/wordpress';
import type { AppState } from '../state/types';

vi.mock('../services/wordpress', () => ({ fetchPostIndex: vi.fn(), fetchMediaBatch: vi.fn(), describeError: (e: Error) => e.message }));
const fetchIndex = vi.mocked(fetchPostIndex);
let host: HTMLDivElement | undefined;
let store: ReturnType<typeof useStore>;
function Harness() {
  store = useStore();
  return <ExcludedPostsCount />;
}
const post = (id: number, categories: number[], tags: number[]) => normalizePost({ id, categories, tags, title: { rendered: 'Post ' + id }, date: '', modified: '', link: '' });
function initial() {
  const state = createInitialState({ baseUrl: 'https://counts.test', postsRestBase: 'posts' });
  const terms = [normalizeTerm({ id: 1, name: 'Category', slug: 'category', count: 2 }, 'category'), normalizeTerm({ id: 1, name: 'Tag', slug: 'tag', count: 5 }, 'post_tag')];
  state.termsByKey = Object.fromEntries(terms.map((t) => [t.key, t]));
  state.termOrder = terms.map((t) => t.key);
  state.tempFilters[0] = { ...state.tempFilters[0]!, termKeys: terms.map((t) => t.key) };
  state.termsInventory = { ...state.termsInventory, status: 'success', complete: true };
  return state;
}
function mount(state: AppState) { host = document.createElement('div'); document.body.append(host); act(() => render(<StoreProvider initialState={state}><Harness /></StoreProvider>, host!)); }
function click() { return act(async () => { host!.querySelector('button')!.click(); }); }
afterEach(() => { if (host) { act(() => render(null, host!)); host.remove(); host = undefined; } vi.resetAllMocks(); });

it('counts the complement of the term union, including posts without terms and an empty retained set', () => {
  const state = initial();
  const posts = [post(1, [1], [1]), post(2, [1], []), post(3, [], [1]), post(4, [], [])];
  state.postsById = Object.fromEntries(posts.map((p) => [p.id, p]));
  state.postOrder = posts.map((p) => p.id);
  expect(getExcludedPosts(state, new Set(['category:1', 'post_tag:1'])).map((p) => p.id)).toEqual([4]);
  expect(getExcludedPosts(state, new Set(['post_tag:1'])).map((p) => p.id)).toEqual([2, 4]);
  expect(getExcludedPosts(state, new Set())).toHaveLength(4);
  state.postsById[4]!.termsComplete = false;
  expect(() => getExcludedPosts(state, new Set())).toThrow('missing category or tag data');
});

it('loads only on request, waits for all pages, invalidates after a threshold change, and reuses the index', async () => {
  let progress!: Parameters<typeof fetchPostIndex>[1];
  let finish!: () => void;
  fetchIndex.mockImplementation((_cfg, onProgress) => { progress = onProgress; return new Promise<void>((resolve) => { finish = resolve; }); });
  mount(initial());
  expect(fetchIndex).not.toHaveBeenCalled();
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(0);
  await click();
  expect(fetchIndex).toHaveBeenCalledTimes(1);
  await act(async () => { progress({ posts: [post(1, [1], []), post(2, [], [1])], loadedPages: 1, totalPages: 2, totalPosts: 3 }); });
  expect(host!.textContent).toContain('Excluded Posts: —');
  expect(host!.textContent).toContain('1/2 pages');
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(0);
  await act(async () => { progress({ posts: [post(3, [], [])], loadedPages: 2, totalPages: 2, totalPosts: 3 }); finish(); });
  expect(host!.textContent).toContain('Excluded Posts: 1');
  expect([...host!.querySelectorAll('.ltb-card-title')].map((el) => el.textContent)).toEqual(['Post 3']);
  act(() => store.dispatch({ type: 'TOGGLE_TEMP_FILTER_TERM', termKey: 'category:1' }));
  expect(host!.textContent).toContain('Excluded Posts: —');
  expect(host!.textContent).toContain('Recalculate for the current filter');
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(0);
  await click();
  expect(host!.textContent).toContain('Excluded Posts: 2');
  expect([...host!.querySelectorAll('.ltb-card-title')].map((el) => el.textContent)).toEqual(['Post 3', 'Post 1']);
  expect([...host!.querySelectorAll('.ltb-excluded-post-terms')].map((el) => el.textContent).join(' ')).toContain('Category2');
  expect(host!.querySelector('.ltb-card-link[href="#/article/1"]')).not.toBeNull();
  expect(fetchIndex).toHaveBeenCalledTimes(1);
});

it('reports load failures and allows retry without showing a partial count', async () => {
  fetchIndex.mockRejectedValueOnce(new Error('Source unavailable'));
  mount(initial());
  await click();
  await vi.waitFor(async () => { await act(async () => {}); expect(host!.textContent).toContain('Source unavailable'); });
  expect(host!.textContent).toContain('Excluded Posts: —');
  fetchIndex.mockImplementationOnce(async (_cfg, progress) => { progress({ posts: [], loadedPages: 1, totalPages: 1, totalPosts: 0 }); });
  await click();
  await vi.waitFor(async () => { await act(async () => {}); expect(host!.textContent).toContain('Excluded Posts: 0'); });
});

it('does not calculate until the term inventory is complete', () => {
  const state = initial(); state.termsInventory.complete = false;
  mount(state);
  expect(host!.querySelector('button')!.disabled).toBe(true);
  expect(fetchIndex).not.toHaveBeenCalled();
});

it('loads excluded cards and their images only after calculation, with a bounded first page', async () => {
  const state = initial();
  state.tempFilters[0] = { ...state.tempFilters[0]!, termKeys: [] };
  const posts = Array.from({ length: 25 }, (_, i) => ({ ...post(i + 1, [1], []), featuredMediaId: i + 100 }));
  state.postsById = Object.fromEntries(posts.map((p) => [p.id, p]));
  state.postOrder = posts.map((p) => p.id);
  state.postIndex = { ...state.postIndex, status: 'success', complete: true };
  vi.mocked(fetchMediaBatch).mockResolvedValue({});
  mount(state);
  expect(fetchMediaBatch).not.toHaveBeenCalled();
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(0);
  await click();
  expect(host!.textContent).toContain('Excluded Posts: 25');
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(24);
  expect(vi.mocked(fetchMediaBatch).mock.calls[0]?.[1]).toHaveLength(24);
  const more = [...host!.querySelectorAll('button')].find((button) => button.textContent === 'Show more excluded posts')!;
  await act(async () => { more.click(); });
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(25);
  expect(fetchIndex).not.toHaveBeenCalled();
});

it('counts distinct MATCH terms and excludes only posts strictly below the required number', () => {
  const state = initial();
  const posts = [post(1, [], []), post(2, [1], [99]), post(3, [1, 1], [1]), post(4, [1], [1, 2])];
  state.postsById = Object.fromEntries(posts.map((p) => [p.id, p]));
  state.postOrder = posts.map((p) => p.id);
  expect(getExcludedPosts(state, new Set(['category:1', 'post_tag:1', 'post_tag:2']), 3).map((p) => p.id)).toEqual([1, 2, 3]);
});

it('waits for Calculate after slider changes and uses only the active MATCH selection', async () => {
  const state = initial();
  state.tempFilters[0] = { ...state.tempFilters[0]!, operator: 'AND', notTermKeys: ['post_tag:99'] };
  state.tempFilters.push({ id: 'other', name: 'Other', operator: 'OR', termKeys: ['post_tag:99'] });
  const posts = [post(1, [], [99]), post(2, [1], [1]), post(3, [1], [])];
  state.postsById = Object.fromEntries(posts.map((p) => [p.id, p]));
  state.postOrder = posts.map((p) => p.id);
  state.postIndex = { ...state.postIndex, status: 'success', complete: true };
  mount(state);
  const slider = host!.querySelector<HTMLInputElement>('[aria-label="Minimum matching terms"]')!;
  expect(slider.value).toBe('1');
  await click();
  expect(host!.querySelector('.ltb-excluded-posts-summary')?.textContent).toContain('Excluded Posts: 1');
  act(() => { slider.value = '3'; slider.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(host!.querySelector('.ltb-excluded-posts-summary')?.textContent).toContain('Excluded Posts: —');
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(0);
  await click();
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(3);
  expect(fetchIndex).not.toHaveBeenCalled();
  act(() => store.dispatch({ type: 'SET_ACTIVE_TEMP_FILTER', filterId: 'other' }));
  expect(host!.querySelectorAll('.ltb-card')).toHaveLength(0);
  act(() => { slider.value = '1'; slider.dispatchEvent(new Event('input', { bubbles: true })); });
  await click();
  expect([...host!.querySelectorAll('.ltb-card-title')].map((el) => el.textContent)).toEqual(['Post 2', 'Post 3']);
});
