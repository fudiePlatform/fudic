import { describe, expect, it } from 'vitest';
import { styles } from '../src/index.js';

function headStyle(tag: string, css: string): void {
  const el = document.createElement('style');
  el.setAttribute('host', tag);
  el.textContent = css;
  document.head.append(el);
}

function shadow(): ShadowRoot {
  const host = document.createElement('div');
  document.body.append(host);
  return host.attachShadow({ mode: 'open' });
}

describe('styles (SDD-14 §6.10)', () => {
  it('adopts the same CSSStyleSheet reference into every root', () => {
    headStyle('app-c', '.card{color:red}');
    const a = shadow();
    const b = shadow();
    styles.adopt(a, 'app-c');
    styles.adopt(b, 'app-c');
    expect(a.adoptedStyleSheets).toHaveLength(1);
    expect(b.adoptedStyleSheets).toHaveLength(1);
    expect(a.adoptedStyleSheets[0]).toBe(b.adoptedStyleSheets[0]);
  });

  it('repeated adopt on the same root does not duplicate the sheet', () => {
    headStyle('app-rep', ':host{display:block}');
    const root = shadow();
    styles.adopt(root, 'app-rep');
    styles.adopt(root, 'app-rep');
    expect(root.adoptedStyleSheets).toHaveLength(1);
  });

  it('is a no-op without a head style for the tag', () => {
    const root = shadow();
    styles.adopt(root, 'app-absent');
    expect(root.adoptedStyleSheets).toHaveLength(0);
  });

  it('a head style added later is picked up (missing tags are not cached)', () => {
    const root = shadow();
    styles.adopt(root, 'app-late');
    expect(root.adoptedStyleSheets).toHaveLength(0);
    headStyle('app-late', '.x{}');
    styles.adopt(root, 'app-late');
    expect(root.adoptedStyleSheets).toHaveLength(1);
  });

  it('rejects a malformed tag (guards the selector pass)', () => {
    const root = shadow();
    styles.adopt(root, 'not a tag"]');
    styles.adopt(root, 'nohyphen');
    expect(root.adoptedStyleSheets).toHaveLength(0);
  });
});
