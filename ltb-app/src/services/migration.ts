import { getEffectiveFinalTermKeys, getFinalTags, validateFinalTerms } from '../state/finalTerms';
import { getMergerIndex, validateMergers } from '../state/mergers';
import { selectedDestinations } from '../state/postSelections';
import type { AppState, TermKey } from '../state/types';

export interface MigrationTerm { key: string; slug: string; name: string }
export interface MigrationPost {
  sourcePostId: number;
  sourceUrl: string;
  preview: { title: string; date: string };
  categoryKeys: string[];
  tagKeys: string[];
  featuredImage: { sourceMediaId: number } | null;
  overrides: Record<string, string>;
  provenance: {
    sourceModified: string;
    sourceTermKeys: TermKey[];
    decisions: Array<{
      sourceTermKey: TermKey; candidateTagKey: string; mergerId: string | null;
      outcome: 'retained' | 'not-allowed' | 'excluded-merger'; allowedByCategoryKeys: string[];
    }>;
  };
}

function sourceUrl(value: string): string {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error('Use a source site URL without credentials, query or fragment.');
  return u.toString().replace(/\/+$/, '');
}

/** One execution snapshot. Rules stay in LTB; the importer consumes only these results. */
export function buildMigrationDocument(state: AppState, identity: { id: string; revision: string; createdAt: string }) {
  if (!state.postIndex.complete || state.postIndex.status !== 'success' || !state.termsInventory.complete || state.termsInventory.status !== 'success') {
    throw new Error('Wait for the complete post index and term inventory before exporting migration instructions.');
  }
  validateMergers(state.mergers);
  validateFinalTerms(state.finalTerms);
  if (state.unresolvedAssignments.length) throw new Error('Resolve the configuration entries needing review before exporting a migration.');
  const ids = Object.keys(state.postSelections).map(Number).sort((a, b) => a - b);
  if (!ids.length) throw new Error('Select at least one post in Selections first.');
  const baseUrl = sourceUrl(state.source.baseUrl);
  if (!/^[a-zA-Z0-9_-]+$/.test(state.source.postsRestBase)) throw new Error('Invalid source posts REST base.');
  const categories = state.destinationCategories.map(d => ({ key: 'category:' + d.id, name: d.name, slug: d.id }));
  const tags = new Map<string, MigrationTerm>();
  const sourceKeys = new Set<TermKey>();
  const mergerIndex = getMergerIndex(state);
  for (const key of [...state.mergers.flatMap(m => m.termKeys), ...Object.values(state.finalTerms).flat()]) {
    if (!state.termsByKey[key]) throw new Error(`Source term ${key} is missing from the inventory. Review Final and Mergers.`);
  }
  const posts: MigrationPost[] = ids.map(id => {
    const post = state.postsById[id];
    if (!Number.isSafeInteger(id) || id <= 0 || !post?.termsComplete) throw new Error(`Selected post ${id} is missing or has incomplete terms.`);
    const destinations = selectedDestinations(state, id);
    if (destinations.length < 1 || destinations.length > 2 || new Set(destinations).size !== destinations.length || destinations.some(d => !categories.some(c => c.key === 'category:' + d))) throw new Error(`Post ${id} needs one or two valid destination categories.`);
    const url = new URL(post.sourceUrl);
    if (url.origin !== new URL(baseUrl).origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`Post ${id} has an invalid source URL.`);
    if (!post.title.trim() || !post.modified || !post.date) throw new Error(`Post ${id} is missing its title, date or modified timestamp.`);
    if (post.featuredMediaKnown !== true || !Number.isSafeInteger(post.featuredMediaId) || post.featuredMediaId < 0) throw new Error(`Post ${id} has an unknown featured image reference. Reload the source index.`);
    for (const key of post.termKeys) {
      const term = state.termsByKey[key];
      if (!term?.name.trim() || !term.slug || !/^(category|post_tag):[1-9]\d*$/.test(key)) throw new Error(`Post ${id} has unresolved source term ${key}.`);
      sourceKeys.add(key);
    }
    const finalTags = getFinalTags(state, post);
    for (const tag of finalTags) {
      if (!tag.slug || /[\s<>"'/?#]/.test(tag.slug)) throw new Error(`Invalid destination tag slug: ${tag.slug || tag.id}`);
      const key = 'tag:' + tag.slug;
      const previous = tags.get(key);
      if (previous && previous.name !== tag.name) throw new Error(`Final tag slug "${tag.slug}" has conflicting names. Use a merger to choose its canonical name.`);
      tags.set(key, { key, slug: tag.slug, name: tag.name });
    }
    const allowed = destinations.map(d => ({ key: 'category:' + d, terms: getEffectiveFinalTermKeys(state, d) }));
    return {
      sourcePostId: id, sourceUrl: post.sourceUrl,
      preview: { title: post.title, date: post.date },
      categoryKeys: destinations.map(d => 'category:' + d).sort(),
      tagKeys: finalTags.map(t => 'tag:' + t.slug).sort(),
      featuredImage: post.featuredMediaId ? { sourceMediaId: post.featuredMediaId } : null,
      overrides: {},
      provenance: {
        sourceModified: post.modified,
        sourceTermKeys: [...new Set(post.termKeys)].sort(),
        decisions: [...new Set(post.termKeys)].sort().map(key => {
          const merger = mergerIndex.byTerm.get(key);
          const allowedBy = allowed.filter(a => a.terms.has(key)).map(a => a.key).sort();
          return {
            sourceTermKey: key, candidateTagKey: 'tag:' + (merger?.slug ?? state.termsByKey[key]!.slug),
            mergerId: merger?.id ?? null,
            outcome: merger?.excludeFromFinal ? 'excluded-merger' as const : allowedBy.length ? 'retained' as const : 'not-allowed' as const,
            allowedByCategoryKeys: merger?.excludeFromFinal ? [] : allowedBy,
          };
        }),
      },
    };
  });
  return {
    documentType: 'living-migration' as const, schemaVersion: 1 as const,
    export: identity,
    source: { siteKey: baseUrl, baseUrl, namespace: 'wp/v2', postsRestBase: state.source.postsRestBase, mediaRestBase: 'media' },
    destination: { postType: 'blog', categoryTaxonomy: 'category', tagTaxonomy: 'post_tag', initialStatus: 'draft', updatePolicy: 'create-resume-skip' },
    terms: { categories: categories.sort((a,b) => a.key.localeCompare(b.key)), tags: [...tags.values()].sort((a,b) => a.key.localeCompare(b.key)) },
    sourceTerms: [...sourceKeys].sort().map(key => { const { sourceCount: _count, ...term } = state.termsByKey[key]!; return term; }),
    posts,
  };
}

export function newMigrationIdentity() {
  // Works on HTTP WordPress installations too: getRandomValues does not require HTTPS.
  const uuid = () => { const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6]! & 15) | 64; b[8] = (b[8]! & 63) | 128; const h = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
  return { id: uuid(), revision: uuid(), createdAt: new Date().toISOString() };
}
