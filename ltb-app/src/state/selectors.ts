import { destinationName } from './destinations';
import type { AppState, Assignments, DestinationId, DestinationExclusions, FilterOperator, PostMatches, PostRecord, SourceTerm, TempFilter, TermKey } from './types';

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

export function getPostMatches(post: PostRecord, assignments: Assignments, excluded: ReadonlySet<TermKey>, destinationExclusions: DestinationExclusions = {}): PostMatches {
  const matches: PostMatches = {};
  for (const key of new Set(post.termKeys)) {
    if (excluded.has(key)) continue;
    const destination = assignments[key];
    if (!destination) continue;
    (matches[destination] ??= []).push(key);
  }
  for (const destination of Object.keys(matches) as DestinationId[]) {
    if (destinationExclusions[destination]?.some((key) => post.termKeys.includes(key))) delete matches[destination];
  }
  return matches;
}

export function getMatchedDestinations(matches: PostMatches): DestinationId[] {
  return Object.keys(matches) as DestinationId[];
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

/** Stable partition: selected terms first, everything else after, preserving alphabetical order within each group. */
export function sortSelectedFirst(terms: SourceTerm[], isSelected: (term: SourceTerm) => boolean): SourceTerm[] {
  const selected: SourceTerm[] = [];
  const rest: SourceTerm[] = [];
  for (const t of terms) (isSelected(t) ? selected : rest).push(t);
  return selected.length ? [...selected, ...rest] : terms;
}

/**
 * Client-side secondary filter: OR matches any selected term; AND requires
 * every selected term. An empty filter leaves the primary results unchanged.
 */
export function applyTempFilter(posts: PostRecord[], tempFilterTermKeys: readonly TermKey[], operator: FilterOperator = 'OR', notTermKeys: readonly TermKey[] = []): PostRecord[] {
  if (tempFilterTermKeys.length === 0 && notTermKeys.length === 0) return posts;
  return posts.filter((p) => {
    const have = new Set(p.termKeys);
    if (notTermKeys.some((key) => have.has(key))) return false;
    return tempFilterTermKeys.length === 0 || (operator === 'AND' ? tempFilterTermKeys.every((k) => have.has(k)) : tempFilterTermKeys.some((k) => have.has(k)));
  });
}

export function getActiveTempFilter(state: AppState): TempFilter {
  return state.tempFilters.find((f) => f.id === state.activeTempFilterId) ?? state.tempFilters[0]!;
}

export function getTempFilterTerms(state: AppState, filter: TempFilter = getActiveTempFilter(state)): Array<{ key: TermKey; term: SourceTerm | undefined }> {
  return filter.termKeys.map((key) => ({ key, term: state.termsByKey[key] }));
}

export function getTempFilterTermCount(state: AppState): number {
  return state.tempFilters.reduce((n, f) => n + f.termKeys.length + (f.notTermKeys?.length ?? 0), 0);
}

export interface OverviewResults {
  /** Every indexed post matching the destination (or all) AND the temporary filter, newest first. */
  matching: PostRecord[];
  /** Posts matching the destination before the temporary filter is applied. */
  primaryCount: number;
  /** True when the destination has no assigned terms (so nothing can match by definition). */
  emptyAssignment: boolean;
}

/**
 * Overview lists are computed from the complete local index: a post matches a
 * destination when any of its attached, non-excluded terms is assigned there
 * (rule 3); then the active temporary filter applies its own OR/AND operator. Posts are unique
 * by construction, so a post with several matching terms appears once.
 */
export function getOverviewResults(state: AppState, category: DestinationId | 'all'): OverviewResults {
  const excluded = getExcludedSet(state);
  const emptyAssignment = category !== 'all' && getAssignedTermKeys(state.assignments, category).every((k) => excluded.has(k));
  if (emptyAssignment) return { matching: [], primaryCount: 0, emptyAssignment };
  const primary: PostRecord[] = [];
  for (const id of state.postOrder) {
    const p = state.postsById[id];
    if (!p) continue;
    if (category === 'all' || (p.termKeys.some((k) => !excluded.has(k) && state.assignments[k] === category) && !(state.destinationExclusions[category] ?? []).some((key) => p.termKeys.includes(key)))) primary.push(p);
  }
  const activeFilter = getActiveTempFilter(state);
  const tempKeys = state.tempFilterEnabled ? activeFilter.termKeys : [];
  return { matching: applyTempFilter(primary, tempKeys, activeFilter.operator, state.tempFilterEnabled ? activeFilter.notTermKeys : []), primaryCount: primary.length, emptyAssignment };
}

/** Explicit choices are independent of source-term assignments. */
export function getSelectionResults(state: AppState, category: DestinationId | 'all'): OverviewResults {
  const primary = state.postOrder.map((id) => state.postsById[id]).filter((p): p is PostRecord => !!p && (category === 'all' || state.postSelections[p.id] === category));
  const filter = getActiveTempFilter(state);
  return { matching: applyTempFilter(primary, state.tempFilterEnabled ? filter.termKeys : [], filter.operator, state.tempFilterEnabled ? filter.notTermKeys : []), primaryCount: primary.length, emptyAssignment: false };
}

export function getSelectionCounts(state: AppState): Record<DestinationId, number> {
  const counts = Object.fromEntries(state.destinationCategories.map((d) => [d.id, 0])) as Record<DestinationId, number>;
  for (const id of state.postOrder) { const destination = state.postSelections[id]; if (destination && state.postsById[id]) counts[destination]++; }
  return counts;
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
