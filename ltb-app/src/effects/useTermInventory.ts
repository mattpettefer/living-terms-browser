import { useEffect } from 'preact/hooks';
import { useStore } from '../state/provider';
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
    dispatch({ type: 'TERMS_LOAD_START', requestId });
    fetchTermInventory(
      state.source,
      ({ terms, loadedPages, totalPages }) => {
        dispatch({ type: 'TERMS_PAGE_LOADED', requestId, terms, loadedPages, totalPages });
      },
      controller.signal,
    )
      .then(() => {
        // All source categories and tags are assignable. Keep the legacy field
        // empty for compatibility with existing saved configuration documents.
        dispatch({ type: 'TERMS_LOAD_COMPLETE', requestId, excludedTermKeys: [] });
      })
      .catch((e) => {
        if (!isAbortError(e)) dispatch({ type: 'TERMS_LOAD_ERROR', requestId, error: describeError(e) });
      });
  }, [status]);

  return { retry: () => dispatch({ type: 'TERMS_LOAD_RESET' }) };
}
