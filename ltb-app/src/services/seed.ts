import { normalizeSourceUrl } from './normalize';

/**
 * Configuration embedded in the mount element (the shortcode's inner content).
 * WordPress may run the text through wpautop/wptexturize before we see it, so
 * tags, entities and typographic quotes are normalized before JSON parsing.
 */
export function readSeedText(el: HTMLElement): string | null {
  const script = el.querySelector<HTMLScriptElement>('script[type="application/json"][data-ltb-seed]');
  const raw = script?.textContent ?? el.dataset.ltbSeed ?? null;
  if (raw === null) return null;
  const text = cleanSeedText(raw);
  return text ? text : null;
}

export function cleanSeedText(raw: string): string {
  let text = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?p[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
  if (/&[a-z#0-9]+;/i.test(text)) {
    const ta = document.createElement('textarea');
    ta.innerHTML = text;
    text = ta.value;
  }
  return text
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/\u00A0/g, ' ')
    .trim();
}

export function seedHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function seedStorageKey(sourceUrl: string): string {
  return `ltb:seed:${normalizeSourceUrl(sourceUrl)}`;
}

/** True when this seed text has not been applied yet for this source in this browser. */
export function seedIsNew(sourceUrl: string, text: string): boolean {
  try {
    return window.localStorage.getItem(seedStorageKey(sourceUrl)) !== seedHash(text);
  } catch {
    return true;
  }
}

export function markSeedApplied(sourceUrl: string, text: string): void {
  try {
    window.localStorage.setItem(seedStorageKey(sourceUrl), seedHash(text));
  } catch {
    /* storage unavailable; the seed will simply be re-applied next load */
  }
}
