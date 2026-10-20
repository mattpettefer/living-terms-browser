import { useMemo } from 'preact/hooks';
import { formatDate } from '../components/PostCard';
import { ErrorState, LoadingState } from '../components/States';
import { TermButton } from '../components/TermButton';
import { useArticle } from '../effects/useArticle';
import { routeToHash } from '../effects/useHashRouter';
import { prepareContent } from '../services/content';
import { parseTermKey } from '../services/normalize';
import { destinationName } from '../state/destinations';
import { useStore } from '../state/provider';
import { getExcludedSet, getMatchedDestinations, getPostMatches, getTermWarning, joinNames } from '../state/selectors';
import type { SourceTerm, TermKey } from '../state/types';

export function ArticleView() {
  const { state } = useStore();
  const postId = state.ui.selectedPostId;
  const { post, request, retry } = useArticle(postId);
  const excluded = getExcludedSet(state);
  const backHref = routeToHash({ view: 'overview', category: state.ui.overviewCategory });

  const content = useMemo(
    () => (post?.contentLoaded ? prepareContent(post.contentHtml ?? '', state.source.baseUrl, post.imageUrl) : null),
    [post?.contentHtml, post?.contentLoaded, post?.imageUrl, state.source.baseUrl],
  );

  if (postId === null) return null;
  if (!post && request?.status === 'error') {
    return (
      <section class="ltb-article">
        <a class="ltb-back" href={backHref}>← Back to Overview</a>
        <ErrorState message={request.error === 'Source request failed (404)' ? 'This article could not be found on the source site.' : (request.error ?? 'Request failed')} onRetry={retry} />
      </section>
    );
  }
  if (!post) {
    return (
      <section class="ltb-article">
        <a class="ltb-back" href={backHref}>← Back to Overview</a>
        <LoadingState label="Loading article…" />
      </section>
    );
  }

  const matches = getPostMatches(post, state.assignments, excluded);
  const matched = getMatchedDestinations(matches);
  const overlap = matched.length > 1;

  const terms = post.termKeys.map((key) => ({ key, term: state.termsByKey[key] })).sort((a, b) => labelFor(a).localeCompare(labelFor(b), undefined, { sensitivity: 'base' }));
  const showFeatured = post.imageUrl && !(content?.containsFeaturedImage ?? false);

  return (
    <section class="ltb-article">
      <a class="ltb-back" href={backHref}>← Back to Overview</a>
      <div class="ltb-article-layout">
        <article class="ltb-article-main">
          <header class="ltb-article-header">
            <h1 class="ltb-article-title">{post.title || `Post ${post.id}`}</h1>
            <p class="ltb-article-meta">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              {' · '}
              <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">View on living.life.edu ↗</a>
            </p>
            {matched.length > 0 && (
              <p class="ltb-article-destinations">
                <strong>{matched.length > 1 ? 'Categories: ' : 'Category: '}</strong>
                {joinNames(matched)}
              </p>
            )}
          </header>
          {showFeatured && <img class="ltb-article-featured" src={post.imageUrl!} alt="" />}

          {!post.contentLoaded && request?.status === 'error' && <ErrorState message={request.error ?? 'Failed to load content'} onRetry={retry} />}
          {!post.contentLoaded && request?.status !== 'error' && <LoadingState label="Loading article body…" />}
          {content && (
            <>
              {(content.shortcodes.length > 0 || content.removedEmbeds > 0 || content.isEmpty) && (
                <div class="ltb-render-notice" role="note">
                  <strong>Rendering notice.</strong>{' '}
                  {content.isEmpty && 'The source API returned no renderable body for this post. '}
                  {content.shortcodes.length > 0 && `This legacy post contains unresolved builder shortcodes (${content.shortcodes.join(', ')}) that the source API did not render; layout and some images may be missing. `}
                  {content.removedEmbeds > 0 && `${content.removedEmbeds} embedded frame${content.removedEmbeds === 1 ? ' was' : 's were'} removed for safety. `}
                  <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer">Open the original page ↗</a>
                </div>
              )}
              <div class="ltb-article-content" dangerouslySetInnerHTML={{ __html: content.html }} />
            </>
          )}
        </article>

        <aside class="ltb-article-sidebar" aria-labelledby="ltb-terms-heading">
          <h2 id="ltb-terms-heading" class="ltb-h3">Terms</h2>
          {!post.termsComplete && <p class="ltb-muted">Term list may be incomplete until the full article loads.</p>}
          {overlap && (
            <p class="ltb-sidebar-warning" role="note">
              <span aria-hidden="true">! </span>Red terms contribute to a match in more than one destination category.
            </p>
          )}
          {terms.length === 0 ? (
            <p class="ltb-muted">This post has no categories or tags.</p>
          ) : (
            <div class="ltb-term-list">
              {terms.map(({ key, term }) => {
                const t: SourceTerm = term ?? placeholderTerm(key);
                const isExcluded = excluded.has(key);
                const owner = state.assignments[key];
                const warning = getTermWarning(post, key, state.assignments, excluded);
                const tooltip = warning
                  ? warning.explanation
                  : isExcluded
                    ? 'Excluded term — never assigned and does not affect matching.'
                    : owner
                      ? `Assigned to ${destinationName(owner)}`
                      : null;
                const detail = warning && warning.otherTermKeys.length ? `Other matching terms: ${warning.otherTermKeys.map((k) => state.termsByKey[k]?.name ?? k).join(', ')}` : term ? null : 'Label not yet resolved';
                return <TermButton key={key} term={t} warning={!!warning} tooltip={tooltip} detail={detail} />;
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function labelFor(x: { key: TermKey; term: SourceTerm | undefined }): string {
  return x.term?.name ?? x.key;
}

function placeholderTerm(key: TermKey): SourceTerm {
  const parsed = parseTermKey(key);
  return { key, id: parsed?.id ?? 0, taxonomy: parsed?.taxonomy ?? 'category', name: key, slug: '', sourceCount: 0 };
}
