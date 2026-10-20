import { useCallback, useEffect } from 'preact/hooks';
import { useStore } from '../state/provider';
import { isAbortError, newRequestId, releaseController, takeController } from '../services/requestCache';
import { describeError, fetchPost } from '../services/wordpress';

export function useArticle(postId: number | null) {
  const { state, dispatch } = useStore();
  const post = postId !== null ? state.postsById[postId] : undefined;
  const request = postId !== null ? state.articleRequestsById[postId] : undefined;
  const needsFetch = postId !== null && (!post || !post.contentLoaded || !post.termsComplete);

  const load = useCallback(() => {
    if (postId === null) return;
    const requestId = newRequestId('article');
    const controller = takeController(`article:${postId}`);
    dispatch({ type: 'ARTICLE_START', postId, requestId });
    fetchPost(state.source, postId, controller.signal)
      .then((r) => {
        if (r.terms.length) dispatch({ type: 'TERMS_RESOLVED', terms: r.terms });
        dispatch({ type: 'ARTICLE_SUCCESS', postId, requestId, post: r.post });
      })
      .catch((e) => {
        if (!isAbortError(e)) dispatch({ type: 'ARTICLE_ERROR', postId, requestId, error: describeError(e) });
      })
      .finally(() => releaseController(`article:${postId}`, controller));
  }, [dispatch, postId, state.source]);

  useEffect(() => {
    if (needsFetch && (!request || request.status === 'idle')) load();
  }, [needsFetch, request, load]);

  return { post, request, retry: load };
}
