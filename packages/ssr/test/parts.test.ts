import { describe, it, expect } from 'vitest';
import { trustedHtml } from '@fudic/dom';
import { SsrDom } from '../src/ssr-dom.js';
import { type SsrNode } from '../src/tree.js';
import { renderToString } from '../src/serialize.js';
import { partSerializer } from '../src/parts.js';

/**
 * Part by part (SDD-70 §3.6, Task 15): while a tree grows only at its insertion point, the
 * parts and the end, joined, are `renderToString` of the finished tree, byte for byte.
 */
function parts(root: SsrNode): { cut: () => string; finish: () => string; sent: () => string } {
  const s = partSerializer(root);
  let out = '';
  const cut = (): string => {
    const piece = [...s.part()].join('');
    out += piece;
    return piece;
  };
  return {
    cut,
    finish: () => {
      out += [...s.end()].join('');
      return out;
    },
    sent: () => out,
  };
}

describe('partSerializer — cuts at any depth (SDD-70 §3.6)', () => {
  it('cuts inside a <table>/<tbody>: the open path goes out, its closing tags wait', () => {
    const d = new SsrDom();
    const table = d.element('table');
    const tbody = d.element('tbody');
    d.append(table, tbody);
    const tr = d.element('tr');
    d.append(tbody, tr);
    const td = d.element('td');
    d.append(tr, td);
    d.append(td, d.text('1'));
    const p = parts(table);
    expect(p.cut()).toBe('<table><tbody><tr><td>1');
    const tr2 = d.element('tr');
    d.append(tbody, tr2);
    d.append(tr2, d.text('2'));
    // Appending to an ancestor closes the inner ones.
    expect(p.cut()).toBe('</td></tr><tr>2');
    expect(p.finish()).toBe(renderToString(table));
    expect(p.sent()).toBe('<table><tbody><tr><td>1</td></tr><tr>2</tr></tbody></table>');
  });

  it('cuts inside a <ul>, between items', () => {
    const d = new SsrDom();
    const ul = d.element('ul');
    const p = parts(ul);
    expect(p.cut()).toBe('<ul>');
    for (const label of ['a', 'b', 'c']) {
      const li = d.element('li');
      d.append(ul, li);
      d.append(li, d.text(label));
      p.cut();
    }
    expect(p.sent()).toBe('<ul><li>a</li><li>b</li><li>c');
    expect(p.finish()).toBe(renderToString(ul));
  });

  it('cuts inside the LIGHT children of a DSD host: the shadow root goes out whole, first', () => {
    const d = new SsrDom();
    const body = d.element('body');
    const host = d.element('app-x');
    d.setAttr(host, 'data-fud-adopt', 'app-x');
    const shadow = d.attachShadow(host);
    const b = d.element('b');
    d.append(shadow, b);
    d.append(b, d.text('in'));
    d.append(shadow, d.element('slot'));
    d.append(body, host);
    const span = d.element('span');
    d.append(host, span);
    d.append(span, d.text('light 1'));
    const p = parts(body);
    expect(p.cut()).toBe(
      '<body><app-x data-fud-adopt="app-x"><template shadowrootmode="open" ' +
        'shadowrootadoptedstylesheets="app-x"><b>in</b><slot></slot></template><span>light 1',
    );
    d.append(host, d.text('light 2'));
    expect(p.cut()).toBe('</span>light 2');
    d.append(body, d.element('footer'));
    expect(p.cut()).toBe('</app-x><footer>');
    expect(p.finish()).toBe(renderToString(body));
  });

  it('nested several levels, then an append to the root closes them all', () => {
    const d = new SsrDom();
    const root = d.element('main');
    let at = root;
    for (const tag of ['section', 'article', 'div', 'p', 'em']) {
      const el = d.element(tag);
      d.append(at, el);
      at = el;
    }
    d.append(at, d.text('deep'));
    const p = parts(root);
    expect(p.cut()).toBe('<main><section><article><div><p><em>deep');
    d.append(root, d.element('aside'));
    expect(p.cut()).toBe('</em></p></div></article></section><aside>');
    expect(p.finish()).toBe(renderToString(root));
  });

  it('void elements: written once, never closed, even as the last child', () => {
    const d = new SsrDom();
    const div = d.element('div');
    d.append(div, d.element('img'));
    const p = parts(div);
    expect(p.cut()).toBe('<div><img>');
    d.append(div, d.element('br'));
    expect(p.cut()).toBe('<br>');
    d.append(div, d.element('hr'));
    expect(p.finish()).toBe(renderToString(div));
    expect(p.sent()).toBe('<div><img><br><hr></div>');
  });

  it('rawtext: a JSON <script> keeps its text unescaped, cut inside it', () => {
    const d = new SsrDom();
    const body = d.element('body');
    const script = d.element('script');
    d.setAttr(script, 'type', 'application/json');
    d.append(body, script);
    d.append(script, d.text('{"a":"<b>&"'));
    const p = parts(body);
    expect(p.cut()).toBe('<body><script type="application/json">{"a":"<b>&"');
    d.append(script, d.text(',"c":1}'));
    d.append(script, d.comment('x'));
    p.cut();
    d.append(body, d.text('<after>'));
    expect(p.finish()).toBe(renderToString(body));
    expect(p.sent()).toBe(
      '<body><script type="application/json">{"a":"<b>&","c":1}<!--x--></script>&lt;after&gt;</body>',
    );
  });

  it('rawtext: a <style> cut inside it', () => {
    const d = new SsrDom();
    const head = d.element('head');
    const style = d.element('STYLE');
    d.append(head, style);
    d.append(style, d.text('a > b {}'));
    const p = parts(head);
    p.cut();
    d.append(style, d.text('c > d {}'));
    p.cut();
    d.append(head, d.element('meta'));
    expect(p.finish()).toBe(renderToString(head));
    expect(p.sent()).toBe('<head><STYLE>a > b {}c > d {}</STYLE><meta></head>');
  });

  it('comments neutralize an inner -->, html leaves go out verbatim, text is escaped', () => {
    const d = new SsrDom();
    const div = d.element('div');
    d.append(div, d.comment('a-->b'));
    const p = parts(div);
    expect(p.cut()).toBe('<div><!--a--&gt;b-->');
    // `setHtml` replaces children, so it only appends on an empty insertion point.
    const article = d.element('article');
    d.append(div, article);
    expect(p.cut()).toBe('<article>');
    d.setHtml(article, trustedHtml('<h3>T</h3>'));
    expect(p.cut()).toBe('<h3>T</h3>');
    const aside = d.element('aside');
    d.setHtml(aside, '<b>not trusted</b>');
    d.append(div, aside);
    d.append(div, d.text('1 & 2 < 3'));
    expect(p.cut()).toBe('</article><aside>&lt;b&gt;not trusted&lt;/b&gt;</aside>1 &amp; 2 &lt; 3');
    expect(p.finish()).toBe(renderToString(div));
  });

  it('a cut right after an element whose subtree is complete', () => {
    const d = new SsrDom();
    const div = d.element('div');
    const p1 = d.element('p');
    d.append(div, p1);
    d.append(p1, d.text('done'));
    const p = parts(div);
    expect(p.cut()).toBe('<div><p>done');
    d.append(div, d.text('next'));
    expect(p.cut()).toBe('</p>next');
    expect(p.finish()).toBe(renderToString(div));
  });

  it('consecutive cuts with nothing appended in between yield nothing new', () => {
    const d = new SsrDom();
    const ul = d.element('ul');
    const li = d.element('li');
    d.append(ul, li);
    d.append(li, d.text('x'));
    const s = partSerializer(ul);
    expect([...s.part()].join('')).toBe('<ul><li>x');
    expect([...s.part()]).toEqual([]);
    expect([...s.part()]).toEqual([]);
    expect([...s.end()].join('')).toBe('</li></ul>');
  });

  it('end() with no part() before it is renderToString', () => {
    const d = new SsrDom();
    const div = d.element('div');
    d.append(div, d.text('a<b'));
    d.append(div, d.element('img'));
    expect([...partSerializer(div).end()].join('')).toBe(renderToString(div));
  });

  it('a fragment root: no tags of its own, its children cut like any other', () => {
    const d = new SsrDom();
    const frag = d.attachShadow(d.element('x-y'));
    const p = parts(frag);
    expect(p.cut()).toBe('');
    const div = d.element('div');
    d.append(frag, div);
    d.append(div, d.text('a'));
    expect(p.cut()).toBe('<div>a');
    d.append(frag, d.text('b'));
    expect(p.cut()).toBe('</div>b');
    expect(p.finish()).toBe(renderToString(frag));
    expect(p.sent()).toBe('<div>a</div>b');
  });

  it('a leaf root comes out once', () => {
    const d = new SsrDom();
    const t = d.text('<t>');
    const p = parts(t);
    expect(p.cut()).toBe('&lt;t&gt;');
    expect(p.cut()).toBe('');
    expect(p.finish()).toBe(renderToString(t));
  });
});

