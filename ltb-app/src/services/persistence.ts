import { DESTINATIONS, migrateDestinationId } from '../state/destinations';
import type { Assignments, DestinationId, TermKey, UnresolvedAssignment } from '../state/types';
import { normalizeSourceUrl, parseTermKey } from './normalize';

export const CONFIG_SCHEMA_VERSION = 1;

export interface ConfigDocument {
  schemaVersion: number;
  sourceUrl: string;
  destinations: Array<{ id: DestinationId; name: string }>;
  assignments: Assignments;
  excludedTermKeys: TermKey[];
  unresolvedAssignments?: UnresolvedAssignment[];
  modifiedAt: string;
}

export interface ImportResult {
  assignments: Assignments;
  unresolved: UnresolvedAssignment[];
  warnings: string[];
}

export function storageKey(sourceUrl: string): string {
  return `ltb:config:${normalizeSourceUrl(sourceUrl)}`;
}

export function buildConfigDocument(input: {
  sourceUrl: string;
  assignments: Assignments;
  excludedTermKeys: TermKey[];
  unresolvedAssignments: UnresolvedAssignment[];
}): ConfigDocument {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    sourceUrl: input.sourceUrl,
    destinations: [...DESTINATIONS],
    assignments: input.assignments,
    excludedTermKeys: input.excludedTermKeys,
    unresolvedAssignments: input.unresolvedAssignments,
    modifiedAt: new Date().toISOString(),
  };
}

export interface PersistenceAdapter {
  load(sourceUrl: string): ConfigDocument | null;
  save(doc: ConfigDocument): void;
}

export const localStorageAdapter: PersistenceAdapter = {
  load(sourceUrl) {
    const raw = window.localStorage.getItem(storageKey(sourceUrl));
    if (!raw) return null;
    return JSON.parse(raw) as ConfigDocument;
  },
  save(doc) {
    window.localStorage.setItem(storageKey(doc.sourceUrl), JSON.stringify(doc));
  },
};

type RawEntry = { termKey: string; destination: string };

function collectEntries(raw: unknown): RawEntry[] | null {
  if (Array.isArray(raw)) {
    return raw
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({ termKey: String(e.termKey ?? e.key ?? ''), destination: String(e.destination ?? e.category ?? '') }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([termKey, destination]) => ({ termKey, destination: String(destination) }));
  }
  return null;
}

/**
 * Validate an imported configuration document. Accepts the exported object
 * form of `assignments` and an array-of-proposals form. Conflicting proposals
 * for one term, malformed keys, unknown destinations, excluded terms and (when
 * the inventory is complete) unknown source terms are reported as unresolved
 * rather than silently applied or discarded.
 */
export function validateImport(
  input: unknown,
  ctx: { sourceUrl: string; excludedTermKeys: ReadonlySet<TermKey>; knownTermKeys: ReadonlySet<TermKey> | null },
): ImportResult {
  if (!input || typeof input !== 'object') throw new Error('Configuration must be a JSON object.');
  const doc = input as Partial<ConfigDocument> & { assignments?: unknown };
  const warnings: string[] = [];
  const unresolved: UnresolvedAssignment[] = [];

  if (doc.schemaVersion !== undefined && Number(doc.schemaVersion) > CONFIG_SCHEMA_VERSION) {
    throw new Error(`Configuration schema version ${doc.schemaVersion} is newer than this app supports (${CONFIG_SCHEMA_VERSION}).`);
  }
  if (doc.sourceUrl && normalizeSourceUrl(String(doc.sourceUrl)) !== normalizeSourceUrl(ctx.sourceUrl)) {
    warnings.push(`Configuration was exported from ${doc.sourceUrl}, but this app reads ${ctx.sourceUrl}. Term IDs may not correspond.`);
  }
  const entries = collectEntries(doc.assignments);
  if (!entries) throw new Error('Configuration is missing an "assignments" object or array.');

  const proposals = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.termKey) continue;
    (proposals.get(e.termKey) ?? proposals.set(e.termKey, new Set()).get(e.termKey)!).add(e.destination);
  }

  const assignments: Assignments = {};
  for (const [rawKey, destSet] of proposals) {
    const migrated = [...destSet].map((d) => ({ raw: d, id: migrateDestinationId(d) }));
    const distinct = new Set(migrated.map((m) => m.id).filter((x): x is DestinationId => !!x));
    const bad = migrated.filter((m) => !m.id);
    const parsed = parseTermKey(rawKey);
    const key = parsed ? (rawKey as TermKey) : null;

    const reason = !parsed
      ? 'Malformed term key (expected "category:<id>" or "post_tag:<id>")'
      : bad.length
        ? `Unknown destination "${bad[0]!.raw}"`
        : distinct.size > 1
          ? `Conflicting proposed destinations: ${[...distinct].join(', ')}`
          : ctx.excludedTermKeys.has(key!)
            ? 'Term is excluded from assignment'
            : ctx.knownTermKeys && !ctx.knownTermKeys.has(key!)
              ? 'Term not found in the source inventory'
              : null;

    if (reason) {
      for (const d of destSet) unresolved.push({ termKey: rawKey, destination: d, reason });
      continue;
    }
    assignments[key!] = [...distinct][0]!;
  }

  for (const u of doc.unresolvedAssignments ?? []) {
    if (u && typeof u.termKey === 'string' && !(u.termKey in assignments)) unresolved.push(u);
  }
  return { assignments, unresolved, warnings };
}
