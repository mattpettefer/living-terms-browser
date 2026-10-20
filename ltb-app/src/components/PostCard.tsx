import { destinationName } from '../state/destinations';
import type { DestinationId, PostRecord } from '../state/types';
import { stripTags } from '../services/normalize';
import { routeToHash } from '../effects/useHashRouter';

interface Props {
  post: PostRecord;
  matchedDestinations: DestinationId[];
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PostCard({ post, matchedDestinations }: Props) {
  const excerpt = stripTags(post.excerptHtml);
  const href = routeToHash({ view: 'article', postId: post.id });
  return (
    <article class="ltb-card">
      <a class="ltb-card-link" href={href}>
        <div class="ltb-card-media">
          {post.imageUrl ? (
            <img src={post.imageUrl} alt="" loading="lazy" />
          ) : (
            <div class="ltb-card-placeholder" aria-hidden="true">
              <span>No image</span>
            </div>
          )}
        </div>
        <div class="ltb-card-body">
          <h3 class="ltb-card-title">{post.title || `Post ${post.id}`}</h3>
          {excerpt && <p class="ltb-card-excerpt">{excerpt}</p>}
          <div class="ltb-card-meta">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            {!post.termsComplete && <span class="ltb-pill ltb-pill-muted">Terms incomplete</span>}
          </div>
        </div>
      </a>
      <div class="ltb-card-footer">
        {matchedDestinations.length === 0 ? (
          <span class="ltb-pill ltb-pill-muted">Unassigned</span>
        ) : (
          matchedDestinations.map((d) => (
            <span key={d} class="ltb-pill">
              {destinationName(d)}
            </span>
          ))
        )}
        <a class="ltb-source-link" href={post.sourceUrl} target="_blank" rel="noopener noreferrer">
          Source ↗
        </a>
      </div>
    </article>
  );
}
