import { destinationName } from './destinations';
import type { AppState, Assignments, DestinationId, PostMatches, PostRecord, SourceTerm, TermKey } from './types';

export function getAssignedTerms(state: AppState, destinationId: DestinationId): SourceTerm[] {
  const out: SourceTerm[] = [];
  for (const key of state.termOrder) {
    if (state.assignments[key] === destinationId) {
      const t = state.termsByKey[key];
      if (t) out.push(t);
    }
  }
  return out;
}

export function getAssignedTermKeys(assignments: Assignments, destinationId: DestinationId): TermKey[] {
  return (Object.entries(assignments) as [TermKey, DestinationId][]).filter(([, d]) => d === destinationId).map(([k]) => k);
}

export function getPostMatches(post: PostRecord, assignments: Assignments, excluded: ReadonlySet<TermKey>): PostMatches {
  const matches: PostMatches = {};
  for (const key of new Set(post.termKeys)) {
    if (excluded.has(key)) continue;
    const destination = assignments[key];
    if (!destination) continue;
    (matches[destination] ??= []).push(key);
  }
  return matches;
}

export function getMatchedDestinations(matches: PostMatches): DestinationId[] {
  return Object.keys(matches) as DestinationId[];
}

export function getPostOverlap(post: PostRecord, assignments: Assignments, excluded: ReadonlySet<TermKey>): boolean {
  return getMatchedDestinations(getPostMatches(post, assignments, excluded)).length > 1;
}

export interface TermWarning {
  destination: DestinationId;
  otherDestinations: DestinationId[];
  otherTermKeys: TermKey[];
  explanation: string;
}

/** Why a specific term on a specific post is flagged red. Null when it isn't. */
export function getTermWarning(
  post: PostRecord,
  termKey: TermKey,
  assignments: Assignments,
  excluded: ReadonlySet<TermKey>,
): TermWarning | null {
  if (excluded.has(termKey)) return null;
  const destination = assignments[termKey];
  if (!destination) return null;
  const matches = getPostMatches(post, assignments, excluded);
  const otherDestinations = getMatchedDestinations(matches).filter((d) => d !== destination);
  if (otherDestinations.length === 0) return null;
  const otherTermKeys = otherDestinations.flatMap((d) => matches[d] ?? []);
  const explanation = `Assigned to ${destinationName(destination)}. This article also matches ${joinNames(otherDestinations)}.`;
  return { destination, otherDestinations, otherTermKeys, explanation };
}

export function joinNames(ids: DestinationId[]): string {
  const names = ids.map(destinationName);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function getExcludedSet(state: AppState): ReadonlySet<TermKey> {
  return new Set(state.excludedTermKeys);
}

/** Combined eligible inventory for Config, alphabetical, filtered by search and optionally to source categories. */
export function getVisibleTerms(state: AppState, search: string, categoriesOnly = false): SourceTerm[] {
  const excluded = getExcludedSet(state);
  const q = search.trim().toLowerCase();
  const out: SourceTerm[] = [];
  for (const key of state.termOrder) {
    if (excluded.has(key)) continue;
    const t = state.termsByKey[key];
    if (!t) continue;
    if (categoriesOnly && t.taxonomy !== 'category') continue;
    if (q && !t.name.toLowerCase().includes(q) && !t.slug.includes(q)) continue;
    out.push(t);
  }
  return out;
}

/** Stable partition: terms owned by `destinationId` first, everything else after, preserving alphabetical order within each group. */
export function sortSelectedFirst(terms: SourceTerm[], assignments: Assignments, destinationId: DestinationId | 'unassigned'): SourceTerm[] {
  if (destinationId === 'unassigned') return terms;
  const selected: SourceTerm[] = [];
  const rest: SourceTerm[] = [];
  for (const t of terms) (assignments[t.key] === destinationId ? selected : rest).push(t);
  return selected.length ? [...selected, ...rest] : terms;
}

export function getOverviewResults(state: AppState, queryKey: string): PostRecord[] {
  const entry = state.queriesByKey[queryKey];
  if (!entry) return [];
  const out: PostRecord[] = [];
  for (const id of entry.postIds) {
    const p = state.postsById[id];
    if (p) out.push(p);
  }
  return out;
}

export function getDuplicateNameCounts(state: AppState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of state.termOrder) {
    const t = state.termsByKey[key];
    if (!t) continue;
    const n = t.name.toLowerCase();
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}

export function getAssignmentCounts(state: AppState): Record<DestinationId, number> {
  const counts = Object.fromEntries(state.destinationCategories.map((d) => [d.id, 0])) as Record<DestinationId, number>;
  for (const d of Object.values(state.assignments)) if (d) counts[d] += 1;
  return counts;
}
