/**
 * SDD-56 §4.5, §4.13 and criteria 7 (its compile part) and 26 (its compile part): what the
 * emit writes for a file's server functions.
 *
 * The client chunk gets one `$fn` stub per function — never `load` — with the chain the
 * compiler read, and the imports of each middleware the `@server` imports. Nothing of `handle`
 * reaches it. The `?server` module gets the whole `@server` of a route, or a component's
 * machinery alone. And `form:="@save"` hands `bindForm` the function.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import {
  emitComponentClientModule,
  emitRouteClientModule,
  emitRouteClientModuleMapped,
  emitRouteModuleMapped,
  emitServerModule,
  resolveComponents,
  type EmitOptions,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>';

const OPTIONS: EmitOptions = {
  serverFns: { prefix: '/_fudic/fn/r/usuarios', page: '/usuarios', httpFile: '/src/http.ts' },
};

function route(server: string, client = '', body = '<p>x</p>', neutral = ''): string {
  return `<link rel="layout" href="./l.fud">
@code {
${neutral}
  @server {
${server}
  }
  @client {
${client}
  }
}
${body}`;
}

function chunk(source: string, options: EmitOptions = OPTIONS): string | null {
  const io = memoryIo({ '/r.fud': source, '/l.fud': LAYOUT });
  return emitRouteClientModule(resolveDocument('/r.fud', io).value, options);
}

/**
 * What a build reports for the route: its client chunk's diagnostics and its server module's,
 * deduplicated by code and span as the reporter shows them. A route with nothing in its
 * `@client` has no chunk, and what it gets wrong must still say so.
 */
function diagnosticsOf(source: string): { code: string; text: string }[] {
  const io = memoryIo({ '/r.fud': source, '/l.fud': LAYOUT });
  const graph = resolveDocument('/r.fud', io).value;
  const seen = new Map<string, { code: string; text: string }>();
  for (const d of [
    ...(emitRouteClientModuleMapped(graph, OPTIONS)?.diagnostics ?? []),
    ...emitRouteModuleMapped(graph, OPTIONS).diagnostics,
  ]) {
    if (d.code !== 'FUD1005' && d.code !== 'FUD1006') continue;
    seen.set(`${d.code}:${d.span.start}:${d.span.end}`, { code: d.code, text: source.slice(d.span.start, d.span.end) });
  }
  return [...seen.values()];
}

const USUARIOS = route(
  `    import { get, put, del, chain, middleware } from '@fudic/http';
    import { auth } from '../middlewares/auth';
    import audit from '../middlewares/audit';
    import { Users } from '../services/users';
    import { userForm } from '../forms/user.form';
    const local = middleware().server((c, n) => n(c));
    export const http = chain().use(audit);
    export async function load() { return { users: await Users.all() }; }
    export const search = get().handle((ctx) => Users.find('HANDLE_BODY_MARK'));
    export const save = put().use(auth, local).form(userForm).invalidates('/blog/:slug').compress({ format: 'deflate-raw', min: 1000 }).handle(async () => { 'SAVE_MARK'; });
    export const remove = del().use(auth, audit).skip('*').handle(() => Users.remove(1));`,
  '    async function find() { return search({ q: "a" }); }',
  '<button @click=@(() => remove({ id: 7 }))>Borrar</button>',
);

