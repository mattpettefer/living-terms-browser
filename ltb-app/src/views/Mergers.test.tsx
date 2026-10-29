import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { StoreProvider, useStore } from '../state/provider';
import { createInitialState, reducer } from '../state/reducer';
import { normalizePost, normalizeTerm } from '../services/normalize';
import { Config } from './Config';
import { Mergers } from './Mergers';
import { ArticleView } from './ArticleView';
import { TempFilterLines } from '../components/TempFilterLines';
import { ExcludedPostsList } from '../components/ExcludedPostsList';
import { usePersistence } from '../effects/usePersistence';
import { localStorageAdapter, validateImport } from '../services/persistence';
import { parseHash, routeToHash } from '../effects/useHashRouter';
import type { AppState, Merger } from '../state/types';

vi.mock('../effects/useTermInventory', () => ({ useTermInventory: () => ({ retry: vi.fn() }) }));
vi.mock('../effects/useMediaBatch', () => ({ useMediaBatch: vi.fn(), imageFor: () => null }));
const merger: Merger = { id: 'lead', name: 'Leadership', slug: 'leadership', termKeys: ['category:1', 'post_tag:1'] };
let host: HTMLDivElement | undefined, store: ReturnType<typeof useStore>;
function fixture() {
  const state = createInitialState({ baseUrl: 'https://mergers.test', postsRestBase: 'posts' });
  const terms = [normalizeTerm({ id: 1, name: 'Leadership', slug: 'leadership', count: 2 }, 'category'), normalizeTerm({ id: 1, name: 'leadership', slug: 'leadership-tag', count: 2 }, 'post_tag')];
  state.termsByKey = Object.fromEntries(terms.map((t) => [t.key, t])); state.termOrder = terms.map((t) => t.key);
  const posts = [normalizePost({ id: 1, categories: [1], tags: [1], title: { rendered: 'Both' }, content: { rendered: '<p>Body</p>' }, date: '', modified: '', link: '' }), normalizePost({ id: 2, categories: [1], tags: [], title: { rendered: 'Category' }, date: '', modified: '', link: '' }), normalizePost({ id: 3, categories: [], tags: [1], title: { rendered: 'Tag' }, date: '', modified: '', link: '' })];
  state.postsById = Object.fromEntries(posts.map((p) => [p.id, p])); state.postOrder = posts.map((p) => p.id);
  state.postIndex = { ...state.postIndex, status: 'success', complete: true };
  state.termsInventory = { ...state.termsInventory, status: 'success', complete: true };
  state.mergers = [merger]; state.ui.activeConfigCategory = 'temp-filter'; state.ui.minTermPostCount = 3;
  state.tempFilters[0]!.termKeys = ['category:1'];
  state.ui.selectedPostId = 1;
  return state;
}
type View = 'config' | 'mergers' | 'lines' | 'article' | 'excluded';
function Harness({ view }: { view: View }) {
  store = useStore(); usePersistence(localStorageAdapter);
  return view === 'config' ? <Config /> : view === 'mergers' ? <Mergers /> : view === 'article' ? <ArticleView /> : view === 'excluded' ? <ExcludedPostsList posts={[store.state.postsById[2]!]} /> : <TempFilterLines showPostCounts />;
}
function mount(state: AppState, view: View) {
  host = document.createElement('div'); document.body.append(host);
  act(() => render(<StoreProvider initialState={state}><Harness view={view} /></StoreProvider>, host!));
}
function button(label: string) { const b = [...host!.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent === label || el.getAttribute('aria-label') === label); if (!b) throw new Error('Missing button: ' + label); return b; }
function fill(input: HTMLInputElement, value: string) { act(() => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }); }
afterEach(() => { if (host) { act(() => render(null, host!)); host.remove(); host = undefined; } localStorage.clear(); vi.useRealTimers(); });

