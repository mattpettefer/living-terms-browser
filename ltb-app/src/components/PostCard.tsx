import { selectedDestinations } from '../state/postSelections';
import { useStore } from '../state/provider';
import { destinationName } from '../state/destinations';
import type { DestinationId, PostRecord } from '../state/types';
import { stripTags } from '../services/normalize';
import { routeToHash } from '../effects/useHashRouter';

interface Props {
  post: PostRecord;
  imageUrl: string | null;
  matchedDestinations: DestinationId[];
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PostCard({ post, imageUrl, matchedDestinations }: Props) {
  const { state, dispatch } = useStore();
  const selected = selectedDestinations(state, post.id);
  const shortNames = ['Campus', 'Acad.', 'News', 'Alumni', 'Health', 'Athl.'];
  const excerpt = stripTags(post.excerptHtml);
  const href = routeToHash({ view: 'article', postId: post.id });
  return (
    <article class="ltb-card">
      <a class="ltb-card-link" href={href}>
        <div class="ltb-card-media">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" />
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
      <div class="ltb-card-selection" role="group" aria-label={"Destination selection for " + post.title}>
        {state.destinationCategories.map((d, i) => (
          <button key={d.id} type="button" class={"ltb-selection-button" + (selected.includes(d.id) ? " is-selected" : "")}
            style={{ "--selection-color": "var(--ltb-dest-" + d.id + ")" }}
            aria-label={d.name} aria-pressed={selected.includes(d.id)}
            disabled={selected.length >= 2 && !selected.includes(d.id)}
            title={selected.includes(d.id) ? d.name + " selected — click to remove" : selected.length >= 2 ? "Two categories selected — remove one to choose another" : "Select " + d.name}
            onClick={() => dispatch({ type: "TOGGLE_POST_DESTINATION", postId: post.id, destination: d.id })}>
            {shortNames[i]}
          </button>
        ))}
      </div>
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
