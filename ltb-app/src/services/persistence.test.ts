import { describe, expect, it } from 'vitest';
import { buildConfigDocument, loadTempFilters, parseTempFilters, saveTempFilters, unwrapShortcode, validateImport, wrapAsShortcode } from './persistence';

const ctx = { sourceUrl: 'https://living.life.edu', excludedTermKeys: new Set<'category:30'>(['category:30']), knownTermKeys: null };

describe('validateImport', () => {
  it('migrates legacy destination ids', () => {
    const r = validateImport({ assignments: { 'category:1': 'student-life', 'post_tag:2': 'alumni' } }, ctx);
    expect(r.assignments).toEqual({ 'category:1': 'campus-life', 'post_tag:2': 'alumni-community' });
    expect(r.unresolved).toEqual([]);
  });

  it('does not resolve conflicting proposals by order', () => {
    const r = validateImport(
      { assignments: [{ termKey: 'category:1', destination: 'athletics' }, { termKey: 'category:1', destination: 'campus-life' }] },
      ctx,
    );
    expect(r.assignments).toEqual({});
    expect(r.unresolved).toHaveLength(2);
    expect(r.unresolved[0]?.reason).toMatch(/Conflicting/);
  });

  it('rejects malformed keys, unknown destinations, excluded and unknown terms', () => {
    const r = validateImport(
      { assignments: { 'bogus:1': 'athletics', 'category:2': 'sports', 'category:30': 'athletics', 'category:99': 'athletics' } },
      { ...ctx, knownTermKeys: new Set(['category:30']) },
    );
    expect(r.assignments).toEqual({});
    expect(r.unresolved.map((u) => u.reason)).toEqual([
      expect.stringMatching(/Malformed/),
      expect.stringMatching(/Unknown destination/),
      expect.stringMatching(/excluded/),
      expect.stringMatching(/not found/),
    ]);
  });

  it('round-trips the shortcode wrapper and tolerates bare JSON', () => {
    const json = '{ "assignments": {} }';
    expect(unwrapShortcode(wrapAsShortcode(json))).toBe(json);
    expect(unwrapShortcode(`  ${json}\n`)).toBe(json);
    expect(unwrapShortcode('[living_term_browser source="x"]\n{"a":1}\n[/living_term_browser]')).toBe('{"a":1}');
  });

  it('temp filters are optional extra info: absent leaves null, present is parsed', () => {
    expect(validateImport({ assignments: {} }, ctx).tempFilters).toBeNull();
    const r = validateImport({ assignments: {}, tempFilters: { filters: [{ id: 'a', name: 'Sports', termKeys: ['category:1', 'bogus'] }], activeId: 'a' } }, ctx);
    expect(r.tempFilters).toEqual({ filters: [{ id: 'a', name: 'Sports', termKeys: ['category:1'], operator: 'OR' }], activeId: 'a', enabled: true });
  });

  it('rejects a newer schema', () => {
    expect(() => validateImport({ schemaVersion: 99, assignments: {} }, ctx)).toThrow(/newer/);
  });
});

describe('temporary filter operator persistence', () => {
  it('restores AND from storage and shortcode JSON, including empty named filters', () => {
    const snapshot = parseTempFilters({ filters: [
      { id: 'a', name: 'Match both', termKeys: ['category:1', 'post_tag:2'], operator: 'AND' },
      { id: 'b', name: 'Empty AND', termKeys: [], operator: 'AND' },
    ], activeId: 'a', enabled: false })!;
    saveTempFilters(ctx.sourceUrl, snapshot);
    expect(loadTempFilters(ctx.sourceUrl)).toEqual(snapshot);
    const doc = buildConfigDocument({ sourceUrl: ctx.sourceUrl, assignments: {}, excludedTermKeys: [], unresolvedAssignments: [], tempFilters: snapshot });
    const imported = validateImport(JSON.parse(unwrapShortcode(wrapAsShortcode(JSON.stringify(doc)))), ctx);
    expect(imported.tempFilters).toEqual(snapshot);
  });

  it('defaults missing and unrecognized operators to OR, including legacy arrays', () => {
    expect(parseTempFilters(['category:1'])?.filters[0]?.operator).toBe('OR');
    for (const operator of [undefined, null, 'XOR', 'OR']) {
      expect(parseTempFilters({ filters: [{ id: 'a', name: 'Old', termKeys: [], operator }] })?.filters[0]?.operator).toBe('OR');
    }
  });
});