describe('the stubs in a route chunk (§4.5)', () => {
  const code = chunk(USUARIOS)!;

  it('imports $fn and FORM_STAGES, the global chain, and each imported middleware once', () => {
    expect(code).toContain("import { $fn, FORM_STAGES } from '@fudic/http/client';");
    expect(code).toContain('import $global from "/src/http.ts";');
    // Aliased as they are met: the file level first, then each function's.
    expect(code).toContain('import $mw0 from "../middlewares/audit";');
    expect(code).toContain('import { auth as $mw1 } from "../middlewares/auth";');
    expect(code.match(/from "\.\.\/middlewares\/auth"/gu)).toHaveLength(1);
  });

  it('one stub per function, with the chain read: global, file, its own', () => {
    expect(code).toContain(
      'const search = $fn({ name: "search", method: \'GET\', url: "/_fudic/fn/r/usuarios/search", page: "/usuarios", base: import.meta.env.BASE_URL, chain: [$global, { steps: [{ kind: \'use\', mws: [$mw0] }] }, { steps: [] }] });',
    );
    expect(code).toContain(
      'const save = $fn({ name: "save", method: \'PUT\', url: "/_fudic/fn/r/usuarios/save", page: "/usuarios", base: import.meta.env.BASE_URL, chain: [$global, { steps: [{ kind: \'use\', mws: [$mw0] }] }, { steps: [{ kind: \'use\', mws: [$mw1] }], compression: {"format":"deflate-raw","min":1000} }], stages: FORM_STAGES, invalidates: ["/blog/:slug"] });',
    );
    expect(code).toContain(
      "chain: [$global, { steps: [{ kind: 'use', mws: [$mw0] }] }, { steps: [{ kind: 'use', mws: [$mw1, $mw0] }, { kind: 'skip-all' }] }] });",
    );
  });

  it('no stub for load, and a middleware declared in the @server is not there', () => {
    expect(code).not.toMatch(/const load\b/u);
    expect(code).not.toContain('local');
  });

  it('criterion 7: nothing of handle, nor what only handle imports', () => {
    expect(code).not.toContain('HANDLE_BODY_MARK');
    expect(code).not.toContain('SAVE_MARK');
    expect(code).not.toContain('../services/users');
    expect(code).not.toContain('Users');
    expect(code).not.toContain('../forms/user.form');
  });

  it('the stubs are module-scope, before the code of @client and the events that call them', () => {
    expect(code.indexOf('const search = $fn')).toBeLessThan(code.indexOf('async function find()'));
    expect(code).toContain('remove({ id: 7 })');
  });
});

describe('what decides the stubs', () => {
  it('without options.serverFns, none', () => {
    const code = chunk(USUARIOS, {})!;
    expect(code).not.toContain('$fn');
    expect(code).not.toContain('@fudic/http');
  });

  it('without src/http.ts, no global level; without page (a component), no page', () => {
    const code = chunk(USUARIOS, { serverFns: { prefix: '/_fudic/fn/c/user-form' } })!;
    expect(code).not.toContain('$global');
    expect(code).not.toContain('page:');
    expect(code).toContain('url: "/_fudic/fn/c/user-form/save"');
    expect(code).toContain("chain: [{ steps: [{ kind: 'use', mws: [$mw0] }] }, { steps: [] }]");
  });

  it('no function with .form: no FORM_STAGES', () => {
    const code = chunk(route("    import { get } from '@fudic/http';\n    export const a = get().handle(() => 1);", '    a();'))!;
    expect(code).toContain("import { $fn } from '@fudic/http/client';");
    expect(code).not.toContain('stages:');
  });

  it('a file with only load writes no stub at all', () => {
    const code = chunk(route('    export async function load() { return {}; }', '    const n = 1;'))!;
    expect(code).not.toContain('$fn');
  });

  it('the file level compression is written on its level', () => {
    const code = chunk(
      route(
        "    import { get, chain } from '@fudic/http';\n    export const http = chain().compress(false);\n    export const a = get().handle(() => 1);",
        '    a();',
      ),
    )!;
    expect(code).toContain('chain: [$global, { steps: [], compression: false }, { steps: [] }]');
  });
});

