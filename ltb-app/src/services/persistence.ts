import { packSelection } from '../state/postSelections';
import { validateMergers } from '../state/mergers';
import { validateFinalTerms } from '../state/finalTerms';
import type { Merger, FinalTerms } from '../state/types';
import { DESTINATIONS, migrateDestinationId } from '../state/destinations';
import { newTempFilter, type TempFilterSnapshot } from '../state/reducer';
import type { Assignments, DestinationExclusions, PostSelections, DestinationId, TempFilter, TermKey, UnresolvedAssignment } from '../state/types';
import { normalizeSourceUrl, parseTermKey } from './normalize';

export const CONFIG_SCHEMA_VERSION = 4;

export interface ConfigDocument {
  mergers?: Merger[];
  finalTerms?: FinalTerms;
  schemaVersion: number;
  sourceUrl: string;
  destinations: Array<{ id: DestinationId; name: string }>;
  assignments: Assignments;
  destinationExclusions?: DestinationExclusions;
  postSelections?: PostSelections;
  excludedTermKeys: TermKey[];
  unresolvedAssignments?: UnresolvedAssignment[];
  /** Optional since the temp-filter feature; older documents simply omit it. */
  tempFilters?: TempFilterSnapshot;
  modifiedAt: string;
}

export interface ImportResult {
  mergers: Merger[] | null;
  finalTerms: FinalTerms | null;
  assignments: Assignments;
  unresolved: UnresolvedAssignment[];
  destinationExclusions: DestinationExclusions | null;
  postSelections: PostSelections | null;
  /** Present only when the document carried temp filters. */
  tempFilters: TempFilterSnapshot | null;
}

export const SHORTCODE_TAG = 'living_term_browser';

/** Wrap a document as the enclosing shortcode so it can be pasted straight into a WordPress page. */
export function wrapAsShortcode(json: string): string {
  return `[${SHORTCODE_TAG}]\n${json}\n[/${SHORTCODE_TAG}]`;
}

/** Accept either bare JSON or JSON wrapped in the shortcode (as exported). */
export function unwrapShortcode(text: string): string {
  const m = new RegExp(`^\\s*\\[${SHORTCODE_TAG}[^\\]]*\\]([\\s\\S]*?)\\[\\/${SHORTCODE_TAG}\\]\\s*$`, 'i').exec(text);
  return (m ? m[1]! : text).trim();
}

export function storageKey(sourceUrl: string): string {
  return `ltb:config:${normalizeSourceUrl(sourceUrl)}`;
}

export function buildConfigDocument(input: {
  mergers?: Merger[];
  finalTerms?: FinalTerms;
  sourceUrl: string;
  assignments: Assignments;
  destinationExclusions?: DestinationExclusions;
  postSelections?: PostSelections;
  excludedTermKeys: TermKey[];
  unresolvedAssignments: UnresolvedAssignment[];
  tempFilters?: TempFilterSnapshot;
}): ConfigDocument {
  const doc: ConfigDocument = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    sourceUrl: input.sourceUrl,
    destinations: [...DESTINATIONS],
    assignments: input.assignments,
    excludedTermKeys: input.excludedTermKeys,
    unresolvedAssignments: input.unresolvedAssignments,
    modifiedAt: new Date().toISOString(),
  };
  if (input.finalTerms) doc.finalTerms = input.finalTerms;
  if (input.mergers) doc.mergers = input.mergers;
  if (input.destinationExclusions) doc.destinationExclusions = input.destinationExclusions;
  if (input.postSelections) doc.postSelections = input.postSelections;
  if (input.tempFilters) doc.tempFilters = input.tempFilters;
  return doc;
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

/* Temporary filters are saved separately from destination assignments and can also be exported. */
export function tempFilterStorageKey(sourceUrl: string): string {
  return `ltb:tempfilter:${normalizeSourceUrl(sourceUrl)}`;
}

function cleanKeys(value: unknown): TermKey[] {
  return Array.isArray(value) ? value.filter((k): k is TermKey => typeof k === 'string' && parseTermKey(k) !== null) : [];
}

