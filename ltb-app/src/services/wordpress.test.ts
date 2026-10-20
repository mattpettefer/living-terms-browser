import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPosts, fetchTermInventory } from './wordpress';

const cfg = { baseUrl: 'https://living.life.edu', postsRestBase: 'posts' };

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
}

afterEach(() => vi.restoreAllMocks());

describe('fetchPosts', () => {
  it('sends sorted exact IDs with OR relation and keeps complete term arrays', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        [{ id: 5, date: '2024-01-01T00:00:00', modified: '2024-01-01T00:00:00', link: 'https://living.life.edu/a/', title: { rendered: 'A &amp; B' }, categories: [173, 9], tags: [111] }],
        { 'X-WP-Total': '106', 'X-WP-TotalPages': '5' },
      ),
    );
    const r = await fetchPosts(cfg, { categoryIds: [173, 2], tagIds: [111], page: 2 });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/wp-json/wp/v2/posts');
    expect(url.searchParams.get('categories')).toBe('2,173');
    expect(url.searchParams.get('tags')).toBe('111');
    expect(url.searchParams.get('tax_relation')).toBe('OR');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('_fields')).toContain('categories');
    expect(url.searchParams.get('_fields')).toContain('_links');
    expect(url.searchParams.get('_embed')).toContain('wp:featuredmedia');
    expect(r.total).toBe(106);
    expect(r.totalPages).toBe(5);
    expect(r.posts[0]?.title).toBe('A & B');
    expect(r.posts[0]?.termKeys).toEqual(['category:173', 'category:9', 'post_tag:111']);
    expect(r.posts[0]?.termsComplete).toBe(true);
  });

  it('omits empty filters and tax_relation for a single taxonomy / all posts', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse([]));
    await fetchPosts(cfg, { categoryIds: [], tagIds: [4], page: 1 });
    const u1 = new URL(spy.mock.calls[0]![0] as string);
    expect(u1.searchParams.has('categories')).toBe(false);
    expect(u1.searchParams.has('tax_relation')).toBe(false);
    await fetchPosts(cfg, { categoryIds: [], tagIds: [], page: 1 });
    const u2 = new URL(spy.mock.calls[1]![0] as string);
    expect(u2.searchParams.has('tags')).toBe(false);
  });

  it('surfaces HTTP errors with status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(fetchPosts(cfg, { categoryIds: [1], tagIds: [], page: 1 })).rejects.toThrow(/503/);
  });
});

describe('fetchTermInventory', () => {
  it('follows pagination for both taxonomies with hide_empty=false', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = new URL(String(input));
      const page = Number(u.searchParams.get('page'));
      const isCat = u.pathname.endsWith('/categories');
      const totalPages = isCat ? 1 : 3;
      return jsonResponse([{ id: page * 10 + (isCat ? 1 : 2), name: `T${page}`, slug: `t${page}`, count: 0 }], { 'X-WP-TotalPages': String(totalPages) });
    });
    const seen: string[] = [];
    await fetchTermInventory(cfg, (p) => seen.push(...p.terms.map((t) => t.key)));
    expect(spy).toHaveBeenCalledTimes(4);
    expect(seen.sort()).toEqual(['category:11', 'post_tag:12', 'post_tag:22', 'post_tag:32']);
    expect(new URL(String(spy.mock.calls[0]![0])).searchParams.get('hide_empty')).toBe('false');
  });
});
