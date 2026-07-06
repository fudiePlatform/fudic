import { describe, it, expect } from 'vitest';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString } from '../src/serialize.js';

describe('renderToString — elements and escaping', () => {
  it('serializes the canonical mixed tree (SDD-14 §6.3)', () => {
    const d = new SsrDom();
    const div = d.element('div');
    d.append(div, d.text('a<b'));
    d.append(div, d.element('img'));
    const style = d.element('style');
    d.append(style, d.text('.x{}'));
    d.append(div, style);
    expect(renderToString(div)).toBe('<div>a&lt;b<img><style>.x{}</style></div>');
  });

  it('escapes text for text context (& < >)', () => {
    const d = new SsrDom();
    expect(renderToString(d.text('1 & 2 < 3 > 4'))).toBe('1 &amp; 2 &lt; 3 &gt; 4');
  });

  it('escapes attribute values for attribute context (& ")', () => {
    const d = new SsrDom();
    const a = d.element('a');
    d.setAttr(a, 'href', '?x=1&y="2"');
    expect(renderToString(a)).toBe('<a href="?x=1&amp;y=&quot;2&quot;"></a>');
  });

  it('keeps attribute insertion order and overwrites in place', () => {
    const d = new SsrDom();
    const el = d.element('div');
    d.setAttr(el, 'id', 'a');
    d.setAttr(el, 'class', 'x');
    d.setAttr(el, 'id', 'b'); // overwrite, no reorder
    expect(renderToString(el)).toBe('<div id="b" class="x"></div>');
  });
});

describe('renderToString — void and rawtext', () => {
  it('void elements self-close with no closing tag', () => {
    const d = new SsrDom();
    const p = d.element('p');
    d.append(p, d.element('br'));
    expect(renderToString(p)).toBe('<p><br></p>');
  });

  it('rawtext elements do not escape their content', () => {
    const d = new SsrDom();
    const script = d.element('script');
    d.append(script, d.text('if (a < b && c) {}'));
    expect(renderToString(script)).toBe('<script>if (a < b && c) {}</script>');
  });

  it('rawtext falls back to normal serialization for non-text children', () => {
    const d = new SsrDom();
    const style = d.element('style');
    d.append(style, d.comment('c'));
    expect(renderToString(style)).toBe('<style><!--c--></style>');
  });
});

describe('renderToString — comments and shadow', () => {
  it('serializes comments and neutralizes an inner -->', () => {
    const d = new SsrDom();
    expect(renderToString(d.comment('fud:if'))).toBe('<!--fud:if-->');
    expect(renderToString(d.comment('a-->b'))).toBe('<!--a--&gt;b-->');
  });

  it('serializes a shadow root as a DSD template, first inside the host', () => {
    const d = new SsrDom();
    const host = d.element('app-x');
    const root = d.attachShadow(host);
    d.append(root, d.text('hi'));
    d.append(host, d.text('light')); // light-DOM child comes after the template
    expect(renderToString(host)).toBe(
      '<app-x><template shadowrootmode="open">hi</template>light</app-x>',
    );
  });

  it('serializes a fragment (shadow root) as its children', () => {
    const d = new SsrDom();
    const root = d.attachShadow(d.element('x'));
    d.append(root, d.element('span'));
    expect(renderToString(root)).toBe('<span></span>');
  });

  it('serializes a non-HTML namespace element with the same tag syntax', () => {
    const d = new SsrDom();
    expect(renderToString(d.element('circle', 'svg'))).toBe('<circle></circle>');
  });
});
