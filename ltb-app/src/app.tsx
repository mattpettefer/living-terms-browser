import { useHashRouter } from './effects/useHashRouter';
import { usePersistence } from './effects/usePersistence';
import { useTermInventory } from './effects/useTermInventory';
import type { PersistenceAdapter } from './services/persistence';
import { destinationColorVars } from './state/destinations';
import { useStore } from './state/provider';
import { ArticleView } from './views/ArticleView';
import { Config } from './views/Config';
import { Overview } from './views/Overview';

export function App({ persistence }: { persistence: PersistenceAdapter }) {
  const { state } = useStore();
  useHashRouter();
  useTermInventory();
  usePersistence(persistence);
  const view = state.ui.view;

  return (
    <div class="ltb-app" style={destinationColorVars()}>
      <header class="ltb-header">
        <div class="ltb-brand">
          <span class="ltb-brand-title">Living Term Browser</span>
          <span class="ltb-brand-source">{state.source.baseUrl.replace(/^https?:\/\//, '')}</span>
        </div>
        <nav class="ltb-nav" aria-label="Main">
          <a class={`ltb-nav-link${view === 'overview' || (view === 'article' && state.ui.listView === 'overview') ? ' is-active' : ''}`} aria-current={view === 'overview' ? 'page' : undefined} href="#/overview">
            Overview
          </a>
          <a class={'ltb-nav-link' + (view === 'selections' || (view === 'article' && state.ui.listView === 'selections') ? ' is-active' : '')} aria-current={view === 'selections' ? 'page' : undefined} href={'#/selections/' + state.ui.selectionsCategory}>Selections</a>
          <a class={`ltb-nav-link${view === 'config' ? ' is-active' : ''}`} aria-current={view === 'config' ? 'page' : undefined} href={`#/config/${state.ui.activeConfigCategory}`}>
            Config
          </a>
        </nav>
      </header>
      <main class="ltb-main">
        {(view === 'overview' || view === 'selections') && <Overview key={view} mode={view} />}
        {view === 'config' && <Config />}
        {view === 'article' && <ArticleView />}
      </main>
    </div>
  );
}
