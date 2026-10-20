import type { PostRecord, SourceTerm, Taxonomy } from '../state/types';
import { embeddedTerms, normalizePost, normalizeTerm, type WpPost, type WpTerm } from './normalize';
import { dedupe } from './requestCache';

export interface SourceConfig {
  baseUrl: string;
  postsRestBase: string;
}

export const PER_PAGE = 100;
export const POSTS_PAGE_SIZE = 24;
/** Conservative limit below common 8 KB server URL caps. */
export const MAX_URL_LENGTH = 6000;
const CONCURRENCY = 3;

const CARD_FIELDS = ['id', 'date', 'modified', 'link', 'title', 'excerpt', 'featured_media', 'categories', 'tags', '_links', '_embedded'];
const ARTICLE_FIELDS = [...CARD_FIELDS, 'content'];
const EMBED = 'wp:featuredmedia,wp:term';

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

export interface PostsQuery {
  categoryIds: number[];
  tagIds: number[];
  page: number;
  perPage?: number;
}

export interface PostsResult {
  posts: PostRecord[];
  terms: SourceTerm[];
  total: number | null;
  totalPages: number | null;
  /** True when results came from the locally filtered index fallback. */
  fromIndex: boolean;
}

function postsUrl(cfg: SourceConfig, q: PostsQuery, fields: string[]): string {
  const cats = [...q.categoryIds].sort((a, b) => a - b);
  const tags = [...q.tagIds].sort((a, b) => a - b);
  return buildUrl(`${restRoot(cfg)}/${cfg.postsRestBase}`, {
    per_page: q.perPage ?? POSTS_PAGE_SIZE,
    page: q.page,
    orderby: 'date',
    order: 'desc',
    status: 'publish',
    categories: cats.length ? cats.join(',') : undefined,
    tags: tags.length ? tags.join(',') : undefined,
    tax_relation: cats.length && tags.length ? 'OR' : undefined,
    _fields: fields.join(','),
    _embed: EMBED,
  });
}

function collectTerms(raws: WpPost[]): SourceTerm[] {
  const seen = new Map<string, SourceTerm>();
  for (const raw of raws) for (const t of embeddedTerms(raw)) seen.set(t.key, t);
  return [...seen.values()];
}

/**
 * One combined request per results page. When neither filter is provided this
 * is an unfiltered "All Posts" query; callers must never pass empty filters for
 * a destination (an empty destination has no matching posts by definition).
 */
export async function fetchPosts(cfg: SourceConfig, q: PostsQuery, signal?: AbortSignal): Promise<PostsResult> {
  const url = postsUrl(cfg, q, CARD_FIELDS);
  if (url.length > MAX_URL_LENGTH) return fetchPostsViaIndex(cfg, q, signal);
  const page = await dedupe(url, () => fetchPage<WpPost[]>(url, signal));
  return {
    posts: page.data.map(normalizePost),
    terms: collectTerms(page.data),
    total: page.total,
    totalPages: page.totalPages,
    fromIndex: false,
  };
}

export async function fetchPost(cfg: SourceConfig, id: number, signal?: AbortSignal): Promise<{ post: PostRecord; terms: SourceTerm[] }> {
  const url = buildUrl(`${restRoot(cfg)}/${cfg.postsRestBase}/${id}`, { _fields: ARTICLE_FIELDS.join(','), _embed: EMBED });
  const page = await dedupe(url, () => fetchPage<WpPost>(url, signal));
  return { post: normalizePost(page.data), terms: collectTerms([page.data]) };
}

/* ------------------------- Lightweight index fallback ------------------------- */
// Used only when the assigned-term list is too large for a single query URL.
// Fetches the complete lightweight post list once, caches it in memory, then
// filters/paginates locally with exact attached-ID semantics.

let indexCache: { key: string; promise: Promise<WpPost[]> } | null = null;

async function loadIndex(cfg: SourceConfig, signal?: AbortSignal): Promise<WpPost[]> {
  const key = `${cfg.baseUrl}|${cfg.postsRestBase}`;
  if (indexCache?.key === key) return indexCache.promise;
  const promise = (async () => {
    const url = (page: number) => postsUrl(cfg, { categoryIds: [], tagIds: [], page, perPage: PER_PAGE }, CARD_FIELDS);
    const first = await fetchPage<WpPost[]>(url(1), signal);
    const pages = first.totalPages ?? 1;
    const rest = await runQueue(
      Array.from({ length: Math.max(0, pages - 1) }, (_, i) => () => fetchPage<WpPost[]>(url(i + 2), signal).then((p) => p.data)),
      CONCURRENCY,
    );
    return [...first.data, ...rest.flat()];
  })();
  indexCache = { key, promise };
  promise.catch(() => {
    if (indexCache?.promise === promise) indexCache = null;
  });
  return promise;
}

async function fetchPostsViaIndex(cfg: SourceConfig, q: PostsQuery, signal?: AbortSignal): Promise<PostsResult> {
  const all = await loadIndex(cfg, signal);
  const cats = new Set(q.categoryIds);
  const tags = new Set(q.tagIds);
  const matched = all
    .filter((p) => (p.categories ?? []).some((id) => cats.has(id)) || (p.tags ?? []).some((id) => tags.has(id)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const perPage = q.perPage ?? POSTS_PAGE_SIZE;
  const start = (q.page - 1) * perPage;
  const slice = matched.slice(start, start + perPage);
  return {
    posts: slice.map(normalizePost),
    terms: collectTerms(slice),
    total: matched.length,
    totalPages: Math.max(1, Math.ceil(matched.length / perPage)),
    fromIndex: true,
  };
}

/* --------------------------------- Helpers --------------------------------- */

export function buildQueryKey(destination: string, categoryIds: number[], tagIds: number[]): string {
  const c = [...categoryIds].sort((a, b) => a - b).join(',');
  const t = [...tagIds].sort((a, b) => a - b).join(',');
  return `${destination}|c:${c}|t:${t}`;
}

export function describeError(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof TypeError) return 'Could not reach the source site. Check your network connection or CORS settings.';
  return e instanceof Error ? e.message : 'Unknown error';
}
