import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMediaBatch, fetchPostIndex, fetchTermInventory } from './wordpress';

const cfg = { baseUrl: 'https://living.life.edu', postsRestBase: 'posts' };

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
}

afterEach(() => vi.restoreAllMocks());

describe('fetchPostIndex', () => {
  it('pages through every post with full term arrays and no embeds, reporting progress', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = new URL(String(input));
      const page = Number(u.searchParams.get('page'));
      return jsonResponse(
        [{ id: page, date: `2024-0${page}-01T00:00:00`, modified: '2024-01-01T00:00:00', link: `https://living.life.edu/${page}/`, title: { rendered: 'A &amp; B' }, categories: [173, 9], tags: [111] }],
        { 'X-WP-Total': '3', 'X-WP-TotalPages': '3' },
      );
    });
    const seen: number[] = [];
    let last: { loadedPages: number; totalPages: number | null } | null = null;
    await fetchPostIndex(cfg, (p) => {
      seen.push(...p.posts.map((x) => x.id));
      last = { loadedPages: p.loadedPages, totalPages: p.totalPages };
    });
    expect(spy).toHaveBeenCalledTimes(3);
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/wp-json/wp/v2/posts');
    expect(url.searchParams.get('per_page')).toBe('100');
    expect(url.searchParams.get('_fields')).toContain('categories');
    expect(url.searchParams.get('_fields')).toContain('tags');
    expect(url.searchParams.has('_embed')).toBe(false);
    expect(seen.sort()).toEqual([1, 2, 3]);
    expect(last).toEqual({ loadedPages: 3, totalPages: 3 });
  });

  it('surfaces HTTP errors with status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(fetchPostIndex(cfg, () => {})).rejects.toThrow(/503/);
  });
});

describe('fetchMediaBatch', () => {
  it('requests unique ids in one call and resolves missing media to null', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse([
        { id: 5, source_url: 'https://x/full.jpg', media_details: { sizes: { medium_large: { source_url: 'https://x/ml.jpg' } } } },
        { id: 7, source_url: 'https://x/only.jpg' },
      ]),
    );
    const r = await fetchMediaBatch(cfg, [7, 5, 5, 9, 0]);
    expect(spy).toHaveBeenCalledTimes(1);
    const u = new URL(spy.mock.calls[0]![0] as string);
    expect(u.pathname).toBe('/wp-json/wp/v2/media');
    expect(u.searchParams.get('include')).toBe('5,7,9');
    expect(r).toEqual({ 5: 'https://x/ml.jpg', 7: 'https://x/only.jpg', 9: null });
  });

  it('skips the request when there is nothing to resolve', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await fetchMediaBatch(cfg, [0])).toEqual({});
    expect(spy).not.toHaveBeenCalled();
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
