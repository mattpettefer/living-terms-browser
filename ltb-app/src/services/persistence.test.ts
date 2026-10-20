import { describe, expect, it } from 'vitest';
import { validateImport } from './persistence';

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

  it('warns on a different source url and rejects a newer schema', () => {
    expect(validateImport({ sourceUrl: 'https://other.test', assignments: {} }, ctx).warnings).toHaveLength(1);
    expect(() => validateImport({ schemaVersion: 99, assignments: {} }, ctx)).toThrow(/newer/);
  });
});
