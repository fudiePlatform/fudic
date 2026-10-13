/**
 * SDD-56 §3.11, §4.5 and criteria 10–12: the server functions of a `@server`, read at compile
 * time off the file's one Oxc batch, and every way of writing one that cannot be read.
 *
 * Every case goes through `extractCode` over a real parsed document, so the spans checked are
 * `.fud` offsets — what the editor underlines — and the rest of the file is read regardless.
 */

import { describe, expect, it } from 'vitest';
import { extractCode, type CodeDocument } from '../../src/emit/oxc-code.js';
import { parseSync } from 'oxc-parser';
import { readServerFns, serverFnTable, type ChainStep, type MiddlewareRef } from '../../src/emit/server-fns.js';
import type { OxcNode } from '../../src/oxc/index.js';
import { parse } from './_support.js';

/** A page whose `@code` holds this `@server` body, and optionally a `@client` and a neutral zone. */
function route(server: string, client = '', neutral = ''): string {
  return `<!DOCTYPE html>
<html>
<head>
@code {
${neutral}
  @server {
${server}
  }
  @client {
${client}
  }
}
</head>
<body><p>x</p></body>
</html>
`;
}

/** A component with this `@server` body. */
function component(server: string, neutral = ''): string {
  return `@code {
${neutral}
  @server {
${server}
  }
}
<user-form>
  <template shadowrootmode="open"><span></span></template>
</user-form>
`;
}

const HTTP = "import { get, post, put, patch, del, chain, middleware } from '@fudic/http';";

function read(source: string) {
  const code = extractCode(source, parse(source) as CodeDocument);
  return { fns: code.serverFns, diagnostics: code.diagnostics, code };
}

/** A ref without its span, for comparing what was read. */
const bare = (steps: readonly ChainStep[]) =>
  steps.map((s) =>
    s.kind === 'skip-all' ? s : { kind: s.kind, refs: s.refs.map(({ span: _, ...r }: MiddlewareRef) => r) },
  );

const codes = (source: string) => read(source).diagnostics.map((d) => d.code);

/** The diagnostic of `code`, with the text its span covers. */
function at(source: string, code: string): string {
  const d = read(source).diagnostics.find((x) => x.code === code);
  expect(d, `${code} expected`).toBeDefined();
  return source.slice(d!.span.start, d!.span.end);
}

