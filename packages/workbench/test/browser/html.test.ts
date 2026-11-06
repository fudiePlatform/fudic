/**
 * `htmlOf`: a piece painted in Chrome back to markup, as `@fudic/testing` writes it under
 * happy-dom — each shadow root as the declarative one it came from, its adopted sheets inline,
 * no script, no comment, and none of the bench's own `data-fud-src`.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { htmlOf } from '../../src/html.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
});

afterEach(async () => {
  await page.close();
});

describe('htmlOf', () => {
  it('a declarative shadow root: written back as one, with its mode', async () => {
    await page.setContent('<acme-button><template shadowrootmode="open"><button disabled>Save</button></template></acme-button>');
    expect(await htmlOf(page, 'acme-button')).toBe('<acme-button><template shadowrootmode="open"><button disabled="">Save</button></template></acme-button>');
  });

  it('adopted sheets inline in the shadow root, before its children; a style keeps its text unescaped', async () => {
    await page.setContent('<x-card><p>light</p></x-card>');
    // Plain JS, evaluated in the page: this package has no DOM types.
    await page.evaluate(`(() => {
      const shadow = document.querySelector('x-card').attachShadow({ mode: 'open' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('p { color: red; } a > b { margin: 0; }');
      shadow.adoptedStyleSheets = [sheet];
      shadow.innerHTML = '<style>i > b { x: "<" }</style><slot></slot>';
    })()`);
    expect(await htmlOf(page, 'x-card')).toBe(
      '<x-card><template shadowrootmode="open"><style>p { color: red; }\na > b { margin: 0px; }</style><style>i > b { x: "<" }</style><slot></slot></template><p>light</p></x-card>',
    );
  });

  it('no script, no comment, no data-fud-src; text and attributes escaped; void elements unclosed', async () => {
    await page.setContent(
      '<div id="root" data-fud-src="/x.fud:1" title="a &quot;b&quot; &amp; c"><!-- note --><script>1</script>1 &lt; 2 &amp;&amp; 3 &gt; 2<br><img alt="x"></div>',
    );
    expect(await htmlOf(page, '#root')).toBe('<div id="root" title="a &quot;b&quot; &amp; c">1 &lt; 2 &amp;&amp; 3 &gt; 2<br><img alt="x"></div>');
  });

  it('a template that is no shadow root: its content, as markup', async () => {
    await page.setContent('<section id="s"><template><b>later</b></template></section>');
    expect(await htmlOf(page, '#s')).toBe('<section id="s"><template><b>later</b></template></section>');
  });

  it('the first match when more than one does; through shadow roots, as Playwright selects', async () => {
    await page.setContent('<p>a</p><p>b</p><x-host><template shadowrootmode="open"><em>deep</em></template></x-host>');
    expect(await htmlOf(page, 'p')).toBe('<p>a</p>');
    expect(await htmlOf(page, 'x-host >> em')).toBe('<em>deep</em>');
  });

  it('never throws: a selector that matches nothing in time is the first line of the error', async () => {
    page.setDefaultTimeout(200);
    await page.setContent('<p>x</p>');
    expect(await htmlOf(page, 'nothing-here')).toMatch(/^error: .*Timeout 200ms exceeded/u);
  });
});
