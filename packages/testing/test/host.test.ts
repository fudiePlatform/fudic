import { readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { cached } from '../src/cache.js';
import { HOST_LAYOUT, HOST_LAYOUT_FILE, hostPage } from '../src/host.js';

describe('hostPage', () => {
  // SDD-88 §3.4, criterion 24: every page links a layout, the harness's own too.
  test('a route that links the host layout, then what it instantiates', () => {
    expect(hostPage({ links: [{ rel: 'component', href: 'C:\\p\\x-a.fud' }], body: '<x-a></x-a>' })).toBe(
      '<link rel="layout" href="./_host-layout.fud">\n<link rel="component" href="C:/p/x-a.fud">\n<x-a></x-a>\n',
    );
  });

  test('declares what its @code is handed, after its links (decision 83)', () => {
    const page = hostPage({ links: [{ rel: 'snippet', href: '/p/ui.fud' }], code: '  const item = 1;', body: '@render f(item)' });
    expect(page).toBe('<link rel="layout" href="./_host-layout.fud">\n<link rel="snippet" href="/p/ui.fud">\n@code {\n  const item = 1;\n}\n@render f(item)\n');
  });

  test('the host layout is the smallest document: the runtime, the head and the body of the route', () => {
    expect(HOST_LAYOUT_FILE).toBe('_host-layout.fud');
    expect(HOST_LAYOUT.startsWith('<!DOCTYPE html>\n<html')).toBe(true);
    expect(HOST_LAYOUT).toContain('<meta charset="utf-8">');
    expect(HOST_LAYOUT).toContain('<script type="module" src="fudic:runtime"></script>');
    expect(HOST_LAYOUT).toContain('@RenderHead()');
    expect(HOST_LAYOUT).toContain('<body>\n@RenderBody()\n</body>');
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
