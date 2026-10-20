import { render } from 'preact';
import { App } from './app';
import { localStorageAdapter, validateImport } from './services/persistence';
import { markSeedApplied, readSeedText, seedIsNew } from './services/seed';
import { createInitialState, StoreProvider } from './state/provider';
import type { AppState, Assignments, UnresolvedAssignment } from './state/types';
import './styles/app.css';
import './styles/article.css';

const DEFAULT_SOURCE = 'https://living.life.edu';

type SavedConfig = { assignments: Assignments; unresolved: UnresolvedAssignment[] };

function loadSaved(sourceUrl: string): SavedConfig | undefined {
  try {
    const doc = localStorageAdapter.load(sourceUrl);
    if (!doc) return undefined;
    const r = validateImport(doc, { sourceUrl, excludedTermKeys: new Set(), knownTermKeys: null });
    return { assignments: r.assignments, unresolved: r.unresolved };
  } catch (e) {
    console.warn('[ltb] Could not restore saved configuration:', e);
    return undefined;
  }
}

/**
 * Shortcode inner content acts as an import. It is applied (replacing local
 * assignments) the first time a given seed text is seen for this source, so
 * editing the shortcode re-imports while ordinary page loads keep local edits.
 */
function applySeed(el: HTMLElement, sourceUrl: string): SavedConfig | undefined {
  const text = readSeedText(el);
  if (!text || !seedIsNew(sourceUrl, text)) return undefined;
  try {
    const r = validateImport(JSON.parse(text), { sourceUrl, excludedTermKeys: new Set(), knownTermKeys: null });
    markSeedApplied(sourceUrl, text);
    for (const w of r.warnings) console.warn('[ltb] seed:', w);
    return { assignments: r.assignments, unresolved: r.unresolved };
  } catch (e) {
    console.error('[ltb] Shortcode configuration could not be imported:', e);
    return undefined;
  }
}

function mount(el: HTMLElement) {
  if (el.dataset.ltbMounted) return;
  el.dataset.ltbMounted = '1';
  el.classList.add('ltb-root');

  const source = {
    baseUrl: (el.dataset.sourceUrl || DEFAULT_SOURCE).replace(/\/+$/, ''),
    postsRestBase: el.dataset.postsRestBase || 'posts',
  };

  const seeded = applySeed(el, source.baseUrl);
  const initial: AppState = createInitialState(source, seeded ?? loadSaved(source.baseUrl));
  if (seeded) initial.persistence = { ...initial.persistence, status: 'unsaved' };

  render(
    <StoreProvider initialState={initial}>
      <App persistence={localStorageAdapter} />
    </StoreProvider>,
    el,
  );
}

function boot() {
  document.querySelectorAll<HTMLElement>('[data-ltb-app]').forEach(mount);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