describe('criterion 10: the table of the §1 example', () => {
  const source = route(
    `    ${HTTP}
    import { auth } from '../middlewares/auth';
    import audit from '../middlewares/audit';
    import { userForm as theForm } from '../forms/user.form';
    export const http = chain().skip(auth).use(audit).compress({ format: 'deflate-raw', min: 1000 });
    export async function load() { return {}; }
    export const search = get().args().handle((ctx) => []);
    export const save = put().use(auth).form(theForm).invalidates('/blog', '/blog/:slug').compress(false).handle(async () => {});
    export const remove = del().use(auth, audit).skip('*').handle(() => {});`,
  );
  const { fns, diagnostics } = read(source);

  it('reads without a diagnostic', () => {
    expect(diagnostics).toEqual([]);
  });

  it('the file level: its steps in order and its compression', () => {
    expect(bare(fns.file)).toEqual([
      { kind: 'skip', refs: [{ local: 'auth', from: '../middlewares/auth', imported: 'auth' }] },
      { kind: 'use', refs: [{ local: 'audit', from: '../middlewares/audit', imported: 'default' }] },
    ]);
    expect(fns.fileCompress).toEqual({ format: 'deflate-raw', min: 1000 });
  });

  it('every function with its method, its steps in order and its span', () => {
    const byName = Object.fromEntries(fns.fns.map((f) => [f.name, f]));
    expect(Object.keys(byName).sort()).toEqual(['load', 'remove', 'save', 'search']);

    expect(byName['search']!.method).toBe('GET');
    expect(byName['search']!.steps).toEqual([]);
    expect(byName['load']).toMatchObject({ method: 'GET', steps: [], invalidates: [] });

    const save = byName['save']!;
    expect(save.method).toBe('PUT');
    expect(bare(save.steps)).toEqual([{ kind: 'use', refs: [{ local: 'auth', from: '../middlewares/auth', imported: 'auth' }] }]);
    expect(save.form).toMatchObject({ local: 'theForm', from: '../forms/user.form', imported: 'userForm' });
    expect(save.invalidates).toEqual(['/blog', '/blog/:slug']);
    expect(save.compress).toBe(false);
    expect('compress' in byName['search']!).toBe(false);
    expect('form' in byName['search']!).toBe(false);

    const remove = byName['remove']!;
    expect(remove.method).toBe('DELETE');
    expect(bare(remove.steps)).toEqual([
      {
        kind: 'use',
        refs: [
          { local: 'auth', from: '../middlewares/auth', imported: 'auth' },
          { local: 'audit', from: '../middlewares/audit', imported: 'default' },
        ],
      },
      { kind: 'skip-all' },
    ]);

    for (const f of fns.fns) expect(source.slice(f.span.start, f.span.end)).toBe(f.name);
    const ref = remove.steps[0]!.kind === 'use' ? remove.steps[0]!.refs[1]! : undefined;
    expect(source.slice(ref!.span.start, ref!.span.end)).toBe('audit');
  });

  it.each([
    ['post', 'POST'],
    ['patch', 'PATCH'],
  ])('%s opens a %s', (verb, method) => {
    const { fns: read1 } = read(route(`    ${HTTP}\n    export const x = ${verb}().handle(() => 1);`));
    expect(read1.fns[0]!.method).toBe(method);
  });

  it('serverFnTable attaches the owner to every function', () => {
    const table = serverFnTable(fns, { kind: 'route', pattern: '/usuarios' });
    expect(table.file).toBe(fns.file);
    expect(table.fileCompress).toEqual(fns.fileCompress);
    expect(table.fns.every((f) => f.owner.kind === 'route' && f.owner.pattern === '/usuarios')).toBe(true);
    const plain = serverFnTable(read(route(`    ${HTTP}\n    export const a = get().handle(() => 1);`)).fns, {
      kind: 'component',
      tag: 'user-form',
    });
    expect('fileCompress' in plain).toBe(false);
    expect(plain.fns[0]!.owner).toEqual({ kind: 'component', tag: 'user-form' });
  });
});

