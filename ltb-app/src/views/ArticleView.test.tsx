import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createInitialState, reducer } from '../state/reducer';
import { StoreProvider } from '../state/provider';
import type { AppState, PostRecord, SourceTerm } from '../state/types';
import { ArticleView } from './ArticleView';

vi.mock('../effects/useArticle', () => ({
  useArticle: (postId: number | null) => ({ post: postId === null ? undefined : current.postsById[postId], request: undefined, retry: () => {} }),
}));

let current: AppState;

function term(taxonomy: 'category' | 'post_tag', id: number, name: string): SourceTerm {
  return { key: `${taxonomy}:${id}`, id, taxonomy, name, slug: name.toLowerCase(), sourceCount: 1 };
}

const post: PostRecord = {
  id: 7,
  title: 'Overlap post',
  excerptHtml: '',
  sourceUrl: 'https://living.life.edu/x/',
  date: '2024-05-01T00:00:00',
  modified: '2024-05-01T00:00:00',
  featuredMediaId: 0,
  imageUrl: null,
  termKeys: ['category:1', 'post_tag:2', 'post_tag:3', 'category:9'],
  termsComplete: true,
  contentHtml: '<p>Body</p>',
  contentLoaded: true,
};

function buildState(): AppState {
  let s = createInitialState({ baseUrl: 'https://living.life.edu', postsRestBase: 'posts' });
  s = reducer(s, { type: 'TERMS_LOAD_START', requestId: 'r' });
  s = reducer(s, {
    type: 'TERMS_PAGE_LOADED',
    requestId: 'r',
    loadedPages: 1,
    totalPages: 1,
    terms: [term('category', 1, 'Athletics'), term('post_tag', 2, 'Rugby'), term('post_tag', 3, 'Dorms'), term('category', 9, 'Podcast')],
  });
  s = reducer(s, { type: 'TERMS_LOAD_COMPLETE', requestId: 'r', excludedTermKeys: ['category:9'] });
  s = reducer(s, { type: 'ASSIGN_TERM', termKey: 'category:1', destination: 'athletics' });
  s = reducer(s, { type: 'ASSIGN_TERM', termKey: 'post_tag:2', destination: 'athletics' });
  s = reducer(s, { type: 'ASSIGN_TERM', termKey: 'post_tag:3', destination: 'campus-life' });
  s = reducer(s, { type: 'ARTICLE_START', postId: 7, requestId: 'a' });
  s = reducer(s, { type: 'ARTICLE_SUCCESS', postId: 7, requestId: 'a', post });
  s = reducer(s, { type: 'NAVIGATE', view: 'article', postId: 7 });
  return s;
}

describe('ArticleView term controls', () => {
  it('shows assignments and temporary filter selection without warning UI', () => {
    current = buildState();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<StoreProvider initialState={current}><ArticleView /></StoreProvider>, host));
    expect(host.querySelector('.ltb-article-destinations')?.textContent).toBe('Categories: Athletics and Campus Life');
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.ltb-article-sidebar .ltb-term')];
    const byName = Object.fromEntries(buttons.map(b => [b.querySelector('.ltb-term-label')!.textContent, b]));
    const tip = (b: HTMLButtonElement) => document.getElementById(b.getAttribute('aria-describedby')!)!.textContent;
    expect(tip(byName.Athletics!)).toContain('Assigned to Athletics');
    expect(tip(byName.Dorms!)).toContain('Assigned to Campus Life');
    expect(tip(byName.Podcast!)).toContain('Excluded term');
    expect(byName.Podcast!.disabled).toBe(true);
    expect(host.querySelectorAll('.is-warning, [aria-label="Overlap warning"], .ltb-render-notice')).toHaveLength(0);
    expect(host.querySelector('.ltb-sidebar-hint')?.textContent).toContain('OR: match any selected terms');
    act(() => byName.Rugby!.click());
    expect(byName.Rugby!.classList.contains('is-selected')).toBe(true);
    expect(tip(byName.Rugby!)).toContain('Selected in Filter 1');
    act(() => { byName.Rugby!.dispatchEvent(new FocusEvent('focus')); });
    expect((document.getElementById(byName.Rugby!.getAttribute('aria-describedby')!) as HTMLElement).hidden).toBe(false);
    act(() => render(null, host));
    host.remove();
  });
});
