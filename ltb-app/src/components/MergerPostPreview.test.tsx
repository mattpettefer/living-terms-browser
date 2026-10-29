import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it } from 'vitest';
import { StoreProvider } from '../state/provider';
import { createInitialState } from '../state/reducer';
import { normalizePost, normalizeTerm } from '../services/normalize';
import { MergerPostPreview } from './MergerPostPreview';
import type { AppState, Merger } from '../state/types';

const merger: Merger = { id: 'lead', name: 'Leadership', slug: 'leadership', termKeys: ['category:1', 'post_tag:1'] };
let host: HTMLDivElement | undefined;
function mount(state: AppState) {
  host = document.createElement('div'); document.body.append(host);
  act(() => render(<StoreProvider initialState={state}><MergerPostPreview merger={merger} /></StoreProvider>, host!));
}
function tab(label: string) { return [...host!.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(t => t.textContent === label)!; }
afterEach(() => { if (host) { act(() => render(null, host!)); host.remove(); host = undefined; } });

it('shows only terms common to every unique post, including posts beyond the displayed page', () => {
  const state = createInitialState({ baseUrl: 'https://test.example', postsRestBase: 'posts' });
  const terms = [normalizeTerm({ id: 2, name: 'Campus', slug: 'campus', count: 100 }, 'category'), normalizeTerm({ id: 2, name: 'Campus', slug: 'campus-tag', count: 200 }, 'post_tag')];
  state.termsByKey = Object.fromEntries(terms.map(t => [t.key, t]));
  for (let id = 1; id <= 26; id++) {
    state.postsById[id] = normalizePost({ id, categories: id === 26 ? [2] : [1, 2, 2], tags: id === 25 ? [1, 2, 3] : id === 26 ? [2, 88] : [1, 3, 99], title: { rendered: 'Post ' + id }, date: '', modified: '', link: '' });
    state.postOrder.push(id);
  }
  state.postOrder.push(1);
  const original = JSON.stringify(state);
  mount(state);
  expect(host!.textContent).toContain('25 unique posts');
  expect(host!.querySelectorAll('li')).toHaveLength(24);
  expect(host!.querySelector('table')).toBeNull();
  act(() => tab('Shared categories & tags').click());
  const rows = [...host!.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => cell.textContent));
  expect(rows).toEqual([['Campus', 'Category'], ['post_tag:3', 'Tag']]);
  expect(tab('Shared categories & tags').getAttribute('aria-selected')).toBe('true');
  expect(host!.querySelectorAll('[role=tablist]')).toHaveLength(2);
  expect(host!.querySelector('[role=tablist]')!.nextElementSibling!.getAttribute('role')).toBe('tabpanel');
  expect([...host!.querySelectorAll('[role=tab][aria-selected=true]')].map(t => t.textContent)).toEqual(['Shared categories & tags', 'Shared categories & tags']);
  act(() => { tab('Shared categories & tags').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
  expect(tab('Posts').getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tab('Posts'));
  expect(host!.querySelector('table')).toBeNull();
  expect(JSON.stringify(state)).toBe(original);
});

it('explains when posts have other terms but none in common', () => {
  const state = createInitialState({ baseUrl: 'https://test.example', postsRestBase: 'posts' });
  state.postsById[1] = normalizePost({ id: 1, categories: [1], tags: [1, 2], title: { rendered: 'First post' }, date: '', modified: '', link: '' });
  state.postsById[2] = normalizePost({ id: 2, categories: [1], tags: [1, 3], title: { rendered: 'Second post' }, date: '', modified: '', link: '' });
  state.postOrder = [1, 2]; mount(state);
  act(() => tab('Shared categories & tags').click());
  expect(host!.textContent).toContain('No other categories or tags are shared by every unique post.');
  expect(host!.querySelector('table')).toBeNull();
});
