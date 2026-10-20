import { useHashRouter } from './effects/useHashRouter';
import { usePersistence } from './effects/usePersistence';
import { useTermInventory } from './effects/useTermInventory';
import type { PersistenceAdapter } from './services/persistence';
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
    <div class="ltb-app">
      <header class="ltb-header">
        <div class="ltb-brand">
          <span class="ltb-brand-title">Living Term Browser</span>
          <span class="ltb-brand-source">{state.source.baseUrl.replace(/^https?:\/\//, '')}</span>
        </div>
        <nav class="ltb-nav" aria-label="Main">
          <a class={`ltb-nav-link${view === 'overview' || view === 'article' ? ' is-active' : ''}`} aria-current={view === 'overview' ? 'page' : undefined} href="#/overview">
            Overview
          </a>
          <a class={`ltb-nav-link${view === 'config' ? ' is-active' : ''}`} aria-current={view === 'config' ? 'page' : undefined} href={`#/config/${state.ui.activeConfigCategory}`}>
            Config
          </a>
        </nav>
      </header>
      <main class="ltb-main">
        {view === 'overview' && <Overview />}
        {view === 'config' && <Config />}
        {view === 'article' && <ArticleView />}
      </main>
    </div>
  );
}
