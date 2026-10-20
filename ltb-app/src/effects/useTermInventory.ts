import { useEffect } from 'preact/hooks';
import { isExcludedTermName } from '../state/destinations';
import { useStore } from '../state/provider';
import type { TermKey } from '../state/types';
import { isAbortError, newRequestId, takeController } from '../services/requestCache';
import { describeError, fetchTermInventory } from '../services/wordpress';

/** Loads the complete category + tag inventory once per store instance. */
export function useTermInventory() {
  const { state, dispatch } = useStore();
  const status = state.termsInventory.status;

  useEffect(() => {
    if (status !== 'idle') return;
    const requestId = newRequestId('terms');
    const controller = takeController('terms');
    const names = new Map<TermKey, string>();
    dispatch({ type: 'TERMS_LOAD_START', requestId });
    fetchTermInventory(
      state.source,
      ({ terms, loadedPages, totalPages }) => {
        for (const t of terms) names.set(t.key, t.name);
        dispatch({ type: 'TERMS_PAGE_LOADED', requestId, terms, loadedPages, totalPages });
      },
      controller.signal,
    )
      .then(() => {
        const excludedTermKeys = [...names].filter(([, name]) => isExcludedTermName(name)).map(([key]) => key);
        dispatch({ type: 'TERMS_LOAD_COMPLETE', requestId, excludedTermKeys });
      })
      .catch((e) => {
        if (!isAbortError(e)) dispatch({ type: 'TERMS_LOAD_ERROR', requestId, error: describeError(e) });
      });
  }, [status]);

  return { retry: () => dispatch({ type: 'TERMS_LOAD_RESET' }) };
}
