import type { Destination, DestinationId } from './types';

export const DESTINATIONS: readonly Destination[] = [
  { id: 'campus-life', name: 'Campus Life' },
  { id: 'academics-careers', name: 'Academics & Careers' },
  { id: 'university-news', name: 'University News' },
  { id: 'alumni-community', name: 'Alumni & Community' },
  { id: 'health-wellness', name: 'Health & Wellness' },
  { id: 'athletics', name: 'Athletics' },
];

export const DESTINATION_IDS: readonly DestinationId[] = DESTINATIONS.map((d) => d.id);

/** Older configuration documents used these IDs; map them on import only. */
export const LEGACY_DESTINATION_IDS: Readonly<Record<string, DestinationId>> = {
  'student-life': 'campus-life',
  alumni: 'alumni-community',
};

export function isDestinationId(value: unknown): value is DestinationId {
  return typeof value === 'string' && (DESTINATION_IDS as readonly string[]).includes(value);
}

export function migrateDestinationId(value: unknown): DestinationId | null {
  if (isDestinationId(value)) return value;
  if (typeof value === 'string' && value in LEGACY_DESTINATION_IDS) return LEGACY_DESTINATION_IDS[value] ?? null;
  return null;
}

export function destinationName(id: DestinationId): string {
  return DESTINATIONS.find((d) => d.id === id)?.name ?? id;
}

/**
 * Source term names that are never offered for assignment. Matched
 * case-insensitively against normalized names in either taxonomy; actual keys
 * are resolved from the live inventory, never hardcoded.
 */
export const EXCLUDED_TERM_NAMES: readonly string[] = [
  'slice of life',
  'faces of life',
  'faces of life friday',
  'podcast',
];

export function normalizeTermName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isExcludedTermName(name: string): boolean {
  return EXCLUDED_TERM_NAMES.includes(normalizeTermName(name));
}
