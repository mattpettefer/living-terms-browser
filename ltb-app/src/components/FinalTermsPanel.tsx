import { selectedDestinations } from '../state/postSelections';
import { useStore } from '../state/provider';
import { getFinalTags } from '../state/finalTerms';
import { destinationName } from '../state/destinations';
import type { PostRecord } from '../state/types';

export function FinalTermsPanel({ post }: { post: PostRecord }) {
  const { state } = useStore();
  const destinations = selectedDestinations(state, post.id);
  const tags = getFinalTags(state, post);
  return <section class="ltb-final-terms-panel" aria-labelledby="ltb-final-terms-heading">
    <h2 id="ltb-final-terms-heading" class="ltb-h3">Final terms</h2>
    <p class="ltb-muted">Destination tags for linking related posts.</p>
    {!destinations.length ? <p>Select a destination category for this post in Overview or Selections to preview its Final terms.</p>
      : <>
        <p>{destinations.length > 1 ? "Categories" : "Category"}: <strong>{destinations.map(destinationName).join(", ")}</strong></p>
        {!post.termsComplete ? <p role="status">Loading this post’s terms…</p>
          : tags.length ? <ul class="ltb-final-tags" aria-label="Final destination tags">{tags.map(tag => <li key={tag.id} title={tag.slug}>{tag.name}</li>)}</ul>
          : <p>No tags retained for this post. Choose allowed terms in Final.</p>}
        {destinations.map(destination => <p key={destination}><a href={'#/final/' + destination}>Edit allowed tags{destinations.length > 1 ? ' for ' + destinationName(destination) : ''}</a></p>)}
      </>}
  </section>;
}
