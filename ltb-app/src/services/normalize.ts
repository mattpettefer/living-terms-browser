import type { PostRecord, SourceTerm, Taxonomy, TermKey } from '../state/types';

export function termKey(taxonomy: Taxonomy, id: number): TermKey {
  return `${taxonomy}:${id}`;
}

export function parseTermKey(value: string): { taxonomy: Taxonomy; id: number } | null {
  const m = /^(category|post_tag):(\d+)$/.exec(value);
  if (!m) return null;
  return { taxonomy: m[1] as Taxonomy, id: Number(m[2]) };
}

const decoder = typeof document !== 'undefined' ? document.createElement('textarea') : null;

export function decodeEntities(html: string): string {
  if (!html) return '';
  if (decoder) {
    decoder.innerHTML = html;
    return decoder.value;
  }
  return html
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#?8217;|&rsquo;/g, '\u2019');
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export interface WpTerm {
  id: number;
  name: string;
  slug: string;
  count?: number;
  taxonomy?: string;
}

export function normalizeTerm(raw: WpTerm, taxonomy: Taxonomy): SourceTerm {
  return {
    key: termKey(taxonomy, raw.id),
    id: raw.id,
    taxonomy,
    name: decodeEntities(raw.name),
    slug: raw.slug,
    sourceCount: raw.count ?? 0,
  };
}

export interface WpPost {
  id: number;
  date: string;
  modified: string;
  link: string;
  title?: { rendered: string };
  excerpt?: { rendered: string };
  content?: { rendered: string };
  featured_media?: number;
  categories?: number[];
  tags?: number[];
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url?: string; media_details?: { sizes?: Record<string, { source_url: string; width?: number }> } }>;
    'wp:term'?: Array<Array<WpTerm & { taxonomy: string }>>;
  };
}

const PREFERRED_SIZES = ['medium_large', 'large', 'medium', 'full'];

export function pickImageUrl(post: WpPost): string | null {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  if (!media || !media.source_url) return null;
  const sizes = media.media_details?.sizes;
  if (sizes) for (const s of PREFERRED_SIZES) if (sizes[s]?.source_url) return sizes[s]!.source_url;
  return media.source_url;
}

export function normalizePost(raw: WpPost): PostRecord {
  const hasCats = Array.isArray(raw.categories);
  const hasTags = Array.isArray(raw.tags);
  const termKeys: TermKey[] = [
    ...(raw.categories ?? []).map((id) => termKey('category', id)),
    ...(raw.tags ?? []).map((id) => termKey('post_tag', id)),
  ];
  const record: PostRecord = {
    id: raw.id,
    title: decodeEntities(raw.title?.rendered ?? ''),
    excerptHtml: raw.excerpt?.rendered ?? '',
    sourceUrl: raw.link,
    date: raw.date,
    modified: raw.modified,
    featuredMediaId: raw.featured_media ?? 0,
    imageUrl: pickImageUrl(raw),
    termKeys,
    termsComplete: hasCats && hasTags,
    contentLoaded: raw.content !== undefined,
  };
  if (raw.content !== undefined) record.contentHtml = raw.content.rendered ?? '';
  return record;
}

/** Terms embedded alongside a post (`_embed=wp:term`), used to label terms not yet in the inventory. */
export function embeddedTerms(raw: WpPost): SourceTerm[] {
  const groups = raw._embedded?.['wp:term'] ?? [];
  const out: SourceTerm[] = [];
  for (const group of groups) {
    for (const t of group) {
      if (t.taxonomy === 'category' || t.taxonomy === 'post_tag') out.push(normalizeTerm(t, t.taxonomy));
    }
  }
  return out;
}

export function normalizeSourceUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}
