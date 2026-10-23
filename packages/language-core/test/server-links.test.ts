/**
 * SDD-60 §4.7 — a `.fud` with `<link rel="server">`: `data`, the functions and the forms of its
 * `.fudapi` are declared in the client virtual from `fudic:<id>`, the module the browser gets.
 */

import { describe, expect, it } from 'vitest';
import type { FileRegistry, ServerImport } from '../src/types.js';
import { emitClient, registryOf } from './_support.js';

const ROUTE = '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./usuarios.fudapi">\n<p>@data.users</p>\n';

const withServers = (servers: readonly ServerImport[]): FileRegistry => ({ ...registryOf({}), servers: () => servers });

describe('the client virtual of a file that links a .fudapi', () => {
  it('data is the LoadData of the file that declares load', () => {
    const virtual = emitClient(ROUTE, 'routes/usuarios.fud', withServers([
      { id: 'middlewares/none', load: false, names: [] },
      { id: 'routes/usuarios', load: true, names: ['search'] },
    ]));
    expect(virtual.text).toContain("declare const data: import('fudic:routes/usuarios').LoadData;");
    expect(virtual.text).not.toContain('$Data');
  });

  it('every function and form is the type of its module, a name two files give once', () => {
    const virtual = emitClient(ROUTE, 'routes/usuarios.fud', withServers([
      { id: 'routes/usuarios', load: true, names: ['search', 'person'] },
      { id: 'forms/person', load: false, names: ['person', 'save'] },
    ]));
    expect(virtual.text).toContain("declare const search: typeof import('fudic:routes/usuarios')['search'];");
    expect(virtual.text).toContain("declare const person: typeof import('fudic:routes/usuarios')['person'];");
    expect(virtual.text).toContain("declare const save: typeof import('fudic:forms/person')['save'];");
    expect(virtual.text).not.toContain("import('fudic:forms/person')['person']");
  });

  it('without a load, data is unknown', () => {
    const virtual = emitClient(ROUTE, 'routes/usuarios.fud', withServers([{ id: 'routes/x', load: false, names: [] }]));
    expect(virtual.text).toContain('declare const data: unknown;');
  });

  it('a registry that cannot read them gives nothing', () => {
    const virtual = emitClient(ROUTE, 'routes/usuarios.fud');
    expect(virtual.text).not.toContain('fudic:');
  });
});