describe('a component chunk', () => {
  const USER_FORM = `@code {
  @server {
    import { put } from '@fudic/http';
    import { auth } from './auth';
    import { Users } from './users';
    export const save = put().use(auth).handle(() => Users.save('COMPONENT_MARK'));
  }
  @client {
    function go() { return save({}); }
  }
}
<user-form>
  <template shadowrootmode="open"><button @click=@go>ok</button></template>
</user-form>
`;

  it('criterion 36, its compile part: the URL by tag, no page, and nothing of handle', () => {
    const io = memoryIo({
      '/home.fud': '<!DOCTYPE html><html><head><link rel="component" href="./user-form.fud"></head><body><user-form></user-form></body></html>',
      '/user-form.fud': USER_FORM,
    });
    const graph = resolveComponents('/home.fud', io);
    const code = emitComponentClientModule(graph, graph.components.get('user-form')!, {
      serverFns: { prefix: '/_fudic/fn/c/user-form', httpFile: '/src/http.ts' },
    });
    expect(code).toContain('const save = $fn({ name: "save", method: \'PUT\', url: "/_fudic/fn/c/user-form/save", base:');
    expect(code).not.toContain('page:');
    expect(code).toContain('import { auth as $mw0 } from "./auth";');
    expect(code).not.toContain('COMPONENT_MARK');
    expect(code).not.toContain('./users');
  });

  it('subscribes nothing the @server imports: the chunk has no such names', () => {
    // A store the browser reads is subscribed through `$subIf`; an import of the `@server` is
    // not one, and naming it was a `ReferenceError` that stopped the hydration halfway.
    const io = memoryIo({
      '/home.fud': '<!DOCTYPE html><html><head><link rel="component" href="./user-form.fud"></head><body><user-form></user-form></body></html>',
      '/user-form.fud': USER_FORM,
    });
    const graph = resolveComponents('/home.fud', io);
    const code = emitComponentClientModule(graph, graph.components.get('user-form')!, {
      serverFns: { prefix: '/_fudic/fn/c/user-form' },
    });
    expect(code).not.toContain('$subIf');
    expect(code).not.toMatch(/\bUsers\b/u);
    // `auth` reaches the chunk as the middleware it is, aliased, and only so.
    expect(code).toContain('import { auth as $mw0 } from "./auth";');
    expect(code).not.toMatch(/[^{] auth\b|\(auth\b/u);
  });
});

describe('a route chunk names nothing of its @server imports', () => {
  it('no $subIf on them, and no other mention either', () => {
    const code = chunk(
      route(
        "    import { get } from '@fudic/http';\n    import { Users } from '../services/users';\n    export const list = get().handle(() => Users.all());",
        '    const n = signal(0);\n    function more() { n.set(n() + 1); return list(); }',
        '<button @click=@more>@n()</button>',
      ),
    )!;
    expect(code).not.toContain('$subIf');
    expect(code).not.toMatch(/\bUsers\b/u);
    expect(code).not.toContain('../services/users');
  });

  it('while a store the neutral zone imports is still subscribed', () => {
    const code = chunk(
      route(
        "    import { Users } from '../services/users';\n    export async function load() { return Users.all(); }",
        '    const n = signal(0);',
        '<p>@count() @n()</p>',
        "  import { count } from '../store';",
      ),
    )!;
    expect(code).toContain('$subIf(count, $u)');
    expect(code).not.toMatch(/\bUsers\b/u);
  });
});

describe('the ?server module (§4.13)', () => {
  it('a route gets its whole @server, with the imports it reads', () => {
    const text = emitServerModule(USUARIOS);
    expect(text).toContain("import { Users } from '../services/users';");
    expect(text).toContain('export async function load()');
    expect(text).toContain('export const save = put()');
    expect(text).toContain('SAVE_MARK');
    expect(text).not.toContain('async function find()');
  });

  it('a component gets its machinery alone, and the neutral import its form reads', () => {
    const source = `@code {
  import { userForm } from './user.form';
  import { unused } from './unused';
  @server {
    import { put, middleware } from '@fudic/http';
    import { Users } from './users';
    import { Clock } from './clock';
    const mw = middleware().server((c, n) => n(c));
    export const save = put().use(mw).form(userForm).handle(() => Users.save(inject(Users)));
    const now = Clock.now();
    'RENDER_ONLY';
  }
}
<user-form>
  <template shadowrootmode="open"><span></span></template>
</user-form>
`;
    const text = emitServerModule(source);
    expect(text).toContain("import { userForm } from './user.form';");
    expect(text).toContain("import { Users } from './users';");
    expect(text).toContain('const mw = middleware()');
    expect(text).toContain('export const save = put()');
    // `inject` stays as written: the request's container answers it (§4.13).
    expect(text).toContain('inject(Users)');
    expect(text).not.toContain('injectFrom');
    expect(text).not.toContain('RENDER_ONLY');
    expect(text).not.toContain('Clock');
    expect(text).not.toContain('./unused');
  });

  it('nothing to emit is an empty module', () => {
    expect(emitServerModule('<p>x</p>')).toBe('export {};\n');
    expect(emitServerModule('<!DOCTYPE html><html><head></head><body><p>x</p></body></html>')).toBe('export {};\n');
    // A layout has no `?server` of its own.
    expect(emitServerModule(LAYOUT)).toBe('export {};\n');
    expect(emitServerModule('<x-a><template shadowrootmode="open"><span></span></template></x-a>')).toBe('export {};\n');
    expect(
      emitServerModule(
        "@code {\n  @server {\n    const n = 1;\n  }\n}\n<x-a><template shadowrootmode=\"open\"><span></span></template></x-a>",
      ),
    ).toBe('export {};\n');
  });
});

describe('form:= (criterion 26, its compile part)', () => {
  const server = "    import { put } from '@fudic/http';\n    export const save = put().handle(() => 1);";
  const neutral = "  import { userForm } from './user.form';";

  it('hands the function to bindForm', () => {
    const code = chunk(route(server, '', '<form control=@userForm form:="@save"><button>ok</button></form>', neutral))!;
    expect(code).toMatch(/bindForm\([^)]*, null, save\)/u);
  });

  it('after the links of a summary with fields', () => {
    const code = chunk(
      route(
        server,
        '',
        '<form control=@userForm form:="@save"><div summary="@userForm" fields></div><input id="nom" control="@userForm.name"></form>',
        neutral,
      ),
    )!;
    expect(code).toMatch(/bindForm\([^)]*, \{"name":"nom"\}, save\)/u);
  });

  it('FUD1006: on an element that is not a <form>', () => {
    expect(diagnosticsOf(route(server, '', '<div control=@userForm form:="@save"></div>', neutral))).toEqual([
      { code: 'FUD1006', text: 'form:="@save"' },
    ]);
  });

  it('FUD1006: on a <form> without control=', () => {
    expect(diagnosticsOf(route(server, '', '<form form:="@save"></form>', neutral))).toEqual([
      { code: 'FUD1006', text: 'form:="@save"' },
    ]);
  });

  it('FUD1005: naming something that is not a server function of the file', () => {
    const src = route(server, '    function local() {}', '<form control=@userForm form:="@local"></form>', neutral);
    expect(diagnosticsOf(src)).toEqual([{ code: 'FUD1005', text: 'local' }]);
  });

  it('FUD1005: naming load, which no browser calls', () => {
    const src = route(
      "    export async function load() { return {}; }",
      '',
      '<form control=@userForm form:="@load"></form>',
      neutral,
    );
    expect(diagnosticsOf(src)).toEqual([{ code: 'FUD1005', text: 'load' }]);
  });

  it('FUD1005: a value that is not one @ expression', () => {
    const plain = diagnosticsOf(route(server, '', '<form control=@userForm form:="save"></form>', neutral));
    expect(plain.map((d) => d.code)).toEqual(['FUD1005']);
    const mixed = diagnosticsOf(route(server, '', '<form control=@userForm form:="x @save"></form>', neutral));
    expect(mixed.map((d) => d.code)).toEqual(['FUD1005']);
  });
});

