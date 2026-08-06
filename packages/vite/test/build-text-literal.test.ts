/**
 * BUG-14 §6.3, end to end: the two lines of `examples/basic/routes/about.fud` that document
 * the framework's own syntax, taken through a REAL `vite build` and read back off the
 * prerendered `about/index.html`.
 *
 * It lives here and not in the compiler because the criterion is about the FILE the build
 * writes: emit, bundle, run the render chunk, serialize. A document cannot document the
 * syntax it is written in until every one of those steps leaves the author's text alone.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';

/** The two cases verbatim from the example — `@@` in content, and entities in content. */
const PAGE = `<!DOCTYPE html>
<html>
<head><title>Acerca de</title></head>
<body>
<ul>
  <li><code>/blog</code> — <code>@@server load</code> ⇒ lo pinta el Service Worker.</li>
</ul>
<p>Ninguna de las cuatro escribe <code>&lt;html&gt;</code>.</p>
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly source?: string;
}

let html: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-literal-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'routes', 'about.fud'), PAGE);
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  const file = result.output.find((o) => o.type === 'asset' && o.fileName === 'about/index.html');
  html = file!.source as string;
}, 180000);

describe('the prerendered about page keeps the author’s literal text (§6.3)', () => {
  it('`@@server` reaches the reader as `@server`', () => {
    expect(html).toContain('<code>@server load</code>');
  });

  it('`&lt;html&gt;` reaches the reader as `<html>`, escaped exactly once', () => {
    expect(html).toContain('<code>&lt;html&gt;</code>');
    expect(html).not.toContain('&amp;lt;');
  });
});
