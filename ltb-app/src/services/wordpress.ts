import type { PostRecord, SourceTerm, Taxonomy } from '../state/types';
import { embeddedTerms, normalizePost, normalizeTerm, type WpPost, type WpTerm } from './normalize';
import { dedupe } from './requestCache';

export interface SourceConfig {
  baseUrl: string;
  postsRestBase: string;
}

export const PER_PAGE = 100;
const CONCURRENCY = 3;


export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

interface Page<T> {
  data: T;
  total: number | null;
  totalPages: number | null;
}

function restRoot(cfg: SourceConfig): string {
  return `${cfg.baseUrl.replace(/\/+$/, '')}/wp-json/wp/v2`;
}

function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

async function fetchPage<T>(url: string, signal?: AbortSignal): Promise<Page<T>> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ? `: ${body.message}` : '';
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 429) throw new HttpError(429, 'The source site is rate limiting requests. Please wait and retry.');
    throw new HttpError(res.status, `Source request failed (${res.status})${detail}`);
  }
  const total = Number(res.headers.get('X-WP-Total'));
  const totalPages = Number(res.headers.get('X-WP-TotalPages'));
  return {
    data: (await res.json()) as T,
    total: Number.isFinite(total) && res.headers.has('X-WP-Total') ? total : null,
    totalPages: Number.isFinite(totalPages) && res.headers.has('X-WP-TotalPages') ? totalPages : null,
  };
}

async function runQueue<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
    }
  });
  await Promise.all(workers);
  return results;
}

/* ---------------------------------- Terms ---------------------------------- */

const TAXONOMY_ROUTE: Record<Taxonomy, string> = { category: 'categories', post_tag: 'tags' };

export interface InventoryProgress {
  terms: SourceTerm[];
  loadedPages: number;
  totalPages: number | null;
}

/** Fetch every page of both taxonomies, reporting progress per page. */
export async function fetchTermInventory(
  cfg: SourceConfig,
  onProgress: (p: InventoryProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const taxonomies: Taxonomy[] = ['category', 'post_tag'];
  let loadedPages = 0;
  let totalPages: number | null = null;
  const knownTotals: Partial<Record<Taxonomy, number>> = {};

  const pageUrl = (tax: Taxonomy, page: number) =>
    buildUrl(`${restRoot(cfg)}/${TAXONOMY_ROUTE[tax]}`, {
      per_page: PER_PAGE,
      page,
      hide_empty: 'false',
      orderby: 'name',
      order: 'asc',
      _fields: 'id,name,slug,count',
    });

  const report = (terms: SourceTerm[]) => {
    loadedPages += 1;
    const totals = Object.values(knownTotals);
    totalPages = totals.length === taxonomies.length ? totals.reduce((a, b) => a + b, 0) : null;
    onProgress({ terms, loadedPages, totalPages });
  };

  const firstPages = await Promise.all(
    taxonomies.map(async (tax) => {
      const page = await fetchPage<WpTerm[]>(pageUrl(tax, 1), signal);
      knownTotals[tax] = page.totalPages ?? 1;
      return { tax, page };
    }),
  );
  for (const { tax, page } of firstPages) report(page.data.map((t) => normalizeTerm(t, tax)));

  const remaining: Array<() => Promise<void>> = [];
  for (const tax of taxonomies) {
    for (let p = 2; p <= (knownTotals[tax] ?? 1); p++) {
      remaining.push(async () => {
        const page = await fetchPage<WpTerm[]>(pageUrl(tax, p), signal);
        report(page.data.map((t) => normalizeTerm(t, tax)));
      });
    }
  }
  await runQueue(remaining, CONCURRENCY);
}


/* ---------------------------------- Posts ---------------------------------- */

const INDEX_FIELDS = ['id', 'date', 'modified', 'link', 'title', 'excerpt', 'featured_media', 'categories', 'tags'];
const ARTICLE_FIELDS = [...INDEX_FIELDS, 'content', '_links', '_embedded'];
const EMBED = 'wp:featuredmedia,wp:term';

export interface IndexProgress {
  posts: PostRecord[];
  loadedPages: number;
  totalPages: number | null;
  totalPosts: number | null;
}

/**
 * Fetch the complete lightweight post index (no embeds: ~80 KB per 100 posts
 * versus ~850 KB with featured media embedded). Every page carries full
 * category/tag ID arrays, so destination matching, overlap detection and the
 * temporary filter can all run locally with exact semantics.
 */
export async function fetchPostIndex(cfg: SourceConfig, onProgress: (p: IndexProgress) => void, signal?: AbortSignal): Promise<void> {
  const url = (page: number) =>
    buildUrl(`${restRoot(cfg)}/${cfg.postsRestBase}`, {
      per_page: PER_PAGE,
      page,
      orderby: 'date',
      order: 'desc',
      status: 'publish',
      _fields: INDEX_FIELDS.join(','),
    });
  let loadedPages = 0;
  const first = await fetchPage<WpPost[]>(url(1), signal);
  const totalPages = first.totalPages ?? 1;
  const report = (data: WpPost[]) => {
    loadedPages += 1;
    onProgress({ posts: data.map(normalizePost), loadedPages, totalPages, totalPosts: first.total });
  };
  report(first.data);
  await runQueue(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => async () => report((await fetchPage<WpPost[]>(url(i + 2), signal)).data)),
    CONCURRENCY,
  );
}

