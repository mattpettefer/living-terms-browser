import { selectedDestinations } from './postSelections';
import { displayTerm, getMergerIndex, groupTerms } from './mergers';
import type { AppState, DestinationId, FinalTerms, PostRecord, TermKey } from './types';
import { migrateDestinationId } from './destinations';
import { parseTermKey } from '../services/normalize';

export function validateFinalTerms(value: unknown): FinalTerms {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Final terms must be an object keyed by destination category.');
  const result: FinalTerms = {};
  for (const [rawDestination, keys] of Object.entries(value)) {
    const destination = migrateDestinationId(rawDestination);
    if (!destination || !Array.isArray(keys)) throw new Error('Invalid Final category: ' + rawDestination);
    if (keys.some(key => typeof key !== 'string' || !parseTermKey(key))) throw new Error('Invalid source term in Final category: ' + rawDestination);
    result[destination] = [...new Set([...(result[destination] ?? []), ...keys as TermKey[]])];
  }
  return result;
}

export function mergeFinalTerms(existing: FinalTerms, incoming: FinalTerms): FinalTerms {
  const result = { ...existing };
  for (const [destination, keys] of Object.entries(incoming) as [DestinationId, TermKey[]][]) {
    result[destination] = [...new Set([...(result[destination] ?? []), ...keys])];
  }
  return result;
}

/** Editorial selections alone define Final's posts; matching rules and temporary filters do not. */
export function getFinalPosts(state: AppState, destination: DestinationId | 'all'): PostRecord[] {
  return [...new Set(state.postOrder)].map(id => state.postsById[id])
    .filter((post): post is PostRecord => !!post && !!state.postSelections[post.id] && (destination === 'all' || selectedDestinations(state, post.id).includes(destination)));
}

export function getFinalExcludedTermKeys(state: AppState): Set<TermKey> {
  return new Set(state.mergers.filter(merger => merger.excludeFromFinal).flatMap(merger => merger.termKeys));
}

/** A merger is one final tag: any saved member choice retains the canonical tag. */
export function getEffectiveFinalTermKeys(state: AppState, destination: DestinationId): Set<TermKey> {
  const allowed = new Set(state.finalTerms[destination] ?? []);
  for (const merger of state.mergers) {
    if (merger.excludeFromFinal) { for (const key of merger.termKeys) allowed.delete(key); }
    else if (merger.termKeys.some(key => allowed.has(key))) { for (const key of merger.termKeys) allowed.add(key); }
  }
  return allowed;
}

export interface FinalTag { id: string; name: string; slug: string }

/** Retain allowed original terms attached to this post, then collapse merger members. */
export function getFinalTags(state: AppState, post: PostRecord): FinalTag[] {
  const destinations = selectedDestinations(state, post.id);
  if (!destinations.length) return [];
  const allowed = new Set(destinations.flatMap(destination => [...getEffectiveFinalTermKeys(state, destination)]));
  const mergers = getMergerIndex(state);
  const result = new Map<string, FinalTag>();
  for (const key of new Set(post.termKeys)) {
    if (!allowed.has(key)) continue;
    const merger = mergers.byTerm.get(key);
    if (merger?.excludeFromFinal) continue;
    const source = displayTerm(state, key);
    const tag = merger ? { id: 'merged:' + merger.id, name: merger.name, slug: merger.slug }
      : { id: key, name: source.name, slug: source.slug };
    // Destination tags with the same slug are the same tag, even across source taxonomies.
    const identity = tag.slug || tag.id;
    if (!result.has(identity) || merger) result.set(identity, tag);
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getFinalTermGroups(state: AppState, destination: DestinationId | 'all') {
  const posts = getFinalPosts(state, destination);
  const destinations = state.destinationCategories.filter(d => destination === 'all' || d.id === destination);
  const allowedByDestination = new Map(state.destinationCategories.map(d => [d.id, getEffectiveFinalTermKeys(state, d.id)]));
  const keys = [...new Set([...posts.flatMap(post => post.termKeys), ...destinations.flatMap(d => state.finalTerms[d.id] ?? [])])];
  const groups = groupTerms(state, keys).filter(group => !group.merger?.excludeFromFinal).map(group => {
    const term = displayTerm(state, group.keys[0]!);
    const members = new Set(group.keys);
    return {
      ...group,
      name: group.merger?.name ?? term.name,
      slug: group.merger?.slug ?? term.slug,
      selected: destinations.some(d => group.keys.some(key => allowedByDestination.get(d.id)?.has(key))),
      count: posts.filter(post => {
        return selectedDestinations(state, post.id).some(d => {
          const allowed = allowedByDestination.get(d);
          return post.termKeys.some(key => members.has(key) && allowed?.has(key));
        });
      }).length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { posts, groups };
}