it('shows a single total in Config above the individual count threshold, dims companions and bulk-selects shown members', () => {
  const state = fixture(); mount(state, 'config');
  const group = host!.querySelector('#ltb-config-panel > .ltb-term-list .ltb-merger-bar')!;
  expect(group).not.toBeNull(); expect(group.querySelectorAll('.ltb-term-count')).toHaveLength(1); expect(group.querySelector('.ltb-term-count')!.textContent).toBe('3');
  expect(group.querySelector('.is-dimmed .ltb-term-label')!.textContent).toBe('leadership');
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['category:1']);
  act(() => button('Select all shown').click());
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['category:1', 'post_tag:1']);
  fill(host!.querySelector<HTMLInputElement>('input[type=number]')!, '4');
  expect(host!.querySelector('#ltb-config-panel > .ltb-term-list .ltb-merger-bar')).toBeNull();
  expect(store.state.tempFilters[0]!.termKeys).toHaveLength(2);
});
it('adds an absent member on click and preserves NOT behavior with separate grouped bars', () => {
  const state = fixture(); state.tempFilters[0]!.notTermKeys = ['post_tag:1']; mount(state, 'lines');
  expect(host!.querySelectorAll('.ltb-merger-bar')).toHaveLength(2);
  expect(host!.querySelector('.ltb-merger-member.is-dimmed')!.textContent).toContain('NOT');
  act(() => button('Add leadership to matching terms').click());
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['category:1', 'post_tag:1']); expect(store.state.tempFilters[0]!.notTermKeys).toEqual([]);
  expect(host!.querySelectorAll('.ltb-merger-bar')).toHaveLength(1);
  act(() => button('Remove leadership from matching terms').click());
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['category:1']);
});
it('groups article terms and excluded-post detail without attaching companions to the post', () => {
  const state = fixture(); mount(state, 'article');
  expect(host!.querySelectorAll('.ltb-merger-bar')).toHaveLength(1);
  expect(host!.querySelector('.ltb-merger-member.is-dimmed')!.textContent).toContain('leadership');
  act(() => render(null, host!));
  act(() => render(<StoreProvider initialState={state}><Harness view="excluded" /></StoreProvider>, host!));
  expect(host!.querySelectorAll('.ltb-merger-bar')).toHaveLength(1);
  expect(host!.querySelector('.ltb-merger-member.is-dimmed')!.textContent).toBe('leadership');
  expect(store.state.postsById[2]!.termKeys).toEqual(['category:1']);
});
it('creates, autosaves, renames, previews and dissolves a merger without rewriting selections', async () => {
  vi.useFakeTimers(); const state = fixture(); state.mergers = []; mount(state, 'mergers');
  act(() => button('New merger').click());
  const inputs = host!.querySelectorAll<HTMLInputElement>('.ltb-merger-fields input');
  fill(inputs[0]!, 'Leadership'); expect(inputs[1]!.value).toBe('leadership');
  act(() => host!.querySelectorAll<HTMLInputElement>('.ltb-merger-picker input')[0]!.click());
  act(() => host!.querySelectorAll<HTMLInputElement>('.ltb-merger-picker input')[1]!.click());
  act(() => { host!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(store.state.mergers).toHaveLength(1);
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['category:1']);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  const saved = localStorageAdapter.load(state.source.baseUrl)!;
  expect(saved.mergers).toEqual(store.state.mergers);
  const imported = validateImport(saved, { sourceUrl: state.source.baseUrl, excludedTermKeys: new Set(), knownTermKeys: null });
  expect(createInitialState(state.source, imported).mergers).toEqual(store.state.mergers);
  act(() => button('View posts').click()); expect(host!.querySelectorAll('.ltb-merger-preview li')).toHaveLength(3);
  const id = store.state.mergers[0]!.id;
  act(() => button('Edit Leadership').click()); fill(host!.querySelector<HTMLInputElement>('.ltb-merger-fields input')!, 'Leaders');
  act(() => { host!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(store.state.mergers[0]!.id).toBe(id);
  act(() => button('Dissolve Leaders').click()); expect(store.state.mergers).toEqual([]);
  expect(store.state.tempFilters[0]!.termKeys).toEqual(['category:1']);
});
it('routes Mergers separately from Config', () => {
  expect(parseHash('#/mergers')).toEqual({ view: 'mergers' }); expect(routeToHash({ view: 'mergers' })).toBe('#/mergers');
  expect(reducer(fixture(), { type: 'NAVIGATE', view: 'mergers' }).ui.view).toBe('mergers');
});

it('selects the whole destination group from its title without deselecting existing members', () => {
  const state = fixture(); state.ui.activeConfigCategory = 'campus-life'; state.assignments = { 'category:1': 'campus-life' };
  state.destinationExclusions = { 'campus-life': ['post_tag:1'] };
  mount(state, 'config');
  const title = () => host!.querySelector<HTMLButtonElement>('#ltb-config-panel > .ltb-term-list .ltb-merger-select-all')!;
  act(() => title().click());
  expect(store.state.assignments).toEqual({ 'category:1': 'campus-life', 'post_tag:1': 'campus-life' });
  expect(store.state.destinationExclusions['campus-life']).toEqual([]);
  const after = store.state;
  act(() => title().click()); expect(store.state).toBe(after);
  act(() => host!.querySelector<HTMLButtonElement>('#ltb-config-panel > .ltb-term-list .ltb-merger-member button')!.click());
  expect(Object.keys(store.state.assignments)).toHaveLength(1);
});
it('selects all members into destination NOT from its row title and keeps other destinations intact', () => {
  const state = fixture(); state.ui.activeConfigCategory = 'campus-life'; state.assignments = { 'category:1': 'campus-life', 'post_tag:1': 'athletics' };
  mount(state, 'config');
  act(() => button('Edit NOT terms').click());
  act(() => host!.querySelector<HTMLButtonElement>('#ltb-config-panel > .ltb-term-list .ltb-merger-select-all')!.click());
  expect(store.state.destinationExclusions['campus-life']).toEqual(merger.termKeys);
  expect(store.state.assignments).toEqual({ 'post_tag:1': 'athletics' });
  const after = store.state;
  act(() => host!.querySelector<HTMLButtonElement>('.ltb-filter-line.is-not .ltb-merger-select-all')!.click()); expect(store.state).toBe(after);
});
it.each(['config', 'lines', 'article'] as const)('selects original MATCH members additively from the group title in %s', (view) => {
  const state = fixture(); state.tempFilters[0]!.operator = 'AND'; state.tempFilters[0]!.notTermKeys = ['post_tag:1']; mount(state, view);
  act(() => button('Select all members of Leadership').click());
  expect(store.state.tempFilters[0]!.termKeys).toEqual(merger.termKeys);
  expect(store.state.tempFilters[0]!.notTermKeys).toEqual([]);
  expect(store.state.tempFilters[0]!.operator).toBe('AND');
  const after = store.state;
  act(() => button('Select all members of Leadership').click()); expect(store.state).toBe(after);
});

it('locks owned terms, stages an explicit move, and can undo or cancel without changing saved mergers', () => {
  const state = fixture(); mount(state, 'mergers');
  act(() => button('New merger').click());
  const checkbox = () => host!.querySelector<HTMLInputElement>('.ltb-merger-picker input')!;
  expect(checkbox().disabled).toBe(true);
  act(() => checkbox().click()); expect(checkbox().checked).toBe(false);
  act(() => button('Move Leadership from Leadership here').click());
  expect(checkbox().checked).toBe(true); expect(store.state.mergers).toEqual(state.mergers);
  act(() => button('Undo move of Leadership').click()); expect(checkbox().disabled).toBe(true); expect(checkbox().checked).toBe(false);
  act(() => button('Move Leadership from Leadership here').click());
  act(() => button('Cancel').click()); expect(store.state.mergers).toEqual(state.mergers);
});
it('saves an explicit transfer atomically without changing destination assignments or filters', () => {
  const state = fixture(); state.assignments = { 'category:1': 'campus-life' }; mount(state, 'mergers');
  act(() => button('New merger').click());
  fill(host!.querySelector<HTMLInputElement>('.ltb-merger-fields input')!, 'New Leaders');
  act(() => button('Move Leadership from Leadership here').click());
  act(() => { host!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(store.state.mergers.find((m) => m.id === 'lead')!.termKeys).toEqual(['post_tag:1']);
  expect(store.state.mergers.find((m) => m.name === 'New Leaders')!.termKeys).toEqual(['category:1']);
  expect(store.state.assignments).toBe(state.assignments); expect(store.state.tempFilters).toBe(state.tempFilters);
});
it('explains when moving the final member dissolves its previous merger on save', () => {
  const state = fixture(); state.mergers = [{ ...merger, termKeys: ['category:1'] }]; mount(state, 'mergers');
  act(() => button('New merger').click()); fill(host!.querySelector<HTMLInputElement>('.ltb-merger-fields input')!, 'New Leaders');
  act(() => button('Move Leadership from Leadership here').click()); expect(host!.textContent).toContain('Saving will dissolve');
  act(() => { host!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(store.state.mergers).toHaveLength(1); expect(store.state.mergers[0]!.name).toBe('New Leaders');
});
it('rejects duplicate ownership without an explicit move and rejects stale move choices', () => {
  const state = fixture(); const target: Merger = { id: 'new', name: 'New', slug: 'new', termKeys: ['category:1'] };
  expect(() => reducer(state, { type: 'SAVE_MERGER', merger: target })).toThrow(/only one merger/);
  expect(() => reducer(state, { type: 'SAVE_MERGER', merger: target, moves: { 'category:1': 'wrong-owner' } })).toThrow(/changed/);
  expect(state.mergers).toEqual([merger]);
});


it('defaults Final exclusion off, saves the checkbox, and round trips it without changing filters',async()=>{
  vi.useFakeTimers();const state=fixture();mount(state,'mergers');
  const checkbox=()=>host!.querySelector<HTMLInputElement>('input[aria-label="Exclude Leadership from Final"]')!;
  expect(checkbox().checked).toBe(false);
  act(()=>checkbox().click());
  expect(store.state.mergers[0]!.excludeFromFinal).toBe(true);
  expect(store.state.tempFilters).toBe(state.tempFilters);
  expect(store.state.postSelections).toBe(state.postSelections);
  await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
  const saved=localStorageAdapter.load(state.source.baseUrl)!;
  const context={sourceUrl:state.source.baseUrl,excludedTermKeys:new Set<never>(),knownTermKeys:null};
  expect(saved.mergers![0]!.excludeFromFinal).toBe(true);
  const restored=validateImport(JSON.parse(JSON.stringify(saved)),context);
  expect(createInitialState(state.source,restored).mergers[0]!.excludeFromFinal).toBe(true);
  expect(()=>validateImport({...saved,mergers:[{...state.mergers[0]!,excludeFromFinal:'true'}]},context)).toThrow(/boolean/);
  act(()=>button('Edit Leadership').click());
  const draftCheckbox=host!.querySelector<HTMLInputElement>('.ltb-merger-editor input[type=checkbox]')!;
  expect(draftCheckbox.checked).toBe(true);
  act(()=>draftCheckbox.click());
  act(()=>button('Cancel').click());
  expect(checkbox().checked).toBe(true);
  act(()=>checkbox().click());
  expect(store.state.mergers[0]!.excludeFromFinal).toBe(false);
  act(()=>button('New merger').click());
  expect(host!.querySelector<HTMLInputElement>('.ltb-merger-editor input[type=checkbox]')!.checked).toBe(false);
});

it('brings a lower merger editor into view, focuses its name, and keeps focus while editing', () => {
  const state = fixture();
  state.mergers = [
    { ...merger, termKeys: ['category:1'] },
    { id: 'dash', name: 'dash-to-exclude', slug: 'dash-to-exclude', termKeys: ['post_tag:1'], excludeFromFinal: true },
  ];
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  try {
    mount(state, 'mergers');
    act(() => button('Edit dash-to-exclude').click());
    const editor = host!.querySelector('form')!;
    const name = editor.querySelector<HTMLInputElement>('.ltb-merger-fields input')!;
    expect(name.value).toBe('dash-to-exclude');
    expect(document.activeElement).toBe(name);
    expect(scroll.mock.contexts).toEqual([editor]);
    const search = editor.querySelector<HTMLInputElement>('input[type=search]')!;
    search.focus(); fill(search, 'leadership');
    expect(document.activeElement).toBe(search);
    expect(scroll).toHaveBeenCalledTimes(1);
    act(() => button('Cancel').click());
    expect(host!.querySelector('form')).toBeNull();
    expect(store.state.mergers).toEqual(state.mergers);
    expect(button('Edit dash-to-exclude').disabled).toBe(false);
    act(() => button('New merger').click());
    expect(document.activeElement).toBe(host!.querySelector('.ltb-merger-fields input'));
    expect(scroll).toHaveBeenCalledTimes(2);
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  }
});