export async function fetchPost(cfg: SourceConfig, id: number, signal?: AbortSignal): Promise<{ post: PostRecord; terms: SourceTerm[] }> {
  const url = buildUrl(`${restRoot(cfg)}/${cfg.postsRestBase}/${id}`, { _fields: ARTICLE_FIELDS.join(','), _embed: EMBED });
  const page = await dedupe(url, () => fetchPage<WpPost>(url, signal));
  const seen = new Map<string, SourceTerm>();
  for (const t of embeddedTerms(page.data)) seen.set(t.key, t);
  return { post: normalizePost(page.data), terms: [...seen.values()] };
}

/* ---------------------------------- Media ---------------------------------- */

interface WpMedia {
  id: number;
  source_url?: string;
  media_details?: { sizes?: Record<string, { source_url: string }> };
}

const MEDIA_FIELDS = ['id', 'source_url', 'media_details.sizes.medium_large.source_url', 'media_details.sizes.large.source_url', 'media_details.sizes.medium.source_url'];
const PREFERRED_SIZES = ['medium_large', 'large', 'medium'];

/** Resolve featured images for a batch of media IDs in one request (used per displayed page of cards). */
export async function fetchMediaBatch(cfg: SourceConfig, ids: number[], signal?: AbortSignal): Promise<Record<number, string | null>> {
  const unique = [...new Set(ids.filter((id) => id > 0))].sort((a, b) => a - b);
  if (unique.length === 0) return {};
  // WordPress caps a page at 100 items, even when include contains more IDs.
  const batches = Array.from({ length: Math.ceil(unique.length / PER_PAGE) }, (_, i) => unique.slice(i * PER_PAGE, (i + 1) * PER_PAGE));
  const pages = await runQueue(batches.map((batch) => () => {
    const url = buildUrl(`${restRoot(cfg)}/media`, { include: batch.join(','), per_page: batch.length, _fields: MEDIA_FIELDS.join(',') });
    return dedupe(url, () => fetchPage<WpMedia[]>(url, signal));
  }), CONCURRENCY);
  const out: Record<number, string | null> = {};
  for (const id of unique) out[id] = null; // Missing/deleted media resolve to an explicit null so we don't retry forever.
  for (const m of pages.flatMap((page) => page.data)) {
    const sizes = m.media_details?.sizes;
    out[m.id] = (sizes && PREFERRED_SIZES.map((s) => sizes[s]?.source_url).find(Boolean)) ?? m.source_url ?? null;
  }
  return out;
}

/* --------------------------------- Helpers --------------------------------- */

export function describeError(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof TypeError) return 'Could not reach the source site. Check your network connection or CORS settings.';
  return e instanceof Error ? e.message : 'Unknown error';
}