describe('criterion 11: a base kept in a const and continued', () => {
  it('const secured = put().use(auth); save = secured.use(audit).handle(f) has both steps', () => {
    const { fns, diagnostics } = read(
      route(`    ${HTTP}
    import { auth, audit } from './mw';
    const secured = put().use(auth);
    export const save = secured.use(audit).handle(() => 1);
    export const rename = secured.form(f).handle(() => 2);
    const f = 1;`),
    );
    expect(diagnostics).toEqual([]);
    const save = fns.fns.find((x) => x.name === 'save')!;
    expect(save.method).toBe('PUT');
    expect(bare(save.steps)).toEqual([
      { kind: 'use', refs: [{ local: 'auth', from: './mw', imported: 'auth' }] },
      { kind: 'use', refs: [{ local: 'audit', from: './mw', imported: 'audit' }] },
    ]);
    const rename = fns.fns.find((x) => x.name === 'rename')!;
    expect(bare(rename.steps)).toEqual([{ kind: 'use', refs: [{ local: 'auth', from: './mw', imported: 'auth' }] }]);
    expect(rename.form).toMatchObject({ local: 'f' });
    expect('from' in rename.form!).toBe(false);
    // The base itself is not a function.
    expect(fns.fns.map((x) => x.name).sort()).toEqual(['rename', 'save']);
  });

  it('a base of a base, its invalidates and compress inherited', () => {
    const { fns } = read(
      route(`    ${HTTP}
    const a = post().invalidates('/a').compress({ format: 'gzip' });
    const b = a.invalidates('/b');
    export const x = b.handle(() => 1);`),
    );
    expect(fns.fns[0]).toMatchObject({ method: 'POST', invalidates: ['/a', '/b'], compress: { format: 'gzip' } });
  });

  it('a base that is already closed can be exported as it is', () => {
    const { fns, diagnostics } = read(route(`    ${HTTP}\n    const done = get().handle(() => 1);\n    export const x = done;`));
    expect(diagnostics).toEqual([]);
    expect(fns.fns.map((f) => f.name)).toEqual(['x']);
  });

  it('a base that continues itself reads as nothing, and says FUD1000 only if exported', () => {
    const src = route(`    ${HTTP}\n    const a = b.use(x);\n    const b = a.use(x);\n    export const c = a.handle(() => 1);`);
    expect(read(src).fns.fns).toEqual([]);
    expect(codes(src)).toEqual(['FUD1000']);
  });

  it('the verbs are recognised under an alias, and only from @fudic/http', () => {
    const { fns } = read(
      route(`    import { put as update } from '@fudic/http';
    import { get } from './not-http';
    export const a = update().handle(() => 1);
    export const b = get().handle(() => 2);`),
    );
    expect(fns.fns.map((f) => [f.name, f.method])).toEqual([['a', 'PUT']]);
  });

  it('a type-only import binds nothing, and a namespace import is no verb', () => {
    const src = route(`    import type { put } from '@fudic/http';
    import * as http from '@fudic/http';
    export const a = http.put().handle(() => 1);`);
    expect(read(src).fns.fns).toEqual([]);
    expect(codes(src)).toEqual(['FUD1000']);
  });

  it('what is no builder at all is not read, nor reported', () => {
    const src = route(`    ${HTTP}
    export const n = 1;
    export const o = { handle: 1 };
    export const f = compute();
    export let later;
    const [a] = [1];
    export const s = 'x'.trim();`);
    expect(read(src).fns.fns).toEqual([]);
    expect(codes(src)).toEqual([]);
  });

  it('a chain() kept in a const is not a base for a function: FUD1000', () => {
    const src = route(`    ${HTTP}\n    const c = chain().use(a);\n    export const s = c.handle(() => 1);`);
    expect(read(src).fns.fns).toEqual([]);
    expect(codes(src)).toEqual(['FUD1000']);
  });

  it('another export of @fudic/http opens nothing: a middleware it ships is a ref', () => {
    const { fns, diagnostics } = read(
      route(`    import { put, csrf, errorPages as pages } from '@fudic/http';\n    export const s = put().use(csrf, pages).handle(() => 1);`),
    );
    expect(diagnostics).toEqual([]);
    expect(bare(fns.fns[0]!.steps)).toEqual([
      {
        kind: 'use',
        refs: [
          { local: 'csrf', from: '@fudic/http', imported: 'csrf' },
          { local: 'pages', from: '@fudic/http', imported: 'errorPages' },
        ],
      },
    ]);
  });

  it('a string-keyed import is read by its name', () => {
    const { fns } = read(route(`    import { "put" as p } from '@fudic/http';\n    export const a = p().handle(() => 1);`));
    expect(fns.fns[0]!.method).toBe('PUT');
  });
});

