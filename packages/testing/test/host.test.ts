import { readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { cached } from '../src/cache.js';
import { HOST_LAYOUT_NAME, hostLayout, hostPage } from '../src/host.js';

describe('hostPage', () => {
  // SDD-88 §3.4, criterion 24: every page links a layout, the harness's own too.
  test('a route that links the host layout it is given, then what it instantiates', () => {
    expect(hostPage({ links: [{ rel: 'component', href: 'C:\\p\\x-a.fud' }], body: '<x-a></x-a>' }, '_host-layout-abc.fud')).toBe(
      '<link rel="layout" href="./_host-layout-abc.fud">\n<link rel="component" href="C:/p/x-a.fud">\n<x-a></x-a>\n',
    );
  });

  test('declares what its @code is handed, after its links (decision 83)', () => {
    const page = hostPage({ links: [{ rel: 'snippet', href: '/p/ui.fud' }], code: '  const item = 1;', body: '@render f(item)' }, 'l.fud');
    expect(page).toBe('<link rel="layout" href="./l.fud">\n<link rel="snippet" href="/p/ui.fud">\n@code {\n  const item = 1;\n}\n@render f(item)\n');
  });
});

describe('hostLayout', () => {
  test('the smallest document, in the project’s language: the runtime, the head and the body of the route', () => {
    expect(HOST_LAYOUT_NAME).toBe('_host-layout');
    const layout = hostLayout('es');
    expect(layout.startsWith('<!DOCTYPE html>\n<html lang="es">\n')).toBe(true);
    expect(layout).toContain('<meta charset="utf-8">');
    expect(layout).toContain('<script type="module" src="fudic:runtime"></script>');
    expect(layout).toContain('@RenderHead()');
    expect(layout).toContain('<body>\n@RenderBody()\n</body>');
  });

  test('one per language: a different language is a different file in the cache', () => {
    expect(cached(HOST_LAYOUT_NAME, 'fud', hostLayout('es'))).not.toBe(cached(HOST_LAYOUT_NAME, 'fud', hostLayout('en')));
  });
});

describe('cached', () => {
  test('writes a source once, under a name made of its content', () => {
    const source = `unique ${randomUUID()}`;
    const file = cached('probe', 'txt', source);
    expect(file).toMatch(/\/node_modules\/\.fudic-test\/probe-[0-9a-f]{16}\.txt$/u);
    expect(readFileSync(file, 'utf8')).toBe(source);
    const written = statSync(file).mtimeMs;
    expect(cached('probe', 'txt', source)).toBe(file);
    expect(statSync(file).mtimeMs).toBe(written);
  });
});
