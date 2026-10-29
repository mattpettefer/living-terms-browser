import { MergerPostPreview } from '../components/MergerPostPreview';
import { GroupedTerms } from '../components/GroupedTerms';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../state/provider';
import { getMergerIndex, prepareMergerSave, displayTerm, groupTerms } from '../state/mergers';
import type { Merger, TermKey } from '../state/types';
import { TermPostCount } from '../components/TermPostCount';
import { usePostIndex } from '../effects/usePostIndex';
import { ImportExport } from './ImportExport';

export function Mergers() {
  const { state, dispatch } = useStore();
  const { index, retry } = usePostIndex();
  const [draft, setDraft] = useState<Merger | null>(null);
  const [moves, setMoves] = useState<Partial<Record<TermKey, string>>>({});
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const editorRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!draft?.id) return;
    editorRef.current?.scrollIntoView?.({ block: 'start' });
    nameRef.current?.focus({ preventScroll: true });
  }, [draft?.id]);
  const info = getMergerIndex(state);
  const q = search.trim().toLowerCase();
  const terms = state.termOrder.filter((key) => {
    const t = state.termsByKey[key];
    return t && !state.excludedTermKeys.includes(key) && (!q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  });
  const start = (merger?: Merger) => {
    setDraft(merger ? { ...merger, termKeys: [...merger.termKeys] } : { id: 'merge-' + crypto.randomUUID(), name: '', slug: '', termKeys: [] });
    setMoves({}); setSearch(''); setLimit(100); setError('');
  };
  const toggle = (key: TermKey) => {
    if (!draft) return;
    const selected = draft.termKeys.includes(key);
    const owner = info.byTerm.get(key);
    if (!selected && owner && owner.id !== draft.id) return;
    if (selected) setMoves((current) => { const next = { ...current }; delete next[key]; return next; });
    setDraft({ ...draft, termKeys: selected ? draft.termKeys.filter((k) => k !== key) : [...draft.termKeys, key] });
  };
  const moveHere = (key: TermKey) => {
    if (!draft) return;
    const owner = info.byTerm.get(key);
    if (!owner || owner.id === draft.id) return;
    setMoves({ ...moves, [key]: owner.id });
    setDraft({ ...draft, termKeys: [...new Set([...draft.termKeys, key])] });
  };
  const emptied = state.mergers.filter((m) => m.id !== draft?.id && m.termKeys.every((key) => moves[key] === m.id && draft?.termKeys.includes(key)));
  const save = (event: Event) => {
    event.preventDefault();
    if (!draft) return;
    try {
      prepareMergerSave(state.mergers, draft, moves);
      dispatch({ type: 'SAVE_MERGER', merger: draft, moves }); setMoves({}); setDraft(null); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save merger.'); }
  };
  return <section class="ltb-mergers">
    <div class="ltb-mergers-title"><h1 class="ltb-h2">Mergers</h1><button class="ltb-btn ltb-btn-primary" disabled={draft !== null} onClick={() => start()}>New merger</button></div>
    <p class="ltb-muted">Group old categories and tags under one destination tag. Members remain independently selectable in filters. Each group shows its unique-post total.</p>
    {index.status === 'loading' && <p role="status">Loading post totals ({index.loadedPages}{index.totalPages ? '/' + index.totalPages : ''} pages)…</p>}
    {index.status === 'error' && <p role="alert">Could not load post totals. <button class="ltb-btn" onClick={retry}>Retry totals</button></p>}
    {draft && <form ref={editorRef} class="ltb-merger-editor" onSubmit={save}>
      <h2 class="ltb-h3">{state.mergers.some((m) => m.id === draft.id) ? 'Edit merger' : 'New merger'}</h2>
      <div class="ltb-merger-fields">
        <label>Destination tag name<input ref={nameRef} required value={draft.name} onInput={(e) => {
          const name = e.currentTarget.value;
          const auto = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          setDraft({ ...draft, name, slug: !draft.slug || draft.slug === auto(draft.name) ? auto(name) : draft.slug });
        }} /></label>
        <label>Destination tag slug<input required value={draft.slug} onInput={(e) => setDraft({ ...draft, slug: e.currentTarget.value })} /></label>
      </div>
      <label><input type="checkbox" checked={draft.excludeFromFinal ?? false} onChange={e => setDraft({ ...draft, excludeFromFinal: e.currentTarget.checked })} /> Exclude from Final</label>
      {draft.termKeys.length > 0 && <div class="ltb-merger-draft-preview"><p class="ltb-muted">Group preview</p><GroupedTerms groups={groupTerms({ ...state, mergers: [...state.mergers.filter((m) => m.id !== draft.id), { ...draft, name: draft.name || 'New merger' }] }, draft.termKeys)} renderTerm={(term) => <span class="ltb-term">{term.name}</span>} /></div>}
      <p>Selected members: {draft.termKeys.length}</p>
      <div class="ltb-term-list">{draft.termKeys.map((key) => <button type="button" key={key} class="ltb-term is-selected is-filter" onClick={() => toggle(key)} aria-label={'Remove member ' + displayTerm(state, key).name}>{displayTerm(state, key).name} ×</button>)}</div>
      <label class="ltb-search">Search source categories and tags<input type="search" value={search} onInput={(e) => { setSearch(e.currentTarget.value); setLimit(100); }} /></label>
      <p class="ltb-muted">Terms used by another merger are locked. Choose Move here to transfer one when you save. Cancel leaves both mergers unchanged.</p>
      {emptied.length > 0 && <p role="status">Saving will dissolve {emptied.map((m) => '“' + m.name + '”').join(', ')} because all its members are being moved.</p>}
      <div class="ltb-merger-picker">{terms.slice(0, limit).map((key) => {
        const t = state.termsByKey[key]!;
        const owner = info.byTerm.get(key);
        const elsewhere = owner && owner.id !== draft.id;
        const moving = elsewhere && moves[key] === owner.id && draft.termKeys.includes(key);
        return <div key={key} class="ltb-merger-choice">
          <label><input type="checkbox" disabled={!!elsewhere && !moving} checked={draft.termKeys.includes(key)} onChange={() => toggle(key)} /><span>{t.name}<small>{t.taxonomy === 'category' ? 'Category' : 'Tag'} · {t.id}{elsewhere ? (moving ? ' · moving from ' : ' · in ') + owner.name : ''}</small></span></label>
          <TermPostCount count={t.sourceCount} />
          {elsewhere && <button type="button" class="ltb-btn ltb-btn-small" aria-label={(moving ? 'Undo move of ' : 'Move ') + t.name + (moving ? '' : ' from ' + owner.name + ' here')}
            onClick={() => moving ? toggle(key) : moveHere(key)}>{moving ? 'Undo move' : 'Move here'}</button>}
        </div>;
      })}</div>
      {terms.length > limit && <button type="button" class="ltb-btn" onClick={() => setLimit(limit + 100)}>Show more source terms</button>}
      {!state.termsInventory.complete && <p class="ltb-muted">Source term inventory is still loading. Selected members are preserved.</p>}
      {error && <p role="alert">{error}</p>}
      <div class="ltb-dialog-actions"><button type="button" class="ltb-btn" onClick={() => { setDraft(null); setMoves({}); }}>Cancel</button><button class="ltb-btn ltb-btn-primary" type="submit">Save merger</button></div>
    </form>}
    {!state.mergers.length && !draft && <p>No mergers yet. Create one to group spelling variants or related source terms.</p>}
    <div class="ltb-merger-list">{state.mergers.map((m) => {
      return <article key={m.id} class="ltb-merger-card">
        <header><h2 class="ltb-h3">{m.name}</h2><span class="ltb-merger-total"><TermPostCount count={info.counts.get(m.id)} /> posts</span></header>
        <p class="ltb-muted">Destination tag: {m.slug}</p>
        <label><input type="checkbox" aria-label={'Exclude ' + m.name + ' from Final'} checked={m.excludeFromFinal ?? false} disabled={draft !== null}
          onChange={e => dispatch({ type: 'SAVE_MERGER', merger: { ...m, excludeFromFinal: e.currentTarget.checked } })} /> Exclude from Final</label>
        <ul>{m.termKeys.map((key) => <li key={key}>{displayTerm(state, key).name} <small>({key})</small></li>)}</ul>
        <div class="ltb-merger-actions">
          <button class="ltb-btn" disabled={draft !== null} onClick={() => start(m)}>Edit {m.name}</button>
          <button class="ltb-btn" disabled={info.counts.get(m.id) == null} onClick={() => { setPreview(preview === m.id ? null : m.id); }}>{preview === m.id ? 'Hide posts' : 'View posts'}</button>
          <button class="ltb-btn" disabled={draft !== null} onClick={() => { dispatch({ type: 'REMOVE_MERGER', id: m.id }); if (preview === m.id) setPreview(null); }}>Dissolve {m.name}</button>
        </div>
        {preview === m.id && <MergerPostPreview key={m.id} merger={m} />}
      </article>;
    })}</div>
    <ImportExport />
  </section>;
}
