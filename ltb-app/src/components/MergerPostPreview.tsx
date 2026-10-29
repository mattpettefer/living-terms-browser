import { useId, useMemo, useState } from 'preact/hooks';
import { useStore } from '../state/provider';
import { displayTerm } from '../state/mergers';
import type { Merger, TermKey } from '../state/types';

export function MergerPostPreview({ merger }: { merger: Merger }) {
  const { state } = useStore();
  const [active, setActive] = useState<'posts' | 'terms'>('posts');
  const [limit, setLimit] = useState(24);
  const id = useId();
  const members = useMemo(() => new Set(merger.termKeys), [merger.termKeys]);
  const posts = useMemo(() => [...new Set(state.postOrder)]
    .map(id => state.postsById[id])
    .filter(p => p && p.termKeys.some(key => members.has(key))),
  [state.postOrder, state.postsById, members]);
  const terms = useMemo(() => {
    if (active !== 'terms') return [];
    const counts = new Map<TermKey, number>();
    for (const post of posts) for (const key of new Set(post!.termKeys)) {
      if (!members.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].filter(([, count]) => count === posts.length).map(([key, count]) => ({ term: displayTerm(state, key), count }))
      .sort((a, b) => b.count - a.count || a.term.name.localeCompare(b.term.name) || a.term.key.localeCompare(b.term.key));
  }, [active, posts, members, state.termsByKey]);

  const renderTabs = (position: 'top' | 'bottom') => <div class={'ltb-tabs ltb-merger-preview-tabs is-' + position} role="tablist" aria-label={'Post details for ' + merger.name + ' (' + position + ')'}>
      {(['posts', 'terms'] as const).map(value => <button key={value} type="button" role="tab"
        id={id + '-' + position + '-tab-' + value} aria-controls={id + '-panel-' + value} aria-selected={active === value}
        tabIndex={active === value ? 0 : -1} class={'ltb-tab' + (active === value ? ' is-active' : '')}
        onClick={() => setActive(value)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'posts' : event.key === 'End' ? 'terms' : value === 'posts' ? 'terms' : 'posts';
          setActive(next); document.getElementById(id + '-' + position + '-tab-' + next)?.focus();
        }}>{value === 'posts' ? 'Posts' : 'Shared categories & tags'}</button>)}
    </div>;

  return <div class="ltb-merger-preview">
    <p>{posts.length} unique posts</p>
    {renderTabs('top')}
    <div role="tabpanel" id={id + '-panel-posts'} aria-labelledby={id + '-top-tab-posts'} hidden={active !== 'posts'} tabIndex={0}>
      <ul>{posts.slice(0, limit).map(p => <li key={p!.id}><a href={'#/article/' + p!.id}>{p!.title || 'Post ' + p!.id}</a></li>)}</ul>
      {posts.length > limit && <button class="ltb-btn" onClick={() => setLimit(limit + 24)}>Show more posts</button>}
    </div>
    <div role="tabpanel" id={id + '-panel-terms'} aria-labelledby={id + '-top-tab-terms'} hidden={active !== 'terms'} tabIndex={0}>
      {active === 'terms' && <>
        <p class="ltb-muted">{terms.length} categories and tags shared by every one of the {posts.length} unique posts. The merger's own members are excluded.</p>
        {terms.length ? <div class="ltb-merger-related-scroll"><table class="ltb-merger-related-terms">
          <thead><tr><th scope="col">Category / tag</th><th scope="col">Type</th></tr></thead>
          <tbody>{terms.map(({ term }) => <tr key={term.key}>
            <th scope="row">{term.name}</th><td>{term.taxonomy === 'category' ? 'Category' : 'Tag'}</td>
          </tr>)}</tbody>
        </table></div> : <p>No other categories or tags are shared by every unique post.</p>}
      </>}
    </div>
    {renderTabs('bottom')}
  </div>;
}
