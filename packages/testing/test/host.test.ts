import { readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { cached } from '../src/cache.js';
import { hostPage } from '../src/host.js';

describe('hostPage', () => {
  test('a standalone page that links what it instantiates', () => {
    expect(hostPage({ links: [{ rel: 'component', href: 'C:\\p\\x-a.fud' }], body: '<x-a></x-a>' })).toBe(
      '<!DOCTYPE html>\n<html>\n<head>\n<link rel="component" href="C:/p/x-a.fud">\n</head>\n<body>\n<x-a></x-a>\n</body>\n</html>\n',
    );
  });

  test('declares what its @code is handed', () => {
    const page = hostPage({ links: [{ rel: 'snippet', href: '/p/ui.fud' }], code: '  const item = 1;', body: '@render f(item)' });
    expect(page).toContain('<link rel="snippet" href="/p/ui.fud">\n@code {\n  const item = 1;\n}\n</head>');
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
