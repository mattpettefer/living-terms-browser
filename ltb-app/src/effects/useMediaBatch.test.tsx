import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StoreProvider, createInitialState, useStore } from '../state/provider';
import { fetchMediaBatch } from '../services/wordpress';
import { imageFor, useMediaBatch } from './useMediaBatch';
import type { PostRecord } from '../state/types';

vi.mock('../services/wordpress', () => ({ fetchMediaBatch: vi.fn() }));
const source = { baseUrl: 'https://media.test', postsRestBase: 'posts' };
const post = (id: number): PostRecord => ({ id, title: 'Post ' + id, excerptHtml: '', sourceUrl: '', date: '', modified: '', featuredMediaId: id + 100, imageUrl: null, termKeys: [], termsComplete: true, contentLoaded: false });
let store: ReturnType<typeof useStore>;
let host: HTMLDivElement;
let pending: Array<{ ids: number[]; signal?: AbortSignal; resolve: (images: Record<number, string | null>) => void }>;
function Harness({ posts }: { posts: PostRecord[] }) {
  store = useStore();
  useMediaBatch(posts);
  return <div>{posts.map((p) => <img key={p.id} data-post={p.id} src={imageFor(p, store.state.mediaById) ?? undefined} />)}</div>;
}
beforeEach(() => {
  pending = [];
  vi.mocked(fetchMediaBatch).mockImplementation((_source, ids, signal) => new Promise((resolve, reject) => {
    pending.push({ ids, signal, resolve });
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  host = document.createElement('div'); document.body.append(host);
});
afterEach(async () => {
  await act(async () => { render(null, host); for (const request of pending) request.resolve({}); });
  host.remove(); vi.clearAllMocks();
});

it('finishes the initial image request despite unrelated renders while the index loads', async () => {
  await act(async () => render(<StoreProvider initialState={createInitialState(source)}><Harness posts={[post(1), post(1)]} /></StoreProvider>, host));
  expect(pending).toHaveLength(1);
  await act(async () => store.dispatch({ type: 'SET_TERM_SEARCH', search: 'index update' }));
  expect(pending[0]!.signal?.aborted ?? false).toBe(false);
  expect(pending).toHaveLength(1);
  await act(async () => pending[0]!.resolve({ 101: 'https://media.test/one.jpg' }));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('https://media.test/one.jpg');
  expect(pending).toHaveLength(1);
});

it('loads newly displayed images without cancelling or duplicating the pending ones', async () => {
  const state = createInitialState(source);
  await act(async () => render(<StoreProvider initialState={state}><Harness posts={[post(1)]} /></StoreProvider>, host));
  await act(async () => render(<StoreProvider initialState={state}><Harness posts={[post(1), post(2)]} /></StoreProvider>, host));
  expect(pending.map((r) => r.ids)).toEqual([[101], [102]]);
  expect(pending[0]!.signal?.aborted ?? false).toBe(false);
  await act(async () => pending[1]!.resolve({ 102: 'https://media.test/two.jpg' }));
  await act(async () => pending[0]!.resolve({ 101: 'https://media.test/one.jpg' }));
  expect([...host.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(['https://media.test/one.jpg', 'https://media.test/two.jpg']);
  expect(pending).toHaveLength(2);
});

it('allows remounting while old requests finish and ignores results from the old source', async () => {
  await act(async () => render(<StoreProvider initialState={createInitialState(source)}><Harness posts={[post(1)]} /></StoreProvider>, host));
  await act(async () => render(null, host));
  await act(async () => render(<StoreProvider initialState={createInitialState({ ...source, baseUrl: 'https://other.test' })}><Harness posts={[post(1)]} /></StoreProvider>, host));
  expect(pending).toHaveLength(2);
  await act(async () => pending[0]!.resolve({ 101: 'https://media.test/old.jpg' }));
  expect(store.state.mediaById[101]).toBeUndefined();
  await act(async () => pending[1]!.resolve({ 101: 'https://other.test/new.jpg' }));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('https://other.test/new.jpg');
});
