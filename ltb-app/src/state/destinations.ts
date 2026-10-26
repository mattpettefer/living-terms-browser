import type { Destination, DestinationId } from './types';

export const DESTINATIONS: readonly Destination[] = [
  { id: 'campus-life', name: 'Campus Life', color: '#2563eb' },
  { id: 'academics-careers', name: 'Academics & Careers', color: '#7c3aed' },
  { id: 'university-news', name: 'University News', color: '#0f766e' },
  { id: 'alumni-community', name: 'Alumni & Community', color: '#c2410c' },
  { id: 'health-wellness', name: 'Health & Wellness', color: '#15803d' },
  { id: 'athletics', name: 'Athletics', color: '#a21caf' },
];

/** Inline CSS custom properties exposing each destination color to the stylesheet. */
export function destinationColorVars(): Record<string, string> {
  return Object.fromEntries(DESTINATIONS.map((d) => [`--ltb-dest-${d.id}`, d.color]));
}

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
