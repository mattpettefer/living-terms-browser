import { useEffect } from 'preact/hooks';
import { useStore } from '../state/provider';
import { isAbortError, newRequestId, takeController } from '../services/requestCache';
import { describeError, fetchPostIndex } from '../services/wordpress';

/** Loads the complete lightweight post index once per store instance; Overview lists derive from it locally. */
export function usePostIndex(enabled = true) {
  const { state, dispatch } = useStore();
  const status = state.postIndex.status;

  useEffect(() => {
    if (!enabled || status !== 'idle') return;
    const requestId = newRequestId('index');
    const controller = takeController('index');
    dispatch({ type: 'INDEX_LOAD_START', requestId });
    fetchPostIndex(
      state.source,
      ({ posts, loadedPages, totalPages, totalPosts }) => dispatch({ type: 'INDEX_PAGE_LOADED', requestId, posts, loadedPages, totalPages, totalPosts }),
      controller.signal,
    )
      .then(() => dispatch({ type: 'INDEX_LOAD_COMPLETE', requestId }))
      .catch((e) => {
        if (!isAbortError(e)) dispatch({ type: 'INDEX_LOAD_ERROR', requestId, error: describeError(e) });
      });
  }, [status, enabled]);

  return { index: state.postIndex, retry: () => dispatch({ type: 'INDEX_LOAD_RESET' }) };
}
