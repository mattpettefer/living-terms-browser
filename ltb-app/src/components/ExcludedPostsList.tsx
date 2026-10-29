import { GroupedTerms } from './GroupedTerms';
import { useState } from 'preact/hooks';
import { PostCard } from './PostCard';
import { TermPostCount } from './TermPostCount';
import { imageFor, useMediaBatch } from '../effects/useMediaBatch';
import { useStore } from '../state/provider';
import { getExcludedSet, getMatchedDestinations, getPostMatches } from '../state/selectors';
import type { PostRecord } from '../state/types';

const PAGE_SIZE = 24;

/** Mounted only after calculation, so post cards and image requests are deferred. */
export function ExcludedPostsList({ posts }: { posts: PostRecord[] }) {
  const { state } = useStore();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = posts.slice(0, limit);
  useMediaBatch(shown);
  const excluded = getExcludedSet(state);
  return (
    <div class="ltb-excluded-results" role="region" aria-label="Calculated excluded posts">
      {posts.length === 0 ? <p class="ltb-muted">Every source post meets the matching-term requirement.</p> : <>
        <div class="ltb-grid">
          {shown.map((post) => (
            <div key={post.id} class="ltb-excluded-result">
              <PostCard post={post} imageUrl={imageFor(post, state.mediaById)}
                matchedDestinations={getMatchedDestinations(getPostMatches(post, state.assignments, excluded, state.destinationExclusions))} />
              <div class="ltb-excluded-post-terms">
                <GroupedTerms keys={post.termKeys} renderTerm={(term, grouped, present) => <span key={term.key} class="ltb-excluded-term" title={present ? term.taxonomy === 'category' ? 'Source category' : 'Source tag' : 'Companion term — not attached to this post'}>
                  <span>{term.name}</span>{!grouped && <TermPostCount count={term.sourceCount} />}
                </span>} />
              </div>
            </div>
          ))}
        </div>
        <div class="ltb-load-more">
          <p class="ltb-muted">Showing {shown.length.toLocaleString()} of {posts.length.toLocaleString()} excluded posts.</p>
          {shown.length < posts.length && <button type="button" class="ltb-btn" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Show more excluded posts</button>}
        </div>
      </>}
    </div>
  );
}
