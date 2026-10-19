/**
 * SDD-56 §4.16 in the editor: what the projection says about server functions, checked by the
 * real TypeScript over the corpus, with `@fudic/http` and `@fudic/di` resolved from their
 * `dist` as an app has them installed.
 *
 *  - In the `@client` and in an event expression, `search` is the `ServerFunction<A, R>` its
 *    builder says, and going to its definition lands on its `export const` (criterion 39).
 *  - In `handle`, `ctx` carries what its `.use` added and nothing else (criterion 40).
 *  - An untyped `load(ctx)` receives the `ServerContext` of a GET, with the file's params.
 *  - `inject` and `publish` on their own in a route's `@server` are no error (task 45).
 *  - `_error.fud` has `data` without a `load`: the problem it paints.
 */
import { describe, expect, it } from 'vitest';
import { JsBatch } from '@fudic/compiler';
import { partitionCode } from '../src/code.js';
import { emitVirtualFiles } from '../src/emit.js';
import { mapToGenerated, mapToSource } from '../src/mapping.js';
import { parseFud, registryOf } from './_support.js';
import { languageServiceFor, projectCorpus, typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

const PAGE = 'users/[team].fud';

/** A route with two server functions, an untyped `load` and both callers of `search`. */
function page({
  client = `return await search({ q: 'ada' });`,
  event = `search({ q: 'ada' })`,
  me = `get().use(auth).handle((ctx) => ctx.user.name)`,
  load = `return { team: ctx.params.team, session: ctx.cookies.get('sid') };`,
}: { client?: string; event?: string; me?: string; load?: string } = {}): string {
  return `<link rel="layout" href="../layouts/_layout.fud">

@code {
  type User = { readonly name: string };

  @server {
    import { get, middleware } from '@fudic/http';
    import { inject, publish, token } from '@fudic/di';

    const auth = middleware<{ readonly user: User }>();
    const Clock = token<() => number>('clock');
    const Seen = token<number>('seen');

    export const search = get().args<{ q: string }>().handle(async (ctx) => [{ name: ctx.args.q }] as User[]);
    export const me = ${me};

    export function load(ctx) {
      publish(Seen, inject(Clock)());
      ${load}
    }
  }

  @client {
    async function find(): Promise<User[]> {
      ${client}
    }
  }
}

<p>@data.team</p>
<button @click="@(() => ${event})">go</button>
`;
}

/** The checker's complaints about one file of the corpus. */
function diagnosticsOf(path: string, source: string): readonly CorpusDiagnostic[] {
  return typecheckCorpus({ [path]: source }).filter((d) => d.fud === path);
}

describe('a server function from the browser side (criterion 39)', () => {
  it('a route that calls its functions as they are typed says nothing', () => {
    // `inject` and `publish` on their own in `load` are part of it: task 45.
    expect(diagnosticsOf(PAGE, page())).toEqual([]);
  });

  it('in the @client, `search` is ServerFunction<{ q: string }, User[]>', () => {
    const source = page();
    const virtual = projectCorpus({ [PAGE]: source }).find((p) => p.file.path === PAGE)!.virtuals[0]!;
    const { service, pathOf } = languageServiceFor({ [PAGE]: source });

    const at = mapToGenerated(virtual, source.indexOf("search({ q: 'ada' })"), 'navigation');
    expect(at).toBeDefined();
    const info = service.getQuickInfoAtPosition(pathOf(virtual.fileName), at!);
    const shown = (info?.displayParts ?? []).map((p) => p.text).join('').replace(/\s+/gu, ' ');

    // The hover spells out the interface's call signature: `A` and `R`, as the builder said.
    expect(shown).toBe(
      'const search: $ServerFunction (args: { q: string; }, options?: CallOptions | undefined) => Promise<User[]>',
    );
  });

  it('in the @client, `search({ q: 1 })` is a type error on the argument', () => {
    const diags = diagnosticsOf(PAGE, page({ client: 'return await search({ q: 1 });' }));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2322);
    expect(diags[0]!.virtual).toBe('users/[team].fud.ts');
    expect(diags[0]!.sourceText).toBe('q');
  });

  it('in an event expression, `search({ q: 1 })` is the same type error', () => {
    const source = page({ event: 'search({ q: 1 })' });
    const diags = diagnosticsOf(PAGE, source);

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2322);
    expect(diags[0]!.sourceOffset).toBe(source.indexOf('q: 1'));
  });

  it('a function that takes no arguments is called with none, and its result is typed', () => {
    const diags = diagnosticsOf(PAGE, page({ client: `const name: number = await me(); return [];` }));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2322);
    expect(diags[0]!.sourceText).toBe('name');
  });

  it('going to the definition of a call lands on its `export const`', () => {
    const source = page();
    const virtual = projectCorpus({ [PAGE]: source }).find((p) => p.file.path === PAGE)!.virtuals[0]!;
    const { service, pathOf } = languageServiceFor({ [PAGE]: source });

    const at = mapToGenerated(virtual, source.indexOf("search({ q: 'ada' })"), 'navigation');
    const definitions = service.getDefinitionAtPosition(pathOf(virtual.fileName), at!) ?? [];
    const homes = definitions
      .filter((d) => d.fileName === pathOf(virtual.fileName))
      .map((d) => mapToSource(virtual, d.textSpan.start, 'navigation'));

    expect(homes).toEqual([source.indexOf('export const search') + 'export const '.length]);
  });
});

