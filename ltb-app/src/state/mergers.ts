import type { AppState, Merger, SourceTerm, TermKey } from './types';
import { parseTermKey } from '../services/normalize';

/** Saved definitions contain only original source keys, never other mergers. */
export function validateMergers(value: unknown): Merger[] {
  if (!Array.isArray(value)) throw new Error('Mergers must be an array.');
  const ids = new Set<string>(), slugs = new Set<string>(), members = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid merger.');
    const m = raw as Merger;
    if (m.excludeFromFinal !== undefined && typeof m.excludeFromFinal !== 'boolean') throw new Error('Exclude from Final must be a boolean.');
    if (typeof m.id !== 'string' || !m.id.trim() || ids.has(m.id)) throw new Error('Merger IDs must be unique and nonempty.');
    if (typeof m.name !== 'string' || !m.name.trim()) throw new Error('Give each merger a name.');
    if (typeof m.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.slug) || slugs.has(m.slug)) throw new Error('Use a unique destination slug with lowercase letters, numbers, and hyphens.');
    if (!Array.isArray(m.termKeys) || !m.termKeys.length) throw new Error('Choose at least one source category or tag.');
    const keys: TermKey[] = [];
    for (const key of m.termKeys) {
      if (typeof key !== 'string' || !parseTermKey(key)) throw new Error('Invalid merger member: ' + key);
      if (members.has(key)) throw new Error('Each source term can belong to only one merger: ' + key);
      members.add(key); keys.push(key);
    }
    ids.add(m.id); slugs.add(m.slug);
    return { id: m.id, name: m.name.trim(), slug: m.slug, termKeys: keys, ...(m.excludeFromFinal === undefined ? {} : { excludeFromFinal: m.excludeFromFinal }) };
  });
}

export function combineMergers(existing: Merger[], incoming: Merger[]): Merger[] {
  const replacements = new Set(incoming.map((m) => m.id));
  return validateMergers([...existing.filter((m) => !replacements.has(m.id)), ...incoming]);
}

export interface MergerIndex { byTerm: Map<TermKey, Merger>; counts: Map<string, number | null> }
let cache: { mergers: Merger[]; posts: AppState['postsById']; order: number[]; ready: boolean; value: MergerIndex } | undefined;

/** Count the union of member posts, not the sum of source term totals. */
export function getMergerIndex(state: AppState): MergerIndex {
  const ready = state.postIndex.complete && state.postIndex.status === 'success';
  if (cache && cache.mergers === state.mergers && cache.posts === state.postsById && cache.order === state.postOrder && cache.ready === ready) return cache.value;
  const byTerm = new Map<TermKey, Merger>();
  const counts = new Map<string, number | null>();
  for (const m of state.mergers) {
    counts.set(m.id, ready ? 0 : null);
    for (const key of m.termKeys) byTerm.set(key, m);
  }
  if (ready && state.mergers.length) {
    for (const id of new Set(state.postOrder)) {
      const post = state.postsById[id];
      if (!post?.termsComplete) { for (const m of state.mergers) counts.set(m.id, null); break; }
      const seen = new Set<string>();
      for (const key of post.termKeys) { const m = byTerm.get(key); if (m) seen.add(m.id); }
      for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const value = { byTerm, counts };
  cache = { mergers: state.mergers, posts: state.postsById, order: state.postOrder, ready, value };
  return value;
}

export function displayTerm(state: AppState, key: TermKey): SourceTerm {
  const parsed = parseTermKey(key)!;
  return state.termsByKey[key] ?? { key, id: parsed.id, taxonomy: parsed.taxonomy, name: key, slug: '', sourceCount: null };
}

export interface DisplayTermGroup {
  id: string;
  merger?: Merger;
  keys: TermKey[];
  present: ReadonlySet<TermKey>;
  count: number | null;
}

/** Presentation only: retain first occurrence, gather siblings, add absent companions. */
export function groupTerms(state: AppState, keys: readonly TermKey[]): DisplayTermGroup[] {
  const index = getMergerIndex(state), present = new Set(keys), seen = new Set<string>();
  const groups: DisplayTermGroup[] = [];
  for (const key of keys) {
    const merger = index.byTerm.get(key);
    const id = merger ? 'merged:' + merger.id : key;
    if (seen.has(id)) continue;
    seen.add(id);
    groups.push({ id, merger, keys: merger ? merger.termKeys : [key], present, count: merger ? index.counts.get(merger.id) ?? null : state.termsByKey[key]?.sourceCount ?? null });
  }
  return groups;
}

/** Move only explicitly chosen members, atomically with the editor's save. */
export function prepareMergerSave(existing: Merger[], draft: Merger, moves: Partial<Record<TermKey, string>> = {}): Merger[] {
  const selected = new Set(draft.termKeys);
  const transfers = Object.entries(moves).filter(([key]) => selected.has(key as TermKey)) as [TermKey, string][];
  for (const [key, from] of transfers) {
    const owner = existing.find((m) => m.termKeys.includes(key));
    if (!owner || owner.id !== from || owner.id === draft.id) throw new Error('The owner of ' + key + ' changed. Choose its move again.');
  }
  const remaining = existing.filter((m) => m.id !== draft.id).flatMap((m) => {
    const moved = new Set(transfers.filter(([, from]) => from === m.id).map(([key]) => key));
    if (!moved.size) return [m];
    const termKeys = m.termKeys.filter((key) => !moved.has(key));
    return termKeys.length ? [{ ...m, termKeys }] : [];
  });
  return validateMergers([...remaining, draft]);
}
