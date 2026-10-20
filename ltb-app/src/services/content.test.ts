import { describe, expect, it } from 'vitest';
import { prepareContent } from './content';

const src = 'https://living.life.edu';

describe('prepareContent', () => {
  it('strips scripts and inline handlers, keeps structure', () => {
    const r = prepareContent('<h2>Hi</h2><p onclick="x()">a<script>alert(1)</script></p><ul><li>b</li></ul>', src, null);
    expect(r.html).not.toMatch(/script|onclick/);
    expect(r.html).toContain('<h2>Hi</h2>');
    expect(r.html).toContain('<li>b</li>');
  });

  it('resolves relative links and media against the source', () => {
    const r = prepareContent('<a href="/news/x/">x</a><img src="/wp-content/a.jpg" srcset="/a-300.jpg 300w, /a-600.jpg 600w">', src, null);
    expect(r.html).toContain('href="https://living.life.edu/news/x/"');
    expect(r.html).toContain('src="https://living.life.edu/wp-content/a.jpg"');
    expect(r.html).toContain('https://living.life.edu/a-600.jpg 600w');
  });

  it('detects legacy WPBakery shortcodes', () => {
    const r = prepareContent('<p>[vc_row][vc_column width=&#8221;1/3&#8243;]text[/vc_column][/vc_row]</p>', src, null);
    expect(r.shortcodes).toEqual(['vc_column', 'vc_row']);
  });

  it('keeps youtube iframes and drops unknown ones', () => {
    const r = prepareContent('<iframe src="https://www.youtube.com/embed/abc"></iframe><iframe src="https://evil.test/x"></iframe>', src, null);
    expect(r.html).toContain('youtube.com/embed/abc');
    expect(r.html).not.toContain('evil.test');
    expect(r.removedEmbeds).toBe(1);
  });

  it('recognises a duplicated featured image and empty bodies', () => {
    const img = 'https://living.life.edu/wp-content/uploads/2026/10/hero-scaled.jpeg';
    expect(prepareContent('<img src="https://living.life.edu/wp-content/uploads/2026/10/hero-1024x683.jpeg">', src, img).containsFeaturedImage).toBe(true);
    expect(prepareContent('<p>  </p>', src, null).isEmpty).toBe(true);
  });
});