describe('which names the browser side is given', () => {
  /** The client virtual of `source`, from a caller that registered only the `@server` regions. */
  function clientOf(source: string): string {
    const document = parseFud(source);
    const batch = new JsBatch(source);
    const server = partitionCode(document.code).server.map((chunk) => batch.add('module-statements', chunk));
    return emitVirtualFiles({
      source,
      fileName: PAGE,
      document,
      registry: registryOf({}, '../layouts/_layout.fud'),
      js: { result: batch.parse().value, neutral: [], server },
    })[0]!.text;
  }

  it('every function but `load`, with no `@client` registered', () => {
    const out = clientOf(page());
    expect(out).toContain(`declare const search: $Callable<$ServerModule['search']>;`);
    expect(out).toContain(`declare const me: $Callable<$ServerModule['me']>;`);
    expect(out).not.toContain(`$ServerModule['load']`);
  });

  it('nothing at all for a `@server` with no function', () => {
    const out = clientOf('<link rel="layout" href="../layouts/_layout.fud">\n@code {\n  @server {\n    export function load() { return {}; }\n  }\n}\n<p>hola</p>\n');
    expect(out).not.toContain('$Callable');
    expect(out).not.toContain('@fudic/http');
  });
});

describe('`ctx` in a handle carries what its .use added (criterion 40)', () => {
  it('with .use(auth), `ctx.user` is a User', () => {
    const diags = diagnosticsOf(PAGE, page({ me: `get().use(auth).handle((ctx) => { const n: number = ctx.user.name; return n; })` }));

    // A `User`, and so its `name` is a string.
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2322);
    expect(diags[0]!.sourceText).toBe('n');
  });

  it('without .use(auth), `ctx.user` does not exist', () => {
    const diags = diagnosticsOf(PAGE, page({ me: `get().handle((ctx) => ctx.user.name)` }));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2339);
    expect(diags[0]!.virtual).toBe('users/[team].fud.server.ts');
    expect(diags[0]!.sourceText).toBe('user');
  });
});