describe('criterion 12: each diagnostic, its span, and the rest of the file read', () => {
  const rest = '    export const ok = get().handle(() => 1);';
  const names = (src: string) => read(src).fns.fns.map((f) => f.name);

  it('FUD1000: a .use argument that is not an identifier', () => {
    const src = route(`    ${HTTP}\n    export const save = put().use(auth()).handle(() => 1);\n${rest}`);
    expect(at(src, 'FUD1000')).toBe('auth()');
    expect(names(src)).toEqual(['save', 'ok']);
  });

  it('FUD1000: a .skip argument that is not an identifier', () => {
    expect(at(route(`    ${HTTP}\n    export const s = put().skip(a.b).handle(() => 1);`), 'FUD1000')).toBe('a.b');
  });

  it('FUD1000: an .invalidates argument that is not a string literal', () => {
    const src = route(`    ${HTTP}\n    const p = '/x';\n    export const s = put().invalidates('/a', p).handle(() => 1);\n${rest}`);
    expect(at(src, 'FUD1000')).toBe('p');
    expect(read(src).fns.fns[0]!.invalidates).toEqual(['/a']);
  });

  it('FUD1000: a .form argument that is not an identifier, or none', () => {
    expect(at(route(`    ${HTTP}\n    export const s = put().form(make()).handle(() => 1);`), 'FUD1000')).toBe('make()');
    expect(codes(route(`    ${HTTP}\n    export const s = put().form().handle(() => 1);`))).toEqual(['FUD1000']);
  });

  it.each([
    ["{ format: fmt }", '{ format: fmt }'],
    ["{ format: 'gzip', min: big }", "{ format: 'gzip', min: big }"],
    ["{ format: 'gzip', level: 9 }", "{ format: 'gzip', level: 9 }"],
    ['{ min: 10 }', '{ min: 10 }'],
    ['true', 'true'],
    ['options', 'options'],
    ['{ [k]: 1 }', '{ [k]: 1 }'],
    ["{ 1: 'gzip' }", "{ 1: 'gzip' }"],
  ])('FUD1000: .compress(%s)', (arg, span) => {
    expect(at(route(`    ${HTTP}\n    export const s = put().compress(${arg}).handle(() => 1);`), 'FUD1000')).toBe(span);
  });

  it('FUD1000: .compress() with no argument points at the chain', () => {
    expect(codes(route(`    ${HTTP}\n    export const s = put().compress().handle(() => 1);`))).toEqual(['FUD1000']);
  });

  it(".compress with a string-keyed literal is read", () => {
    const { fns, diagnostics } = read(route(`    ${HTTP}\n    export const s = put().compress({ 'format': 'gzip', "min": 5 }).handle(() => 1);`));
    expect(diagnostics).toEqual([]);
    expect(fns.fns[0]!.compress).toEqual({ format: 'gzip', min: 5 });
  });

  it('FUD1000: a verb chosen with a condition, or a chain from another module', () => {
    const cond = route(`    ${HTTP}\n    export const s = (flag ? put() : post()).handle(() => 1);\n${rest}`);
    expect(at(cond, 'FUD1000')).toBe('(flag ? put() : post()).handle(() => 1)');
    expect(names(cond)).toEqual(['ok']);
    const foreign = route(`    ${HTTP}\n    import { secured } from './base';\n    export const s = secured.use(a).handle(() => 1);`);
    expect(at(foreign, 'FUD1000')).toBe('secured.use(a).handle(() => 1)');
    const computed = route(`    ${HTTP}\n    export const s = builders['put']().handle(() => 1);`);
    expect(codes(computed)).toEqual(['FUD1000']);
    const called = route(`    ${HTTP}\n    export const s = make()().handle(() => 1);`);
    expect(codes(called)).toEqual(['FUD1000']);
  });

  it('FUD1000 is not said of a chain that is not exported', () => {
    expect(codes(route(`    ${HTTP}\n    const s = (flag ? put() : post()).handle(() => 1);`))).toEqual([]);
  });

  it('FUD1001: an exported builder without .handle', () => {
    const src = route(`    ${HTTP}\n    export const save = put().use(a);\n${rest}`);
    expect(at(src, 'FUD1001')).toBe('save');
    expect(names(src)).toEqual(['ok']);
  });

  it('FUD1002: load declared with another verb, and still read', () => {
    const src = route(`    ${HTTP}\n    export const load = del().handle(() => ({}));`);
    expect(at(src, 'FUD1002')).toBe('load');
    expect(read(src).diagnostics[0]!.message).toContain('del()');
    expect(names(src)).toEqual(['load']);
    expect(codes(route(`    ${HTTP}\n    export const load = get().handle(() => ({}));`))).toEqual([]);
  });

  it.each(['paths', 'layout'])('FUD1003: a server function named %s', (name) => {
    const src = route(`    ${HTTP}\n    export const ${name} = get().handle(() => 1);\n${rest}`);
    expect(at(src, 'FUD1003')).toBe(name);
    expect(names(src)).toEqual(['ok']);
  });

  it('FUD1004: export const http that is not a chain()', () => {
    const src = route(`    ${HTTP}\n    export const http = put().use(a);\n${rest}`);
    expect(at(src, 'FUD1004')).toBe('put().use(a)');
    expect(names(src)).toEqual(['ok']);
  });

  it('FUD1004: export const http that ends in .handle', () => {
    expect(at(route(`    ${HTTP}\n    export const http = chain().use(a).handle(() => 1);`), 'FUD1004')).toBe(
      'chain().use(a).handle(() => 1)',
    );
  });

  it('a chain() that is not http is machinery, not a function; an unexported http is not the file level', () => {
    const { fns, diagnostics } = read(route(`    ${HTTP}\n    const base = chain().use(a);\n    const http = chain().use(b);`));
    expect(diagnostics).toEqual([]);
    expect(fns.file).toEqual([]);
    expect(fns.fns).toEqual([]);
  });

  it('FUD1007: a middleware declared in the @server with a .client half', () => {
    const src = route(`    ${HTTP}
    const local = middleware().client((c, n) => n(c)).server((c, n) => n(c));
    const onlyServer = middleware().server((c, n) => n(c));
    export const save = put().use(local, onlyServer).handle(() => 1);`);
    expect(at(src, 'FUD1007')).toBe('local');
    expect(codes(src)).toEqual(['FUD1007']);
    // Declared here: a ref without `from`, server-only.
    const save = read(src).fns.fns[0]!;
    expect(bare(save.steps)).toEqual([{ kind: 'use', refs: [{ local: 'local' }, { local: 'onlyServer' }] }]);
  });

  it('FUD1009: a server function and a @client or neutral variable with the same name', () => {
    const client = route(`    ${HTTP}\n    export const save = put().handle(() => 1);`, '    function save() {}');
    expect(at(client, 'FUD1009')).toBe('save');
    const neutral = route(`    ${HTTP}\n    export const search = get().handle(() => 1);`, '', '  const search = 1;');
    expect(at(neutral, 'FUD1009')).toBe('search');
    // `load` is never called from the browser: no clash to report.
    expect(codes(route(`    ${HTTP}\n    export const load = get().handle(() => ({}));`, '    const load = 1;'))).toEqual([]);
  });

  it('the rest of the file is still emitted around a diagnostic', () => {
    const src = route(`    ${HTTP}\n    export const save = put().use(auth()).handle(() => 1);\n${rest}`, '    const n = 1;');
    const { code } = read(src);
    expect(code.clientNames).toContain('n');
  });
});

