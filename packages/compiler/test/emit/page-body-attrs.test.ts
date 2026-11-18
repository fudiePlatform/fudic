/**
 * A page without a layout owns its shell, and its `<body>` keeps its attributes, as a layout's
 * does: a static one, and one written `@expr` (found while testing SDD-87, whose error pages are
 * whole documents). Before, the body was built from its tag name alone.
 */

import { describe, expect, it } from 'vitest';
import { resolveComponents } from '../../src/emit/index.js';
import { memoryIo, renderPageHtml } from './_support.js';

const page = (body: string, code = ''): string =>
  `<!DOCTYPE html>\n<html lang="es">\n<head>\n<title>t</title>\n${code}</head>\n<body ${body}><p>x</p></body>\n</html>\n`;

const render = (source: string, data: unknown = {}): Promise<string> =>
  renderPageHtml(resolveComponents('/home.fud', memoryIo({ '/home.fud': source })), data);

describe('the <body> of a page without a layout', () => {
  it('keeps a static attribute', async () => {
    expect(await render(page('data-error-page="ui" class="c"'))).toMatch(/<body[^>]* data-error-page="ui" class="c"[^>]*>/u);
  });

  it('writes an @expr attribute with its value, escaped', async () => {
    const code = '@code {\n  const theme = "a\\"b&c";\n}\n';
    const html = await render(page('data-theme=@theme', code));
    expect(html).toMatch(/<body[^>]* data-theme="a&quot;b&amp;c"[^>]*>/u);
  });

  it('omits an @expr attribute whose value is nullish', async () => {
    const code = '@code {\n  const theme = undefined;\n}\n';
    expect(await render(page('data-theme=@theme', code))).not.toContain('data-theme');
  });

  it('with none, a bare <body> as before', async () => {
    expect(await render(page(''))).toMatch(/<body( data-fud-id="\d+")?>/u);
  });
});
