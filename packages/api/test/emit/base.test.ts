/**
 * SDD-87 §3.5, criterion 3: the browser module of a `.fudapi` under a `base`. Without one, or
 * with `/`, the module is the one before SDD-87, byte for byte: the snapshot was written first.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, emitModule } from '../../src/index.js';
import { app, BUILT_INS } from '../project.js';

const lines = (...l: string[]): string => l.join('\n');

/** A file with functions and a remote rule, under the global chain of `csrf`. */
const SOURCE = app(
  'routes/fallos',
  lines('rule nombre-ocupado', '  on str', '  runs remote', '  fails nombre-ocupado', '', 'get saludo', '  -> str', '', 'post rompe', '', 'put guarda', '  nombre  str', '    nombre-ocupado', ''),
);
const INDEX = createApiIndex([...BUILT_INS, SOURCE]);

describe('the browser module without a base (criterion 3)', () => {
  it('is the one before SDD-87', () => {
    expect(emitModule(SOURCE, INDEX, {}, 'browser')).toMatchSnapshot();
  });
});

describe('the browser module under a base (criterion 3)', () => {
  const admin = emitModule(SOURCE, INDEX, {}, 'browser', { base: '/admin/' });
  const exported = (name: string): string => admin.split('\n').find((l) => l.startsWith(`export const ${name} = `))!;

  it('with base /, it is byte for byte the one without', () => {
    expect(emitModule(SOURCE, INDEX, {}, 'browser', { base: '/' })).toBe(emitModule(SOURCE, INDEX, {}, 'browser'));
  });

  it('each stub carries base: "/admin/"', () => {
    for (const name of ['saludo', 'rompe', 'guarda']) expect(exported(name)).toMatch(/^export const \w+ = stub\(\{.*, base: "\/admin\/" \}\);$/u);
  });

  it('each remote rule carries it, in its spec and in its ruleSend', () => {
    const rule = exported('nombreOcupado');
    expect(rule).toContain('send: ruleSend("nombre-ocupado", () => [{ steps: [] }], "/admin/")');
    expect(rule).toContain(', base: "/admin/"');
  });

  it('the server module never writes it', () => {
    expect(emitModule(SOURCE, INDEX, {}, 'server', { base: '/admin/' })).toBe(emitModule(SOURCE, INDEX, {}, 'server'));
  });

  it('the module only changes by the base: the rest stays as it was', () => {
    expect(admin.replaceAll(', base: "/admin/"', '').replaceAll(', "/admin/")', ')')).toBe(emitModule(SOURCE, INDEX, {}, 'browser'));
  });
});
