/**
 * The pieces a tool that shows something is asked about (SDD-77 §4.7): a component by its tag, a
 * route by a concrete URL, its fixture beside it, and the place in a source of what one threw.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Piece, ProjectService } from '@fudic/language-server/project';
import { componentOf, fixtureFile, matches, placeOfStack, routeOf } from '../src/piece.js';
import { tempDir } from './helpers.js';

const piece = (kind: Piece['kind'], name: string, file = `/p/${name}.fud`): Piece => ({
  kind,
  name,
  file,
  servers: [],
  documented: { doc: false, props: 0, documented: 0 },
});

const service = (pieces: readonly Piece[]): ProjectService => ({ pieces: () => pieces }) as unknown as ProjectService;

const PIECES = [
  piece('component', 'acme-button'),
  piece('component', 'acme-card'),
  piece('route', '/'),
  piece('route', '/productos'),
  piece('route', '/productos/:id'),
  piece('route', '/productos/nuevo'),
];

describe('componentOf', () => {
  it('the component of that tag', () => {
    expect(componentOf(service(PIECES), 'acme-card')).toEqual({ piece: PIECES[1] });
  });

  it('FUD1405 with the closest tag, or without one when nothing is near; a route is no component', () => {
    const near = componentOf(service(PIECES), 'acme-buton');
    expect(near).toEqual({ error: expect.objectContaining({ code: 'FUD1405', message: expect.stringContaining('did you mean acme-button?') }) });
    const far = componentOf(service(PIECES), 'zzzzzzzzzzzz');
    expect('error' in far && far.error.message).toBe('nothing in the project is called zzzzzzzzzzzz');
    expect('error' in componentOf(service(PIECES), '/productos')).toBe(true);
  });
});

describe('matches and routeOf', () => {
  it('a concrete URL matches the pattern of its route, query and slashes aside', () => {
    expect(matches('/productos/:id', '/productos/42')).toBe(true);
    expect(matches('/productos/:id', '/productos/42/?x=1')).toBe(true);
    expect(matches('/productos/:id', '/productos')).toBe(false);
    expect(matches('/productos/:id', '/clientes/42')).toBe(false);
    expect(matches('/', '/')).toBe(true);
  });

  it('the route whose pattern is the URL wins over one that only matches it', () => {
    const s = service(PIECES);
    expect(routeOf(s, '/productos/nuevo')).toBe(PIECES[5]);
    expect(routeOf(s, '/productos/42')).toBe(PIECES[4]);
    expect(routeOf(s, '/productos/:id')).toBe(PIECES[4]);
    expect(routeOf(s, '/')).toBe(PIECES[2]);
    expect(routeOf(s, '/nada/aqui')).toBeUndefined();
    // A component's tag is no route.
    expect(routeOf(s, 'acme-button')).toBeUndefined();
  });
});

describe('with files on disk', () => {
  let dir: ReturnType<typeof tempDir> | undefined;

  afterEach(() => {
    dir?.dispose();
    dir = undefined;
  });

  function write(files: Readonly<Record<string, string>>): string {
    dir = tempDir();
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir.root, path)), { recursive: true });
      writeFileSync(join(dir.root, path), text);
    }
    return dir.root;
  }

  it('fixtureFile: the .fixture.ts beside the .fud, when there is one', () => {
    const root = write({ 'a/acme-button.fud': '', 'a/acme-button.fixture.ts': '', 'a/acme-card.fud': '' });
    expect(fixtureFile(piece('component', 'acme-button', join(root, 'a/acme-button.fud')))).toBe(join(root, 'a/acme-button.fixture.ts'));
    expect(fixtureFile(piece('component', 'acme-card', join(root, 'a/acme-card.fud')))).toBeUndefined();
  });

  describe('placeOfStack', () => {
    const SOURCE = 'export function load() {\n  const x = 1;\n  throw new Error("boom");\n}\n';

    it('the first frame inside the project, as a file and an empty span at its line and column', () => {
      const root = write({ 'src/server/routes.ts': SOURCE, 'node_modules/x/index.js': 'x', '.fudic/render/a.test.ts': 'x' });
      const file = join(root, 'src/server/routes.ts');
      const offset = SOURCE.indexOf('throw');
      const stack = [
        'Error: boom',
        `    at inner (${join(root, 'node_modules/x/index.js')}:1:1)`,
        `    at ${join(root, '.fudic/render/a.test.ts')}:1:1`,
        `    at elsewhere (${join(dirname(root), 'outside.ts')}:1:1)`,
        `    at gone (${join(root, 'src/missing.ts')}:1:1)`,
        `    at load (${file}:3:3)`,
        `    at later (${file}:2:3)`,
      ].join('\n');
      expect(placeOfStack(stack, root)).toEqual({ file, span: { start: offset, end: offset } });
    });

    it('a file:// frame without a function name', () => {
      const root = write({ 'src/server/routes.ts': SOURCE });
      const file = join(root, 'src/server/routes.ts');
      const stack = `Error: boom\n    at ${pathToFileURL(file).href}:2:3`;
      const offset = SOURCE.indexOf('const');
      expect(placeOfStack(stack, root)).toEqual({ file, span: { start: offset, end: offset } });
    });

    it('nothing when no frame is in the project, or the stack has no frame', () => {
      const root = write({ 'src/a.ts': 'x' });
      expect(placeOfStack('', root)).toBeUndefined();
      expect(placeOfStack('Error: boom\n    at <anonymous>', root)).toBeUndefined();
      expect(placeOfStack(`Error\n    at f (${join(root, 'node_modules/y.js')}:1:1)`, root)).toBeUndefined();
    });
  });
});
