import { FinalTermsPanel } from '../components/FinalTermsPanel';
import { useSelectTermGroup } from '../effects/useSelectTermGroup';
import { usePostIndex } from '../effects/usePostIndex';
import { GroupedTerms } from '../components/GroupedTerms';
import { useMemo } from 'preact/hooks';
import { formatDate } from '../components/PostCard';
import { ErrorState, LoadingState } from '../components/States';
import { TermButton } from '../components/TermButton';
import { useArticle } from '../effects/useArticle';
import { routeToHash } from '../effects/useHashRouter';
import { prepareContent } from '../services/content';
import { destinationName } from '../state/destinations';
import { useStore } from '../state/provider';
import { getActiveTempFilter, getExcludedSet, getMatchedDestinations, getPostMatches, joinNames } from '../state/selectors';
import type { SourceTerm, TermKey } from '../state/types';

export function ArticleView() {
  const { state, dispatch } = useStore();
  usePostIndex(state.mergers.length > 0);
  const postId = state.ui.selectedPostId;
  const selectGroup = useSelectTermGroup();
  const { post, request, retry } = useArticle(postId);
  const excluded = getExcludedSet(state);
  const backHref = routeToHash(state.ui.listView === 'selections' ? { view: 'selections', category: state.ui.selectionsCategory } : { view: 'overview', category: state.ui.overviewCategory });

  const content = useMemo(
    () => (post?.contentLoaded ? prepareContent(post.contentHtml ?? '', state.source.baseUrl, post.imageUrl) : null),
    [post?.contentHtml, post?.contentLoaded, post?.imageUrl, state.source.baseUrl],
  );

  if (postId === null) return null;
  if (!post && request?.status === 'error') {
    return (
      <section class="ltb-article">
        <a class="ltb-back" href={backHref}>← Back to {state.ui.listView === 'selections' ? 'Selections' : 'Overview'}</a>
        <ErrorState message={request.error === 'Source request failed (404)' ? 'This article could not be found on the source site.' : (request.error ?? 'Request failed')} onRetry={retry} />
      </section>
    );
  }
  if (!post) {
    return (
      <section class="ltb-article">
        <a class="ltb-back" href={backHref}>← Back to {state.ui.listView === 'selections' ? 'Selections' : 'Overview'}</a>
        <LoadingState label="Loading article…" />
      </section>
    );
  }

  const matches = getPostMatches(post, state.assignments, excluded, state.destinationExclusions);
  const matched = getMatchedDestinations(matches);
  const activeFilter = getActiveTempFilter(state);
  const filterSet = new Set(activeFilter.termKeys);
  const inFilterCount = post.termKeys.filter((k) => filterSet.has(k)).length;

  const terms = post.termKeys.map((key) => ({ key, term: state.termsByKey[key] })).sort((a, b) => labelFor(a).localeCompare(labelFor(b), undefined, { sensitivity: 'base' }));
  const showFeatured = post.imageUrl && !(content?.containsFeaturedImage ?? false);

  return (
    <section class="ltb-article">
      <a class="ltb-back" href={backHref}>← Back to {state.ui.listView === 'selections' ? 'Selections' : 'Overview'}</a>
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
              <div class="ltb-article-content" dangerouslySetInnerHTML={{ __html: content.html }} />
            </>
          )}
        </article>

        <div class="ltb-article-sidebar-column">
        <FinalTermsPanel post={post} />
        <aside class="ltb-article-sidebar" aria-labelledby="ltb-terms-heading">
          <h2 id="ltb-terms-heading" class="ltb-h3">Terms</h2>
          <p class="ltb-muted ltb-sidebar-hint">
            Click a term to add it to <strong>{activeFilter.name}</strong> ({activeFilter.operator}: match {activeFilter.operator === 'AND' ? 'all' : 'any'} selected terms)
            {inFilterCount > 0 && ` (${inFilterCount} of this article's terms selected)`}. <a href="#/config/temp-filter">Manage filters</a>
          </p>
          {terms.length === 0 ? (
            <p class="ltb-muted">This post has no categories or tags.</p>
          ) : (
            <div class="ltb-term-list">
              <GroupedTerms keys={terms.map((t) => t.key)} onSelectAll={(keys) => selectGroup(keys, 'match')} isSelected={(key) => filterSet.has(key)} renderTerm={(t, _grouped, present) => {
                const key = t.key;
                const term = state.termsByKey[key];
                const isExcluded = excluded.has(key);
                const owner = state.assignments[key];
                const inFilter = filterSet.has(key);
                const base = isExcluded
                  ? 'Excluded term — never assigned and does not affect matching.'
                  : owner
                    ? `Assigned to ${destinationName(owner)}`
                    : null;
                const filterNote = activeFilter.notTermKeys?.includes(key) ? 'Excluded by ' + activeFilter.name + ' (NOT) — click to move to matching terms.' : inFilter ? `Selected in ${activeFilter.name} — click to remove.` : isExcluded ? null : `Click to add this term to ${activeFilter.name}.`;
                const tooltip = [base, filterNote].filter(Boolean).join(' ') || null;
                const detail = !present ? 'Companion term — not attached to this article' : term ? null : 'Label not yet resolved';

                return (
                  <TermButton
                    key={key}
                    term={t}
                    tone="filter"
                    selected={inFilter}
                    owner={inFilter ? null : (owner ?? null)}
                    tooltip={tooltip}
                    detail={detail}
                    disabled={isExcluded || !term}
                    onClick={() => dispatch({ type: 'TOGGLE_TEMP_FILTER_TERM', termKey: key })}
                  />
                );
              }} />
            </div>
          )}
        </aside>
        </div>
      </div>
    </section>
  );
}

function labelFor(x: { key: TermKey; term: SourceTerm | undefined }): string {
  return x.term?.name ?? x.key;
}