/** Accepts the current `{ filters, activeId }` shape and migrates the original single key array. */
/** Lenient parse of a temp-filter snapshot from storage or an imported document. */
export function parseTempFilters(parsed: unknown): TempFilterSnapshot | null {
  if (Array.isArray(parsed)) {
    const keys = cleanKeys(parsed);
    return keys.length ? { filters: [newTempFilter('Filter 1', keys)], activeId: '' } : null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const doc = parsed as { filters?: unknown; activeId?: unknown; enabled?: unknown };
  if (!Array.isArray(doc.filters)) return null;
  const filters: TempFilter[] = doc.filters
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f, i) => ({
      id: typeof f.id === 'string' && f.id ? f.id : `tf-import-${i}`,
      name: typeof f.name === 'string' && f.name.trim() ? f.name : `Filter ${i + 1}`,
      termKeys: cleanKeys(f.termKeys).filter((key) => !cleanKeys(f.notTermKeys).includes(key)),
      notTermKeys: cleanKeys(f.notTermKeys),
      operator: f.operator === 'AND' ? 'AND' : 'OR',
    }));
  return { filters, activeId: typeof doc.activeId === 'string' ? doc.activeId : '', enabled: typeof doc.enabled === 'boolean' ? doc.enabled : true };
}

export function loadTempFilters(sourceUrl: string): TempFilterSnapshot | null {
  try {
    const raw = window.localStorage.getItem(tempFilterStorageKey(sourceUrl));
    return raw ? parseTempFilters(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveTempFilters(sourceUrl: string, snapshot: TempFilterSnapshot): void {
  try {
    window.localStorage.setItem(tempFilterStorageKey(sourceUrl), JSON.stringify(snapshot));
  } catch {
    /* best effort; temporary filters are expendable */
  }
}

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
  const unresolved: UnresolvedAssignment[] = [];

  if (doc.schemaVersion !== undefined && Number(doc.schemaVersion) > CONFIG_SCHEMA_VERSION) {
    throw new Error(`Configuration schema version ${doc.schemaVersion} is newer than this app supports (${CONFIG_SCHEMA_VERSION}).`);
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
  // Temp filters are optional extra information; a document without them leaves the current filters alone.
  const tempFilters = doc.tempFilters !== undefined ? parseTempFilters(doc.tempFilters) : null;
  let postSelections: PostSelections | null = null;
  if (doc.postSelections !== undefined) {
    if (!doc.postSelections || typeof doc.postSelections !== 'object' || Array.isArray(doc.postSelections)) throw new Error('Post selections must be an object keyed by post ID.');
    postSelections = {};
    for (const [id, value] of Object.entries(doc.postSelections)) {
      const raw = Array.isArray(value) ? value : [value];
      const destinations = raw.map(migrateDestinationId);
      if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || raw.length < 1 || raw.length > 2 || destinations.some(d => !d) || new Set(destinations).size !== destinations.length) throw new Error('Invalid post selection for post ' + id + '. Choose one or two distinct categories.');
      postSelections[Number(id)] = packSelection(destinations as DestinationId[]);
    }
  }
  let destinationExclusions: DestinationExclusions | null = null;
  if (doc.destinationExclusions !== undefined) {
    if (!doc.destinationExclusions || typeof doc.destinationExclusions !== 'object' || Array.isArray(doc.destinationExclusions)) throw new Error('Destination exclusions must be an object.');
    destinationExclusions = {};
    for (const [rawDestination, rawKeys] of Object.entries(doc.destinationExclusions)) {
      const destination = migrateDestinationId(rawDestination);
      if (!destination || !Array.isArray(rawKeys)) throw new Error('Invalid destination exclusion: ' + rawDestination);
      const keys: TermKey[] = [];
      for (const rawKey of rawKeys) {
        if (typeof rawKey !== 'string' || !parseTermKey(rawKey)) throw new Error('Invalid exclusion term key: ' + rawKey);
        const key = rawKey as TermKey;
        if (ctx.excludedTermKeys.has(key) || (ctx.knownTermKeys && !ctx.knownTermKeys.has(key))) {
          unresolved.push({ termKey: key, destination, reason: 'NOT term unavailable in the source inventory' });
          continue;
        }
        keys.push(key);
        if (assignments[key] === destination) delete assignments[key];
      }
      destinationExclusions[destination] = [...new Set([...(destinationExclusions[destination] ?? []), ...keys])];
    }
  }
  const mergers = doc.mergers === undefined ? null : validateMergers(doc.mergers);
  const finalTerms = doc.finalTerms === undefined ? null : validateFinalTerms(doc.finalTerms);
  return { finalTerms, mergers, assignments, unresolved, tempFilters, postSelections, destinationExclusions };
}
