/**
 * A component does NOT have to live next to the page that links it. The compiler is
 * filesystem-free and emits the sibling default (`./app-card.fud`); the plugin injects
 * the real specifier relative to the importing module (`componentSpecifier`), so a
 * shared `components/` directory outside `routesDir` resolves — from any route depth.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';


const BADGE = `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}

<head>
  <style>
    .badge { border: 1px solid #ccc; }
  </style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span class="badge" class:success="@(tone === 'success')"><slot></slot></span>
  </template>
</app-badge>
`;

const page = (depth: string): string => `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="${depth}components/app-badge.fud">
    <title>Deep</title>
  </head>
  <body>
    <app-badge tone="success">ok</app-badge>
  </body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly source?: string;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-components-'));
  mkdirSync(join(root, 'components'), { recursive: true });
  mkdirSync(join(root, 'routes', 'blog'), { recursive: true });
  writeFileSync(join(root, 'components', 'app-badge.fud'), BADGE);
  writeFileSync(join(root, 'routes', 'index.fud'), page('../'));
  writeFileSync(join(root, 'routes', 'blog', 'index.fud'), page('../../'));

  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: { write: false, minify: false },
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

describe('a component outside routesDir', () => {
  it('resolves from a route at the root and from a nested one', () => {
    const html = output.filter((o) => o.fileName.endsWith('index.html'));
    expect(html.map((o) => o.fileName).sort()).toEqual(['blog/index.html', 'index.html']);
    for (const file of html) {
      // The component rendered: its shadow root, its class binding and its slotted text.
      expect(file.source).toContain('<template shadowrootmode="open"');
      expect(file.source).toContain('class="badge success"');
      expect(file.source).toContain('ok');
    }
  });

  it('hoists the shared component stylesheet into each page head', () => {
    for (const file of output.filter((o) => o.fileName.endsWith('index.html'))) {
      expect(file.source).toContain('<style type="module" specifier="app-badge">');
      // Compacted: the emit builds the sheet from the AST, not from a slice of the
      // source (BUG-08). What this test is about is that the sheet is HOISTED here.
      expect(file.source).toContain('.badge{border:1px solid #ccc;}');
    }
  });
});
