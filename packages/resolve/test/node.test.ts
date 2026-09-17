/**
 * The node-backed `ResolveFs`, against real files.
 *
 * The one module here that touches a disk is the one test here that does, for the reason
 * `node-fs.test.ts` gives in the language server: what is being measured is agreement with
 * Node's own resolver, and a fake resolver would measure the fake.
 *
 * The library is installed both ways on purpose — a symlink, which is what pnpm leaves, and
 * a copy, which is what npm leaves. The measurement of §4.2 found that the build does not
 * care and the index cares about nothing else, so the resolver has to be indifferent, and
 * this is where that is stated.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeResolveFs } from '../src/node.js';
import { resolveHref } from '../src/resolve.js';

const CARD = '<ui-card><template shadowrootmode="open"><slot></slot></template></ui-card>\n';

const manifest = (exports: Readonly<Record<string, string>>): string =>
  JSON.stringify({ name: '@acme/ui', version: '1.0.0', type: 'module', exports }, null, 2);

/** A workspace with a library, installed for the app the way `linked` says. */
function workspace(options: { readonly linked: boolean; readonly exportsCard: boolean }): {
  readonly from: string;
  readonly card: string;
} {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-resolve-'));

  const lib = join(ws, 'libs', 'ui');
  mkdirSync(join(lib, 'src'), { recursive: true });
  writeFileSync(join(lib, 'src', 'ui-card.fud'), CARD);
  writeFileSync(join(lib, 'fudic.json'), JSON.stringify({ kind: 'lib', prefix: 'ui' }));
  writeFileSync(
    join(lib, 'package.json'),
    manifest(
      options.exportsCard
        ? { './ui-card.fud': './src/ui-card.fud' }
        : { './otro.fud': './src/ui-card.fud' },
    ),
  );

  const app = join(ws, 'apps', 'tienda');
  mkdirSync(join(app, 'src', 'routes'), { recursive: true });
  const from = join(app, 'src', 'routes', 'index.fud');
  writeFileSync(from, '<h1>hola</h1>\n');

  const scope = join(app, 'node_modules', '@acme');
  mkdirSync(scope, { recursive: true });
  if (options.linked) symlinkSync(lib, join(scope, 'ui'), 'junction');
  else cpSync(lib, join(scope, 'ui'), { recursive: true });

  return { from, card: join(lib, 'src', 'ui-card.fud') };
}

const io = nodeResolveFs();

describe('a package specifier, resolved by Node', () => {
  it('finds the file a linked package exports, and reads its fudic.json', () => {
    const { from } = workspace({ linked: true, exportsCard: true });
    const resolution = resolveHref(from, '@acme/ui/ui-card.fud', io);

    if (resolution.outcome !== 'package') throw new Error(`expected a package: ${resolution.outcome}`);
    expect(resolution.path.replace(/\\/g, '/')).toMatch(/\/src\/ui-card\.fud$/);
    expect(resolution.target.name).toBe('@acme/ui');
    expect(resolution.target.config?.kind).toBe('lib');
    expect(resolution.target.config?.prefix).toBe('ui');
  });

  it('finds it the same way when the package is a copy and not a link', () => {
    const { from } = workspace({ linked: false, exportsCard: true });
    const resolution = resolveHref(from, '@acme/ui/ui-card.fud', io);

    if (resolution.outcome !== 'package') throw new Error(`expected a package: ${resolution.outcome}`);
    expect(resolution.path.replace(/\\/g, '/')).toMatch(/\/src\/ui-card\.fud$/);
    expect(resolution.target.config?.kind).toBe('lib');
  });

  it('says NOT INSTALLED when there is no such package', () => {
    const { from } = workspace({ linked: true, exportsCard: true });
    expect(resolveHref(from, '@otra/cosa/card.fud', io)).toEqual({
      outcome: 'unresolved',
      specifier: '@otra/cosa/card.fud',
      reason: 'not-installed',
    });
  });

  it('says NOT EXPORTED when the package is there and the subpath is not', () => {
    // The two halves of FUD0760, and the reason it has two messages: this one is fixed in
    // the library's `package.json`, the one above with an install.
    const { from } = workspace({ linked: true, exportsCard: false });
    expect(resolveHref(from, '@acme/ui/ui-card.fud', io)).toEqual({
      outcome: 'unresolved',
      specifier: '@acme/ui/ui-card.fud',
      reason: 'not-exported',
    });
  });

  it('says NOT EXPORTED for a file inside a package that publishes no exports map', () => {
    // No `exports` is not "everything is public" to Node either: it resolves paths, and a
    // path that is not there is still the package's business, not an install's.
    const ws = mkdtempSync(join(tmpdir(), 'fudic-resolve-plain-'));
    const lib = join(ws, 'node_modules', 'ui-kit');
    mkdirSync(lib, { recursive: true });
    writeFileSync(join(lib, 'package.json'), JSON.stringify({ name: 'ui-kit', version: '1.0.0' }));
    const from = join(ws, 'index.fud');
    writeFileSync(from, '<h1>hola</h1>\n');

    expect(resolveHref(from, 'ui-kit/no-existe.fud', io)).toEqual({
      outcome: 'unresolved',
      specifier: 'ui-kit/no-existe.fud',
      reason: 'not-exported',
    });
  });
});

describe('the rest of the seam', () => {
  it('reads and tests files, and joins an href against its directory', () => {
    const { from, card } = workspace({ linked: true, exportsCard: true });
    expect(io.exists(from)).toBe(true);
    expect(io.exists(`${from}.no`)).toBe(false);
    expect(io.read(card)).toBe(CARD);
    expect(io.join(from, './otra.fud').replace(/\\/g, '/')).toMatch(/\/routes\/otra\.fud$/);
    expect(io.dirname(from).replace(/\\/g, '/')).toMatch(/\/routes$/);
  });

  it('resolves a relative href without asking Node about packages', () => {
    const { from, card } = workspace({ linked: true, exportsCard: true });
    const resolution = resolveHref(from, '../../../../libs/ui/src/ui-card.fud', io);
    expect(resolution).toEqual({ outcome: 'path', path: card });
  });
});