/** mulberry32: a seeded PRNG, so a failing sequence can be replayed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('partSerializer — random appends and cuts (SDD-70 §3.6)', () => {
  const CONTAINERS = ['div', 'ul', 'li', 'table', 'tbody', 'tr', 'td', 'p', 'script', 'style', 'app-x'];
  const VOIDS = ['br', 'img', 'input'];
  const TEXTS = ['a', '<b>', 'x & y', '"q"', '{"k":"<v>"}', ''];

  for (const seed of [1, 7, 42, 1337, 2026, 31337, 99991, 123456]) {
    it(`seed ${seed}: parts + end == renderToString`, () => {
      const rnd = prng(seed);
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
      const d = new SsrDom();
      const root = rnd() < 0.3 ? d.attachShadow(d.element('page-root')) : d.element('body');
      // The rightmost path: the insertion point is its last node, appends go to any of them.
      const path: SsrNode[] = [root];
      // `setHtml` replaces children: it is an append only on a container still empty.
      const empty = new Set<SsrNode>([root]);
      const p = parts(root);
      const html = (): unknown => (rnd() < 0.5 ? trustedHtml('<i>h</i>') : '<i>h</i>');

      const leaf = (): SsrNode => {
        const r = rnd();
        if (r < 0.45) return d.text(pick(TEXTS));
        if (r < 0.6) return d.comment(pick(['c', 'a-->b', '--']));
        return d.element(pick(VOIDS));
      };
      const container = (): SsrNode => {
        const tag = pick(CONTAINERS);
        const el = d.element(tag);
        if (rnd() < 0.5) d.setAttr(el, 'data-k', pick(TEXTS));
        if (tag === 'app-x') {
          // The shadow root is complete before the host joins the tree.
          const shadow = d.attachShadow(el);
          d.append(shadow, d.text(pick(TEXTS)));
          d.append(shadow, d.element('slot'));
        }
        return el;
      };

      for (let step = 0; step < 200; step++) {
        const r = rnd();
        if (r < 0.25) {
          p.cut();
          continue;
        }
        const k = Math.floor(rnd() * path.length);
        const parent = path[k]!;
        path.length = k + 1;
        if (r < 0.3 && empty.has(parent)) {
          d.setHtml(parent, html());
        } else if (r < 0.35) {
          const el = d.element('section');
          d.setHtml(el, html());
          d.append(parent, el);
          path.push(el);
        } else if (r < 0.6 && path.length < 12) {
          const el = container();
          d.append(parent, el);
          path.push(el);
          empty.add(el);
        } else {
          d.append(parent, leaf());
        }
        empty.delete(parent);
      }
      expect(p.finish()).toBe(renderToString(root));
    });
  }
});
