/**
 * The two node-backed seams of the plugin (SDD-43 §3.1).
 *
 * `nodeIo` is what the compiler walks the component graph with, and `nodeLinkCheckIo` is
 * what the link check asks before the walk. They share one resolver on purpose: two would
 * be two ideas of which file a tag is, and the editor and the build disagreeing about that
 * is the defect §5 names.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeIo, nodeLinkCheckIo } from '../src/io.js';

const CARD = '<ui-card><template shadowrootmode="open"><slot></slot></template></ui-card>\n';

/** A workspace with a library installed for the app, the way pnpm installs one. */
function workspace(): { readonly from: string; readonly card: string } {
  const ws = mkdtempSync(join(tmpdir(), 'fudic-vite-io-'));

  const lib = join(ws, 'libs', 'ui');
  mkdirSync(join(lib, 'src'), { recursive: true });
  writeFileSync(join(lib, 'src', 'ui-card.fud'), CARD);
  writeFileSync(join(lib, 'fudic.json'), JSON.stringify({ kind: 'lib', prefix: 'ui' }));
  writeFileSync(
    join(lib, 'package.json'),
    JSON.stringify({
      name: '@acme/ui',
      version: '1.0.0',
      type: 'module',
      exports: { './ui-card.fud': './src/ui-card.fud' },
    }),
  );

  const app = join(ws, 'apps', 'tienda');
  mkdirSync(join(app, 'src', 'routes'), { recursive: true });
  const from = join(app, 'src', 'routes', 'index.fud');
  writeFileSync(from, '<h1>hola</h1>\n');

  const scope = join(app, 'node_modules', '@acme');
  mkdirSync(scope, { recursive: true });
  symlinkSync(lib, join(scope, 'ui'), 'junction');

  return { from, card: join(lib, 'src', 'ui-card.fud') };
}

describe('nodeIo', () => {
  it('reads a file and resolves a relative href against it', () => {
    const { from, card } = workspace();
    const io = nodeIo();
    expect(io.read(card)).toBe(CARD);
    expect(io.resolve(from, '../../../../libs/ui/src/ui-card.fud')).toBe(card);
  });

  it('resolves a package specifier to the file the package exports', () => {
    const { from } = workspace();
    expect(nodeIo().resolve(from, '@acme/ui/ui-card.fud').replace(/\\/g, '/')).toMatch(
      /\/src\/ui-card\.fud$/,
    );
  });
});

describe('nodeLinkCheckIo', () => {
  it('reads a file that is there', () => {
    const { card } = workspace();
    expect(nodeLinkCheckIo().read(card)).toBe(CARD);
  });

  it('answers undefined for a file that is not, rather than throwing', () => {
    // The check walks a graph the author is still writing, and half of it may not exist
    // yet. Stopping at a missing file is the behaviour; dying on it is not.
    const { card } = workspace();
    expect(nodeLinkCheckIo().read(`${card}.no-existe`)).toBeUndefined();
  });

  it('gives the whole resolution, package and config included', () => {
    const { from } = workspace();
    const resolution = nodeLinkCheckIo().resolve(from, '@acme/ui/ui-card.fud');
    if (resolution.outcome !== 'package') throw new Error(`expected a package: ${resolution.outcome}`);
    expect(resolution.target.name).toBe('@acme/ui');
    expect(resolution.target.config?.kind).toBe('lib');
  });

  it('reports a specifier that names no package', () => {
    const { from } = workspace();
    expect(nodeLinkCheckIo().resolve(from, '@otra/cosa/card.fud')).toEqual({
      outcome: 'unresolved',
      specifier: '@otra/cosa/card.fud',
      reason: 'not-installed',
    });
  });
});
