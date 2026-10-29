import { useMemo, useState } from 'preact/hooks';
import { useStore } from '../state/provider';
import { usePostIndex } from '../effects/usePostIndex';
import { navigate } from '../effects/useHashRouter';
import { getFinalPosts, getFinalTermGroups } from '../state/finalTerms';
import type { DestinationId, TermKey } from '../state/types';
import { CopyToFinal } from '../components/CopyToFinal';
import { ImportExport } from './ImportExport';

export function Final() {
  const { state } = useStore();
  const { index, retry } = usePostIndex();
  const category = state.ui.finalCategory;
  const ready = index.status === 'success' && index.complete;
  return <section class="ltb-final" aria-labelledby="ltb-final-heading">
    <h1 id="ltb-final-heading" class="ltb-h2">Final</h1>
    <p>Choose the tags posts will have on the destination site. Each merger is one final tag.</p>
    <p class="ltb-muted">All categories combines the tags into one list. Selecting or deselecting a tag there applies to every category. Post selections stay unchanged.</p>
    <nav class="ltb-filter-bar" aria-label="Final destination categories">
      <button class={'ltb-filter' + (category === 'all' ? ' is-active' : '')} aria-pressed={category === 'all'} onClick={() => navigate({ view: 'final', category: 'all' })}>All categories</button>
      {state.destinationCategories.map(d => <button key={d.id} class={'ltb-filter' + (category === d.id ? ' is-active' : '')} aria-pressed={category === d.id} onClick={() => navigate({ view: 'final', category: d.id })}>
        {d.name}<span class="ltb-filter-count">{getFinalPosts(state, d.id).length}{!ready ? '+' : ''} selected posts</span>
      </button>)}
    </nav>
    {!ready && <p role={index.status === 'error' ? 'alert' : 'status'}>{index.status === 'error' ? 'Could not load all selected posts.' : 'Loading selected posts…'} {index.status === 'error' && <button class="ltb-btn" onClick={retry}>Retry</button>}</p>}
    <div class="ltb-final-sections"><FinalCategory key={category} category={category} ready={ready} /></div>
    <ImportExport />
  </section>;
}

function FinalCategory({ category, ready }: { category: DestinationId | 'all'; ready: boolean }) {
  const { state, dispatch } = useStore();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [searchLimit, setSearchLimit] = useState(30);
  const [limit, setLimit] = useState(60);
  const [postLimit, setPostLimit] = useState(24);
  const { posts, groups } = useMemo(() => getFinalTermGroups(state, category), [state.postSelections, state.postOrder, state.postsById, state.finalTerms, state.mergers, state.termsByKey, state.destinationCategories, category]);
  const q = search.trim().toLowerCase();
  const matchesKind = (group: typeof groups[number]) => kind === 'all' || (group.merger ? kind === 'category' : group.keys.some(key => key.startsWith(kind + ':')));
  const filtered = groups.filter(group => group.selected && matchesKind(group));
  const candidates = q ? groups.filter(group => !group.selected && matchesKind(group)
    && (group.name.toLowerCase().includes(q) || group.slug.toLowerCase().includes(q))) : [];
  const visibleKeys = [...new Set(filtered.flatMap(group => group.keys))];
  const allowedGroups = groups.filter(group => group.selected);
  const setAllowed = (keys: TermKey[], value: boolean) => dispatch({ type: 'SET_FINAL_TERMS', destination: category, termKeys: keys, allowed: value });
  const name = category === 'all' ? 'All categories' : state.destinationCategories.find(d => d.id === category)!.name;
  return <section class="ltb-final-category" aria-labelledby={'final-' + category}>
    <header class="ltb-results-header"><h2 id={'final-' + category} class="ltb-h3">{name}</h2><span>{posts.length}{!ready ? '+' : ''} selected posts · {allowedGroups.length} allowed tags</span></header>
    <div class="ltb-final-actions"><CopyToFinal destination={category} /><a href={'#/overview/' + category}>Open Overview</a></div>
    <div class="ltb-final-controls">
      <label>Source type<select value={kind} onChange={e => { setKind(e.currentTarget.value); setLimit(60); setSearchLimit(30); }}><option value="all">Categories and tags</option><option value="category">Categories and mergers</option><option value="post_tag">Tags</option></select></label>
    </div>
    <p class="ltb-muted">Only allowed tags are listed. Counts show posts that will receive each tag.{category === 'all' && ' Highlighted tags are allowed in at least one category; clicking removes them from every category.'}</p>
    <div class="ltb-final-actions">
      <button class="ltb-btn" disabled={!filtered.some(group => group.selected)} onClick={() => setAllowed(visibleKeys, false)}>Drop shown</button>
      <button class="ltb-btn" disabled={!allowedGroups.length} onClick={() => setAllowed([...new Set(allowedGroups.flatMap(group => group.keys))], false)}>Clear allowed terms</button>
    </div>
    <div class="ltb-term-list ltb-final-term-list">{filtered.slice(0, limit).map(group => <button key={group.id}
      type="button" class="ltb-term is-filter is-selected" aria-pressed={true}
      title={category === 'all' ? 'Remove from all categories' : 'Drop tag'}
      onClick={() => setAllowed(group.keys, false)}>
      <span class="ltb-term-label">{group.name}</span><span class="ltb-term-count" aria-label={ready ? group.count + ' posts receiving this tag' : 'Retained post count unavailable'}>{ready ? group.count : '—'}</span>
    </button>)}</div>
    {filtered.length > limit && <button class="ltb-btn" onClick={() => setLimit(limit + 60)}>Show more terms ({filtered.length - limit} remaining)</button>}
    {!filtered.length && <p class="ltb-muted">{!allowedGroups.length ? 'No allowed tags yet. Copy from Overview or search below to add tags.' : 'No allowed tags match this source type.'}</p>}
    <section class="ltb-final-add" aria-label="Add tags">
      <label class="ltb-search">Search tags to add<input type="search" value={search} onInput={e => { setSearch(e.currentTarget.value); setSearchLimit(30); }} /></label>
      {q && <>
        <p role="status">{candidates.length ? candidates.length + ' matching tags available to add.' : 'No unselected tags match this search.'}</p>
        <div class="ltb-term-list">{candidates.slice(0, searchLimit).map(group => <button key={group.id} type="button" class="ltb-term is-filter" disabled={!ready}
          aria-label={'Add ' + group.name} title={category === 'all' ? 'Allow in all categories' : 'Retain tag'} onClick={() => setAllowed(group.keys, true)}>
          <span class="ltb-term-label">{group.name}</span><span aria-hidden="true"> +</span>
        </button>)}</div>
        {candidates.length > searchLimit && <button class="ltb-btn" onClick={() => setSearchLimit(searchLimit + 30)}>Show more matches ({candidates.length - searchLimit} remaining)</button>}
      </>}
    </section>
    <details class="ltb-final-posts"><summary>Selected posts ({posts.length}{!ready ? '+' : ''})</summary><ul>{posts.slice(0, postLimit).map(post => <li key={post.id}><a href={'#/article/' + post.id}>{post.title || 'Post ' + post.id}</a></li>)}</ul>{posts.length > postLimit && <button class="ltb-btn" onClick={() => setPostLimit(postLimit + 24)}>Show more posts</button>}</details>
  </section>;
}
