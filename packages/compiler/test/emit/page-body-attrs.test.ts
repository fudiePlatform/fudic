/**
 * The `<body>` of a document keeps its attributes: a static one, and one written `@expr` (found
 * while testing SDD-87). Since SDD-88 the document is always a layout's — a page links one — so
 * these are the attributes of the layout's `<body>`, with the route painted inside it.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/index.js';
import { LINK_LAYOUT, memoryIo, renderPageHtml, withLayout } from './_support.js';

const layout = (body: string, code = ''): string =>
  `<!DOCTYPE html>\n<html lang="es">\n<head>\n${code}@RenderHead()\n</head>\n<body ${body}>@RenderBody()</body>\n</html>\n`;

const ROUTE = `${LINK_LAYOUT}<head><title>t</title></head>\n<p>x</p>\n`;

const render = (source: string, data: unknown = {}): Promise<string> =>
  renderPageHtml(resolveDocument('/home.fud', memoryIo(withLayout({ '/home.fud': ROUTE }, source))).value, data);

describe('the <body> of the layout a page links', () => {
  it('keeps a static attribute', async () => {
    expect(await render(layout('data-error-page="ui" class="c"'))).toMatch(/<body[^>]* data-error-page="ui" class="c"[^>]*>/u);
  });

  // A layout's `@code` declares props and nothing else (`FUD0700`): the value is a prop's default.
  it('writes an @expr attribute with its value, escaped', async () => {
    const code = '@code {\n  const { theme = "a\\"b&c" } = props<{ theme?: string }>();\n}\n';
    const html = await render(layout('data-theme=@theme', code));
    expect(html).toMatch(/<body[^>]* data-theme="a&quot;b&amp;c"[^>]*>/u);
  });

  it('omits an @expr attribute whose value is nullish', async () => {
    const code = '@code {\n  const { theme } = props<{ theme?: string }>();\n}\n';
    expect(await render(layout('data-theme=@theme', code))).not.toContain('data-theme');
  });

  it('with none, a bare <body> as before', async () => {
    expect(await render(layout(''))).toMatch(/<body( data-fud-id="\d+")?>/u);
  });
});
