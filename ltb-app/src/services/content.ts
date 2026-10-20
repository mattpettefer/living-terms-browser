import DOMPurify from 'dompurify';

export interface RenderedContent {
  html: string;
  /** Unresolved builder/theme shortcodes found in the body, e.g. `vc_row`. */
  shortcodes: string[];
  /** Embeds that were removed because their host is not allowed. */
  removedEmbeds: number;
  /** True when the body already contains the featured image. */
  containsFeaturedImage: boolean;
  isEmpty: boolean;
}

const ALLOWED_IFRAME_HOSTS = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'open.spotify.com'];
const SHORTCODE_RE = /\[\/?([a-zA-Z][\w-]*)(?:\s[^\]]*)?\]/g;

function resolveUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function imageBasename(url: string): string {
  return url
    .split('/')
    .pop()!
    .split('?')[0]!
    .replace(/-\d+x\d+(?=\.\w+$)/, '')
    .replace(/-scaled(?=\.\w+$)/, '');
}

/**
 * Sanitize API-rendered post content for display. Scripts are stripped,
 * relative URLs resolved against the source, iframes limited to known video
 * hosts, and legacy shortcodes detected so the UI can show an honest notice.
 */
export function prepareContent(rawHtml: string, sourceUrl: string, featuredImageUrl: string | null): RenderedContent {
  const shortcodes = new Set<string>();
  for (const m of rawHtml.matchAll(SHORTCODE_RE)) {
    const name = m[1]!;
    if (/^(vc_|et_pb_|fusion_|av_|wpb|kc_|elementor|gallery|caption|embed|audio|video|playlist)/i.test(name)) shortcodes.add(name);
  }

  let removedEmbeds = 0;
  DOMPurify.removeAllHooks();
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe') {
      const src = (node as Element).getAttribute('src') ?? '';
      let ok = false;
      try {
        ok = ALLOWED_IFRAME_HOSTS.includes(new URL(src, sourceUrl).hostname);
      } catch {
        ok = false;
      }
      if (!ok) {
        removedEmbeds += 1;
        node.parentNode?.removeChild(node);
      }
    }
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    for (const attr of ['href', 'src', 'poster']) {
      const v = el.getAttribute(attr);
      if (v && !/^(https?:|mailto:|tel:|#|data:image\/)/i.test(v)) el.setAttribute(attr, resolveUrl(v, sourceUrl));
    }
    const srcset = el.getAttribute('srcset');
    if (srcset) {
      el.setAttribute(
        'srcset',
        srcset
          .split(',')
          .map((part) => {
            const [u, d] = part.trim().split(/\s+/);
            return `${resolveUrl(u ?? '', sourceUrl)}${d ? ` ${d}` : ''}`;
          })
          .join(', '),
      );
    }
    if (el.tagName === 'A' && el.getAttribute('href')?.startsWith('http')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (el.tagName === 'IMG') el.setAttribute('loading', 'lazy');
    if (el.tagName === 'IFRAME') {
      el.setAttribute('loading', 'lazy');
      el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    }
  });

  const html = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe', 'figure', 'figcaption', 'video', 'audio', 'source'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'controls', 'poster', 'preload', 'loading', 'sandbox', 'target'],
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
    FORBID_ATTR: ['style', 'onerror', 'onload'],
  }) as string;
  DOMPurify.removeAllHooks();

  const featuredBase = featuredImageUrl ? imageBasename(featuredImageUrl) : null;
  const containsFeaturedImage =
    !!featuredBase && [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].some((m) => imageBasename(m[1]!) === featuredBase);
  const isEmpty = html.replace(/<[^>]*>/g, '').trim().length === 0 && !/<(img|iframe|video|audio)/i.test(html);
  return { html, shortcodes: [...shortcodes].sort(), removedEmbeds, containsFeaturedImage, isEmpty };
}
