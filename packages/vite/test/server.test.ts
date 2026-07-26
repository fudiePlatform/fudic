/**
 * SDD-19 §4.3: the `?server` module — the page's `@server` region, which is where
 * `load`/`paths` live; empty for a page without `@code` or for a component.
 */

import { describe, it, expect } from 'vitest';
import { emitServerModule } from '../src/server.js';

const page = (code = ''): string =>
  `<!DOCTYPE html>\n<html>\n<head>\n${code}\n</head>\n<body></body>\n</html>\n`;

describe('emitServerModule', () => {
  it('emits the @server region code for a page that exports load', () => {
    const src = page('@code {\n@server {\nexport function load(ctx) { return { id: ctx.params.id }; }\n}\n}');
    const mod = emitServerModule(src);
    expect(mod).toContain('export function load(ctx)');
  });

  it('emits an empty module for a page without @code', () => {
    expect(emitServerModule(page())).toBe('export {};\n');
  });

  it('emits an empty module for a component', () => {
    const component = '<app-x>\n  <template shadowrootmode="open"><span></span></template>\n</app-x>\n';
    expect(emitServerModule(component)).toBe('export {};\n');
  });
});
