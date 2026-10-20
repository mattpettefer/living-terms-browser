import { describe, expect, it } from 'vitest';
import { cleanSeedText, readSeedText, seedHash } from './seed';

describe('seed', () => {
  it('undoes wpautop/wptexturize mangling', () => {
    const mangled = '<p>{ &#8220;assignments&#8221;: {<br />\n&#8220;category:1&#8221;: &#8220;athletics&#8221; } }</p>';
    expect(JSON.parse(cleanSeedText(mangled))).toEqual({ assignments: { 'category:1': 'athletics' } });
  });

  it('reads a JSON script child or data attribute', () => {
    const el = document.createElement('div');
    el.innerHTML = '<script type="application/json" data-ltb-seed>{"assignments":{}}</script>';
    expect(readSeedText(el)).toBe('{"assignments":{}}');
    const el2 = document.createElement('div');
    el2.dataset.ltbSeed = ' {"a":1} ';
    expect(readSeedText(el2)).toBe('{"a":1}');
    expect(readSeedText(document.createElement('div'))).toBeNull();
  });

  it('hashes deterministically', () => {
    expect(seedHash('abc')).toBe(seedHash('abc'));
    expect(seedHash('abc')).not.toBe(seedHash('abd'));
  });
});