describe('an untyped load(ctx) receives the ServerContext of a GET (§4.16)', () => {
  it('its params are the file name’s: another one is an error', () => {
    const diags = diagnosticsOf(PAGE, page({ load: 'return { team: ctx.params.slug };' }));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2339);
    expect(diags[0]!.sourceText).toBe('slug');
  });

  it('a page with a [slug] reads ctx.params.slug and ctx.cookies', () => {
    const path = 'blog/[slug]/edit.fud';
    const source = `<link rel="layout" href="../../layouts/_layout.fud">

@code {
  @server {
    export const load = async (ctx) => ({ slug: ctx.params.slug, sid: ctx.cookies.get('sid') ?? '' });
  }
}

<p>@data.slug @data.sid</p>
`;
    expect(diagnosticsOf(path, source)).toEqual([]);
  });

  it('while `ctx.` is half written, it still completes to what a GET carries', () => {
    // The region does not parse: the point past `ctx` is read off the text.
    const source = page({ load: 'ctx.' });
    const server = projectCorpus({ [PAGE]: source }).find((p) => p.file.path === PAGE)!.virtuals[1]!;
    expect(server.text).toContain(`export function load(ctx: $LoadContext<'team'>) {`);

    const { service, pathOf } = languageServiceFor({ [PAGE]: source });
    const at = mapToGenerated(server, source.indexOf('ctx.\n') + 'ctx.'.length, 'completion');
    const names = (service.getCompletionsAtPosition(pathOf(server.fileName), at!, {})?.entries ?? []).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['params', 'cookies', 'headers', 'response']));
  });

  it('a `ctx` the author typed is left as written', () => {
    // Their type has no `cookies`, and nothing was spliced in to add it.
    const source = page().replace('load(ctx)', 'load(ctx: { readonly params: { readonly team: string } })');
    const diags = diagnosticsOf(PAGE, source);

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2339);
    expect(diags[0]!.sourceText).toBe('cookies');
  });
});

describe('_error.fud paints the problem (§3.6)', () => {
  const ERROR = 'users/_error.fud';
  const error = (body: string): string => `<link rel="layout" href="../layouts/_layout.fud">

${body}
`;

  it('`@data.status`, `@data.title` and `@data.detail` are its data', () => {
    expect(diagnosticsOf(ERROR, error('<h1>@data.status @data.title</h1><p>@data.detail</p>'))).toEqual([]);
  });

  it('anything else is not', () => {
    const diags = diagnosticsOf(ERROR, error('<p>@data.stack</p>'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2339);
    expect(diags[0]!.sourceText).toBe('stack');
  });

  /** The hover TypeScript shows at `needle` in the `_error.fud`, and its documentation. */
  function hoverAt(source: string, needle: string): { shown: string; docs: string } {
    const virtual = projectCorpus({ [ERROR]: source }).find((p) => p.file.path === ERROR)!.virtuals[0]!;
    const { service, pathOf } = languageServiceFor({ [ERROR]: source });
    const at = mapToGenerated(virtual, source.indexOf(needle), 'navigation');
    expect(at).toBeDefined();
    const info = service.getQuickInfoAtPosition(pathOf(virtual.fileName), at!);
    const text = (parts: readonly { text: string }[] | undefined) => (parts ?? []).map((p) => p.text).join('');
    return { shown: text(info?.displayParts).replace(/\s+/gu, ' '), docs: text(info?.documentation) };
  }

  it('the hover over `data` names its type, `ErrorPage`, and says who paints it (BUG-51)', () => {
    const { shown, docs } = hoverAt(error('<h1>@data.status</h1>'), 'data.status');

    expect(shown).toBe('const data: ErrorPage');
    expect(docs).toContain('`_error.fud` has no `load`');
    expect(docs).toContain('`ErrorPage` of `@fudic/http`');
  });

  it('and over each field, what it holds', () => {
    const source = error('<h1>@data.status @data.title</h1><p>@data.detail</p>');

    expect(hoverAt(source, 'status').docs).toBe('The HTTP status: 404, 401, 500…');
    expect(hoverAt(source, 'title').docs).toBe('The standard name of the status: `Not Found`.');
    expect(hoverAt(source, 'detail').shown).toBe('(property) ErrorPage.detail?: string | undefined');
    expect(hoverAt(source, 'detail').docs).toBe("What the server said, when it said something: `notFound('no such user')`.");
  });
});