describe('FUD1010: _error.fud declares none of this', () => {
  /** `readServerFns` over a plain module, as vite calls it for `_error.fud`. */
  function errorPage(js: string) {
    const program = parseSync('error.ts', js).program as unknown as { body: OxcNode[] };
    const result = readServerFns({
      server: program.body,
      all: program.body,
      map: (offset) => offset,
      browserNames: new Set(),
      component: false,
      errorPage: true,
    });
    return result.diagnostics.map((d) => ({ code: d.code, text: js.slice(d.span.start, d.span.end) }));
  }

  it('a load, a server function and paths are each FUD1010', () => {
    const js = `${HTTP}
export async function load() { return {}; }
export const save = put().handle(() => 1);
export function paths() { return []; }
export function layout() { return {}; }`;
    expect(errorPage(js)).toEqual([
      { code: 'FUD1010', text: 'save' },
      { code: 'FUD1010', text: 'load' },
      { code: 'FUD1010', text: 'paths' },
    ]);
  });

  it('a @server with none of them says nothing', () => {
    expect(errorPage(`import { x } from './x';\nconst n = x;`)).toEqual([]);
  });
});

describe('FUD1008: a component function reads only imports and other functions (§4.13)', () => {
  it('a @server variable that is not an import is FUD1008, at the read', () => {
    const src = component(`    ${HTTP}
    import { Users } from './users';
    const prefix = 'u-';
    let count = 0;
    function helper() { return 1; }
    class Repo {}
    export function exported() { return Repo; }
    const [first] = [1];
    const secured = put();
    export const save = secured.handle(() => Users.save(prefix + count + helper()));
    export const other = get().handle(() => [save, new Repo(), exported(), first]);`);
    const found = read(src).diagnostics.filter((d) => d.code === 'FUD1008').map((d) => src.slice(d.span.start, d.span.end));
    expect(found.sort()).toEqual(['Repo', 'count', 'exported', 'first', 'helper', 'prefix']);
  });

  it('a route reads anything: no FUD1008', () => {
    expect(
      codes(route(`    ${HTTP}\n    const prefix = 'u-';\n    export const save = put().handle(() => prefix);`)),
    ).toEqual([]);
  });

  it('a component function reading only imports, functions and the neutral zone is clean', () => {
    const src = component(
      `    ${HTTP}\n    import { Users } from './users';\n    export const a = get().handle(() => Users);\n    export const b = put().handle(() => a);`,
      "  import { userForm } from './user.form';",
    );
    expect(codes(src)).toEqual([]);
  });
});
