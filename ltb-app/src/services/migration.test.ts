import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createInitialState } from '../state/reducer';
import { normalizePost, normalizeTerm } from './normalize';
import { buildMigrationDocument } from './migration';
import { buildConfigDocument } from './persistence';

const identity = { id: 'fixture-export', revision: 'fixture-revision-1', createdAt: '2026-10-30T12:00:00Z' };
function fixture() {
  const state = createInitialState({ baseUrl: 'https://living.life.edu', postsRestBase: 'posts' });
  const terms = [normalizeTerm({ id: 101, name: 'Old leadership', slug: 'old-leadership' }, 'category'), normalizeTerm({ id: 202, name: 'Leaders', slug: 'leaders' }, 'post_tag'), normalizeTerm({ id: 303, name: 'Retired', slug: 'retired' }, 'post_tag'), normalizeTerm({ id: 404, name: 'Community', slug: 'community' }, 'post_tag')];
  state.termsByKey = Object.fromEntries(terms.map(t => [t.key, t])); state.termOrder = terms.map(t => t.key);
  for (let id = 1; id <= 27; id++) {
    state.postsById[id] = normalizePost({ id, title: { rendered: `Illustrative Living post ${id}` }, link: `https://living.life.edu/fixture-${id}/`, date: '2026-10-29T12:00:00', modified: '2026-10-29T14:00:00', featured_media: id === 1 ? 456 : 0, categories: [101], tags: [202, 303, 404] });
    state.postOrder.push(id); state.postSelections[id] = id === 1 ? ['campus-life', 'university-news'] : 'campus-life';
  }
  state.mergers = [{ id: 'lead', name: 'Leadership', slug: 'leadership', termKeys: ['category:101', 'post_tag:202'] }, { id: 'retired', name: 'Retired', slug: 'retired', termKeys: ['post_tag:303'], excludeFromFinal: true }];
  state.finalTerms = { 'campus-life': ['category:101', 'post_tag:303'], 'university-news': ['post_tag:404'] };
  state.postIndex = { ...state.postIndex, complete: true, status: 'success' };
  state.termsInventory = { ...state.termsInventory, complete: true, status: 'success' };
  state.tempFilters[0]!.termKeys = ['category:999']; state.tempFilterEnabled = true;
  return state;
}
describe('resolved migration producer', () => {
  it('exports every explicit selection, unioned categories, merged tags, drops and image references', () => {
    const doc = buildMigrationDocument(fixture(), identity);
    expect(doc.posts).toHaveLength(27);
    expect(doc.posts[0]!.categoryKeys).toEqual(['category:campus-life', 'category:university-news']);
    expect(doc.posts[0]!.tagKeys).toEqual(['tag:community', 'tag:leadership']);
    expect(doc.posts[1]!.tagKeys).toEqual(['tag:leadership']);
    expect(doc.terms.tags.map(t => t.slug)).toEqual(['community', 'leadership']);
    expect(doc.posts[0]!.featuredImage).toEqual({ sourceMediaId: 456 }); expect(doc.posts[1]!.featuredImage).toBeNull();
    expect(doc.posts[0]!.provenance.decisions.find(d => d.sourceTermKey === 'post_tag:303')!.outcome).toBe('excluded-merger');
    expect(doc.posts[1]!.provenance.decisions.find(d => d.sourceTermKey === 'post_tag:404')!.outcome).toBe('not-allowed');
    expect(doc).not.toHaveProperty('assignments'); expect(doc).not.toHaveProperty('mergers');
    if (process.env.LCI_FIXTURE_OUTPUT) writeFileSync(process.env.LCI_FIXTURE_OUTPUT, JSON.stringify(doc, null, 2));
  });
  it('does not silently skip a selected post missing from the cache or order', () => {
    const s = fixture(); s.postOrder = []; expect(buildMigrationDocument(s, identity).posts).toHaveLength(27);
    delete s.postsById[1]; expect(() => buildMigrationDocument(s, identity)).toThrow(/Selected post 1/);
  });
  it('rejects partial inventories, unknown featured-media state and missing source terms', () => {
    const a = fixture(); a.postIndex.complete = false; expect(() => buildMigrationDocument(a, identity)).toThrow(/complete post index/);
    const b = fixture(); b.postsById[1]!.featuredMediaKnown = false; expect(() => buildMigrationDocument(b, identity)).toThrow(/unknown featured image/);
    const c = fixture(); delete c.termsByKey['post_tag:202']; expect(() => buildMigrationDocument(c, identity)).toThrow(/missing from the inventory/);
  });
  it('reports conflicting tag labels for one destination slug across posts', () => {
    const s = fixture(); s.mergers = []; s.termsByKey['post_tag:202']!.slug = 'old-leadership';
    s.postsById[2]!.termKeys = ['post_tag:202']; s.finalTerms['campus-life'] = ['category:101', 'post_tag:202'];
    expect(() => buildMigrationDocument(s, identity)).toThrow(/conflicting names/);
  });
  it('keeps the configuration backup at schema 4', () => {
    const s = fixture();
    expect(buildConfigDocument({ sourceUrl: s.source.baseUrl, assignments: s.assignments, postSelections: s.postSelections, finalTerms: s.finalTerms, mergers: s.mergers, excludedTermKeys: [], unresolvedAssignments: [] }).schemaVersion).toBe(4);
  });
});
