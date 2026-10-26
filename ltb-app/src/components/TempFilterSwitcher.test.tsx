import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePersistence } from '../effects/usePersistence';
import { loadTempFilters, localStorageAdapter } from '../services/persistence';
import { StoreProvider, useStore } from '../state/provider';
import { createInitialState } from '../state/reducer';
import { TempFilterSwitcher } from './TempFilterSwitcher';

const source = { baseUrl: 'https://filters.test', postsRestBase: 'posts' };
let host: HTMLDivElement;
let store: ReturnType<typeof useStore>;
function Harness() {
  store = useStore();
  usePersistence(localStorageAdapter);
  return <TempFilterSwitcher manage />;
}
function mount(initialState = createInitialState(source)) {
  act(() => render(<StoreProvider initialState={initialState}><Harness /></StoreProvider>, host));
}
function operatorButtons() { return [...host.querySelectorAll<HTMLButtonElement>('.ltb-tf-operator')]; }
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => render(null, host)); host.remove(); });

describe('secondary bar operator toggles', () => {
  it('saves separate operators for each named filter and restores them on reload', () => {
    mount();
    expect(operatorButtons()[0]!.textContent).toBe('OR');
    act(() => operatorButtons()[0]!.click());
    expect(operatorButtons()[0]!.textContent).toBe('AND');
    expect(operatorButtons()[0]!.getAttribute('aria-pressed')).toBe('true');
    act(() => host.querySelector<HTMLButtonElement>('.ltb-tf-add')!.click());
    expect(operatorButtons().map(b => b.textContent)).toEqual(['AND', 'OR']);
    const saved = loadTempFilters(source.baseUrl)!;
    expect(saved.filters.map(f => f.operator)).toEqual(['AND', 'OR']);
    act(() => render(null, host));
    mount(createInitialState(source, undefined, saved));
    expect(operatorButtons().map(b => b.textContent)).toEqual(['AND', 'OR']);
    const activeId = store.state.activeTempFilterId;
    act(() => operatorButtons()[0]!.click());
    expect(store.state.activeTempFilterId).toBe(activeId);
    expect(loadTempFilters(source.baseUrl)?.filters.map(f => f.operator)).toEqual(['OR', 'OR']);
  });

  it('keeps No Filter disabled when changing an operator', () => {
    mount();
    act(() => host.querySelector<HTMLButtonElement>('.ltb-tf-none button')!.click());
    act(() => operatorButtons()[0]!.click());
    expect(store.state.tempFilterEnabled).toBe(false);
    expect(loadTempFilters(source.baseUrl)?.enabled).toBe(false);
    expect(loadTempFilters(source.baseUrl)?.filters[0]?.operator).toBe('AND');
  });
});
