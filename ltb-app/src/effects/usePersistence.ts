import { useEffect } from 'preact/hooks';
import { useStore } from '../state/provider';
import { buildConfigDocument, type PersistenceAdapter } from '../services/persistence';

const DEBOUNCE_MS = 300;

/** Autosaves configuration whenever an assignment change marks the store unsaved. */
export function usePersistence(adapter: PersistenceAdapter) {
  const { state, dispatch } = useStore();
  const { assignments, unresolvedAssignments, excludedTermKeys } = state;
  const unsaved = state.persistence.status === 'unsaved';

  useEffect(() => {
    if (!unsaved) return;
    dispatch({ type: 'PERSIST_STATUS', status: 'saving' });
    const timer = window.setTimeout(() => {
      try {
        adapter.save(buildConfigDocument({ sourceUrl: state.source.baseUrl, assignments, excludedTermKeys, unresolvedAssignments }));
        dispatch({ type: 'PERSIST_STATUS', status: 'saved' });
      } catch (e) {
        dispatch({ type: 'PERSIST_STATUS', status: 'error', error: e instanceof Error ? e.message : 'Could not save configuration' });
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [unsaved, assignments, unresolvedAssignments, excludedTermKeys, adapter, dispatch, state.source.baseUrl]);
}
