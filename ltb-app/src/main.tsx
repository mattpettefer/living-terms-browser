import { render } from 'preact';
import { App } from './app';
import { loadTempFilters, localStorageAdapter, unwrapShortcode, validateImport } from './services/persistence';
import type { TempFilterSnapshot } from './state/reducer';
import { markSeedApplied, readSeedText, seedIsNew } from './services/seed';
import { createInitialState, StoreProvider } from './state/provider';
import type { AppState, Assignments, DestinationExclusions, PostSelections, UnresolvedAssignment } from './state/types';
import './styles/app.css';
import './styles/article.css';

const DEFAULT_SOURCE = 'https://living.life.edu';

type SavedConfig = { destinationExclusions: DestinationExclusions | null; postSelections: PostSelections | null; assignments: Assignments; unresolved: UnresolvedAssignment[] };

function loadSaved(sourceUrl: string): SavedConfig | undefined {
  try {
    const doc = localStorageAdapter.load(sourceUrl);
    if (!doc) return undefined;
    const r = validateImport(doc, { sourceUrl, excludedTermKeys: new Set(), knownTermKeys: null });
    return { destinationExclusions: r.destinationExclusions, postSelections: r.postSelections, assignments: r.assignments, unresolved: r.unresolved };
  } catch (e) {
    console.error('[ltb] Could not restore saved configuration:', e);
    return undefined;
  }
}

/**
 * Shortcode inner content acts as an import. It is applied (replacing local
 * assignments) the first time a given seed text is seen for this source, so
 * editing the shortcode re-imports while ordinary page loads keep local edits.
 */
function applySeed(text: string | null, sourceUrl: string, hasSaved: boolean): (SavedConfig & { tempFilters: TempFilterSnapshot | null }) | undefined {
  if (!text) return undefined;
  // Re-apply when the shortcode content changed, or when this browser has no saved mapping at all.
  if (!seedIsNew(sourceUrl, text) && hasSaved) {
    console.info('[ltb] Page configuration unchanged since last import; keeping local edits. Use "Re-import page configuration" in Config to reset.');
    return undefined;
  }
  try {
    const r = validateImport(JSON.parse(unwrapShortcode(text)), { sourceUrl, excludedTermKeys: new Set(), knownTermKeys: null });
    markSeedApplied(sourceUrl, text);
    console.info(`[ltb] Imported ${Object.keys(r.assignments).length} assignments from page configuration.`);
    return { destinationExclusions: r.destinationExclusions, postSelections: r.postSelections, assignments: r.assignments, unresolved: r.unresolved, tempFilters: r.tempFilters };
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

  const seedText = readSeedText(el);
  const saved = loadSaved(source.baseUrl);
  const seeded = applySeed(seedText, source.baseUrl, !!saved && (Object.keys(saved.assignments).length > 0 || Object.keys(saved.postSelections ?? {}).length > 0));
  const initial: AppState = createInitialState(source, seeded ? { ...seeded, destinationExclusions: seeded.destinationExclusions ?? saved?.destinationExclusions, postSelections: seeded.postSelections ?? saved?.postSelections } : saved, seeded?.tempFilters ?? loadTempFilters(source.baseUrl), seedText);
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
