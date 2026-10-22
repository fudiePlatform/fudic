/**
 * `<link rel="server">` (SDD-60 §3.14, criterion 24): a route, a component or a page links its
 * `.fudapi`, and what the file says reaches the view without an import.
 *
 * The compiler reads no contract: the host answers `io.api(path)` with the facts of the file
 * (`LinkedApi`). These tests are that host, in memory.
 */

import { describe, expect, it } from 'vitest';
import {
  apiDiagnostics,
  emitComponentClientModule,
  emitComponentModule,
  emitPageModuleMapped,
  emitRouteClientModule,
  entryComponent,
  emitRouteModuleMapped,
  resolveComponents,
  resolveDocument,
  type ResolveIo,
} from '../../src/emit/index.js';
import type { LinkedApi } from '../../src/types/io.js';
import { analyze } from '../../src/semantic/index.js';
import { memoryIo, parse } from './_support.js';
import { viewInput } from '../semantic/_view.js';

const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>';

const api = (over: Partial<LinkedApi> = {}): LinkedApi => ({
  id: 'routes/r',
  load: false,
  paths: false,
  layout: false,
  functions: [],
  forms: [],
  ...over,
});

/** A memory filesystem, plus the facts of each `.fudapi` by path. */
function ioOf(files: Record<string, string>, apis: Record<string, LinkedApi> = {}): ResolveIo {
  return { ...memoryIo({ '/l.fud': LAYOUT, ...files }), api: (path) => apis[path] };
}

const route = (links: string, code = '', body = '<p>x</p>'): string =>
  `<link rel="layout" href="./l.fud">\n${links}\n${code === '' ? '' : `@code {\n${code}\n}\n`}${body}\n`;

const component = (links: string, code = ''): string =>
  `${links}\n${code === '' ? '' : `@code {\n${code}\n}\n`}<x-c>\n  <template shadowrootmode="open"><p>x</p></template>\n</x-c>\n`;

const codes = (ds: readonly { readonly code: string }[]): string[] => ds.map((d) => d.code);

describe('the link, in the structure', () => {
  it('a route, a component and a page keep their server links', () => {
    expect(parse(route('<link rel="server" href="./r.fudapi">'))).toMatchObject({ serverLinks: [{ name: 'link' }] });
    expect(parse(component('<link rel="server" href="./c.fudapi">'))).toMatchObject({ serverLinks: [{ name: 'link' }] });
    const page = '<!DOCTYPE html><html><head><link rel="server" href="./p.fudapi"></head><body></body></html>';
    expect(parse(page)).toMatchObject({ type: 'page-document', serverLinks: [{ name: 'link' }] });
  });

  it('a file without one has no list at all', () => {
    expect(parse(route(''))).not.toHaveProperty('serverLinks');
  });

  it('FUD1111 over a link without `href`, or one that is not a `.fudapi`', () => {
    const missing = resolveDocument('/r.fud', ioOf({ '/r.fud': route('<link rel="server">') }));
    expect(codes(missing.diagnostics)).toEqual(['FUD1111']);
    expect(missing.diagnostics[0]!.message).toContain('needs an `href`');
    const wrong = resolveDocument('/r.fud', ioOf({ '/r.fud': route('<link rel="server" href="./r.ts">') }));
    expect(codes(wrong.diagnostics)).toEqual(['FUD1111']);
    expect(wrong.diagnostics[0]!.message).toContain('"./r.ts"');
    // Not followed: the host is never asked about a file that is not a contract.
    expect(wrong.value.serverApis).toEqual([]);
  });

  it('FUD1111 for a page link too', () => {
    const page = '<!DOCTYPE html><html><head><link rel="server"></head><body></body></html>';
    expect(codes(resolveDocument('/p.fud', ioOf({ '/p.fud': page })).diagnostics)).toEqual(['FUD1111']);
  });

  it('FUD1112 in a layout and in a snippet file, which link no server', () => {
    const layout =
      '<!DOCTYPE html><html><head><link rel="server" href="./l.fudapi">@RenderHead()</head><body>@RenderBody()</body></html>';
    const inLayout = resolveDocument('/l2.fud', ioOf({ '/l2.fud': layout }));
    expect(codes(inLayout.diagnostics)).toContain('FUD1112');
    const snippet = '<link rel="server" href="./s.fudapi">\n@snippet card(t: string) {\n  <p>@t</p>\n}\n';
    const doc = resolveDocument('/s.fud', ioOf({ '/s.fud': snippet }));
    expect(codes(doc.diagnostics)).toContain('FUD1112');
  });

  it('a server link nested in the markup is a misplaced framework link (FUD0438)', () => {
    const src = route('', '', '<div><link rel="server" href="./r.fudapi"></div>');
    expect(codes(resolveDocument('/r.fud', ioOf({ '/r.fud': src })).diagnostics)).toContain('FUD0438');
  });
});

describe('the link, in the graph', () => {
  it('follows the href to the host’s facts', () => {
    const facts = api({ load: true, route: '/r.fud' });
    const graph = resolveDocument('/r.fud', ioOf({ '/r.fud': route('<link rel="server" href="./r.fudapi">') }, { '/r.fudapi': facts }));
    expect(graph.diagnostics).toEqual([]);
    expect(graph.value.serverApis).toMatchObject([{ href: './r.fudapi', path: '/r.fudapi', api: facts }]);
  });

  it('a host that cannot know still lists the link, without facts', () => {
    const io = memoryIo({ '/l.fud': LAYOUT, '/r.fud': route('<link rel="server" href="./r.fudapi">') });
    const graph = resolveDocument('/r.fud', io);
    expect(graph.diagnostics).toEqual([]);
    expect(graph.value.serverApis).toHaveLength(1);
    expect(graph.value.serverApis[0]).not.toHaveProperty('api');
  });

  it('FUD1111 for a `.fudapi` the host does not have', () => {
    const graph = resolveDocument('/r.fud', ioOf({ '/r.fud': route('<link rel="server" href="./none.fudapi">') }));
    expect(codes(graph.diagnostics)).toEqual(['FUD1111']);
    expect(graph.diagnostics[0]!.message).toBe('"./none.fudapi" does not exist');
    expect(graph.value.serverApis).toEqual([]);
  });

  it.each(['load', 'paths', 'layout'] as const)('FUD1114: a component links a file with `%s`', (keyword) => {
    const graph = resolveDocument(
      '/c.fud',
      ioOf({ '/c.fud': component('<link rel="server" href="./r.fudapi">') }, { '/r.fudapi': api({ [keyword]: true }) }),
    );
    expect(codes(graph.diagnostics)).toEqual(['FUD1114']);
    expect(graph.diagnostics[0]!.message).toContain(keyword);
  });

  it('a component may link a file of functions', () => {
    const graph = resolveDocument(
      '/c.fud',
      ioOf({ '/c.fud': component('<link rel="server" href="./c.fudapi">') }, { '/c.fudapi': api({ functions: ['save'] }) }),
    );
    expect(graph.diagnostics).toEqual([]);
  });

  it('FUD1115: a route links the `load` of another route', () => {
    const graph = resolveDocument(
      '/r.fud',
      ioOf({ '/r.fud': route('<link rel="server" href="./o.fudapi">') }, { '/o.fudapi': api({ load: true, route: '/o.fud' }) }),
    );
    expect(codes(graph.diagnostics)).toEqual(['FUD1115']);
  });

  it('a route may link another file without `load`', () => {
    const graph = resolveDocument(
      '/r.fud',
      ioOf({ '/r.fud': route('<link rel="server" href="./o.fudapi">') }, { '/o.fudapi': api({ functions: ['f'] }) }),
    );
    expect(graph.diagnostics).toEqual([]);
  });
});

describe('what the links say together (apiDiagnostics)', () => {
  const graphOf = (src: string, apis: Record<string, LinkedApi>) => resolveDocument('/r.fud', ioOf({ '/r.fud': src }, apis)).value;

  it('FUD1113: two linked files give the same name', () => {
    const src = route('<link rel="server" href="./a.fudapi">\n<link rel="server" href="./b.fudapi">');
    const ds = apiDiagnostics(graphOf(src, { '/a.fudapi': api({ functions: ['save'] }), '/b.fudapi': api({ functions: ['save'] }) }));
    expect(codes(ds)).toEqual(['FUD1113']);
    expect(ds[0]!.message).toContain('"./a.fudapi"');
  });

  it('FUD1113: a function and a form of the same name are two things', () => {
    const src = route('<link rel="server" href="./a.fudapi">\n<link rel="server" href="./b.fudapi">');
    const ds = apiDiagnostics(graphOf(src, { '/a.fudapi': api({ functions: ['f'] }), '/b.fudapi': api({ forms: ['f'] }) }));
    expect(codes(ds)).toEqual(['FUD1113']);
  });

  it('the same form through two files is one form', () => {
    const src = route('<link rel="server" href="./a.fudapi">\n<link rel="server" href="./b.fudapi">');
    const ds = apiDiagnostics(graphOf(src, { '/a.fudapi': api({ forms: ['userForm'] }), '/b.fudapi': api({ forms: ['userForm'] }) }));
    expect(ds).toEqual([]);
  });

  it('FUD1113: the `@code` declares a name a linked file gives, `data` included', () => {
    const src = route('<link rel="server" href="./r.fudapi">', '  const data = 1;\n  function search() {}');
    const ds = apiDiagnostics(graphOf(src, { '/r.fudapi': api({ load: true, route: '/r.fud', functions: ['search'] }) }));
    expect(codes(ds)).toEqual(['FUD1113', 'FUD1113']);
    expect(ds[0]!.message).toContain('declared again in the `@code`');
  });

  it('`form:=` sends to a function of a linked file, and FUD1005 for one it does not give', () => {
    const body = (fn: string) => `<form control=@userForm form:="@${fn}"><button>ok</button></form>`;
    const facts = { '/r.fudapi': api({ functions: ['save'], forms: ['userForm'] }) };
    expect(apiDiagnostics(graphOf(route('<link rel="server" href="./r.fudapi">', '', body('save')), facts))).toEqual([]);
    const ds = apiDiagnostics(graphOf(route('<link rel="server" href="./r.fudapi">', '', body('other')), facts));
    expect(codes(ds)).toEqual(['FUD1005']);
  });

  it('a link nobody read says nothing: neither clashes nor `form:=`', () => {
    const io = memoryIo({
      '/l.fud': LAYOUT,
      '/r.fud': route('<link rel="server" href="./r.fudapi">', '  const save = 1;', '<form control=@f form:="@nope"><button>ok</button></form>'),
    });
    expect(apiDiagnostics(resolveDocument('/r.fud', io).value)).toEqual([]);
  });

  it('a file without links, and a layout, have nothing to check', () => {
    expect(apiDiagnostics(graphOf(route(''), {}))).toEqual([]);
    const layout = resolveDocument('/l.fud', ioOf({})).value;
    expect(apiDiagnostics({ ...layout, serverApis: [{ link: layout.entry as never, href: './x.fudapi', path: '/x.fudapi' }] })).toEqual([]);
  });

  it('a component and a page are checked like a route', () => {
    const c = resolveDocument('/c.fud', ioOf({ '/c.fud': component('<link rel="server" href="./c.fudapi">', '  const save = 1;') }, { '/c.fudapi': api({ functions: ['save'] }) }));
    expect(codes(apiDiagnostics(c.value))).toEqual(['FUD1113']);
    const page = '<!DOCTYPE html><html><head><link rel="server" href="./p.fudapi"></head><body></body></html>';
    const p = resolveDocument('/p.fud', ioOf({ '/p.fud': page }, { '/p.fudapi': api({ functions: ['f'] }) }));
    expect(apiDiagnostics(p.value)).toEqual([]);
  });

  it('`form:=` of a file with links is not checked against `@server` (no double FUD1005)', () => {
    const src = route(
      '<link rel="server" href="./r.fudapi">',
      '',
      '<form control=@userForm form:="@save"><button>ok</button></form>',
    );
    const graph = graphOf(src, { '/r.fudapi': api({ functions: ['save'], forms: ['userForm'] }) });
    const emitted = emitRouteModuleMapped(graph, {}).diagnostics;
    expect(codes(emitted)).not.toContain('FUD1005');
  });
});

describe('`data` and FUD0621 with a linked `load`', () => {
  const emitted = (facts: Record<string, LinkedApi>, withApi = true): string[] => {
    // A reactive route whose client half reads `data`: the case that sends it in `fud-data`.
    const src = route(
      '<link rel="server" href="./r.fudapi">',
      '  @client {\n    const n = signal(1);\n    function hi() { alert(data.user); }\n  }',
      '<output>@n()</output>',
    );
    const io = withApi ? ioOf({ '/r.fud': src }, facts) : memoryIo({ '/l.fud': LAYOUT, '/r.fud': src });
    return codes(emitRouteModuleMapped(resolveDocument('/r.fud', io).value, { routeName: 'ruta' }).diagnostics);
  };

  it('a linked file with `load` gives the route its `data`', () => {
    expect(emitted({ '/r.fudapi': api({ load: true, route: '/r.fud' }) })).not.toContain('FUD0621');
  });

  it('FUD0621 when no linked file declares `load`', () => {
    expect(emitted({ '/r.fudapi': api({ functions: ['f'] }) })).toContain('FUD0621');
  });

  it('a link nobody read is given the benefit', () => {
    expect(emitted({}, false)).not.toContain('FUD0621');
  });

  it('a page reached without the document graph has no links to look at', () => {
    const page =
      '<!DOCTYPE html><html><head>@code { @client { const n = signal(1); function hi() { alert(data.user); } } }</head>' +
      '<body><output>@n()</output></body></html>';
    const graph = resolveComponents('/p.fud', memoryIo({ '/p.fud': page }));
    expect(codes(emitPageModuleMapped(graph, { routeName: 'p' }).diagnostics)).toContain('FUD0621');
  });
});

describe('the names a link brings into the view (SDD-51 scope)', () => {
  const view = (source: string, apis?: { data: boolean; names: ReadonlySet<string> }): string[] => {
    const input = viewInput(source);
    return codes(analyze(apis === undefined ? input : { ...input, apis }).diagnostics).filter((c) => c === 'FUD0907');
  };
  const src = route('<link rel="server" href="./r.fudapi">', '', '<p>@(data.n)</p><p>@(search)</p><p>@(person)</p>');

  it('functions and forms resolve without an import, and `data` when the file declares `load`', () => {
    expect(view(src, { data: true, names: new Set(['search', 'person']) })).toEqual([]);
  });

  it('without `load` there is no `data`', () => {
    expect(view(src, { data: false, names: new Set(['search', 'person']) })).toEqual(['FUD0907']);
  });

  it('a layout always reads the route’s `data`', () => {
    const layout = '<!DOCTYPE html><html><head>@RenderHead()</head><body><p>@(data.n)</p>@RenderBody()</body></html>';
    expect(view(layout, { data: false, names: new Set() })).toEqual([]);
  });

  it('a caller that cannot know keeps the rule of the role', () => {
    expect(view(route('', '', '<p>@(data.n)</p>'))).toEqual([]);
  });
});

describe('the names a link brings into the browser (SDD-60 §3.14, §4.3)', () => {
  const reactive = (links: string): string =>
    route(links, 'import { signal } from "@fudic/core";\nconst n = signal(0);', '<button @click=@(n.set(n() + 1))>@n()</button>');

  it('a route imports its functions and forms from the browser variant of `fudic:<id>`, once each', () => {
    const io = ioOf(
      { '/r.fud': reactive('<link rel="server" href="./r.fudapi">\n<link rel="server" href="./o.fudapi">\n<link rel="server" href="./n.fudapi">') },
      {
        '/r.fudapi': api({ load: true, route: '/r.fud', functions: ['search', 'save'], forms: ['person'] }),
        '/o.fudapi': api({ id: 'forms/person', forms: ['person'] }),
        '/n.fudapi': api({ id: 'forms/none' }),
      },
    );
    const code = emitRouteClientModule(resolveDocument('/r.fud', io).value)!;
    expect(code).toContain('import { search, save, person } from "fudic:routes/r";');
    expect(code).not.toContain('fudic:forms/person');
    expect(code).not.toContain('fudic:forms/none');
  });

  it('a link nobody read gives the browser nothing', () => {
    const io = memoryIo({ '/l.fud': LAYOUT, '/r.fud': reactive('<link rel="server" href="./r.fudapi">') });
    expect(emitRouteClientModule(resolveDocument('/r.fud', io).value)!).not.toContain('fudic:');
  });

  it('a component imports them as well', () => {
    const io = ioOf(
      { '/c.fud': component('<link rel="server" href="./c.fudapi">', 'import { signal } from "@fudic/core";\nconst n = signal(0);') },
      { '/c.fudapi': api({ id: 'components/c', functions: ['save'] }) },
    );
    const graph = resolveDocument('/c.fud', io).value;
    expect(emitComponentClientModule(graph, entryComponent(graph)!)).toContain('import { save } from "fudic:components/c";');
  });

  it('and the render module of the server imports them too: a route, a page and a component', () => {
    const facts = { '/r.fudapi': api({ load: true, route: '/r.fud', functions: ['save'], forms: ['person'] }) };
    const routeCode = emitRouteModuleMapped(resolveDocument('/r.fud', ioOf({ '/r.fud': route('<link rel="server" href="./r.fudapi">') }, facts)).value).code;
    expect(routeCode).toContain('import { save, person } from "fudic:routes/r";');
    const page = '<!DOCTYPE html><html><head><link rel="server" href="./r.fudapi"></head><body><p>x</p></body></html>';
    const pageCode = emitPageModuleMapped(resolveDocument('/p.fud', ioOf({ '/p.fud': page }, facts)).value).code;
    expect(pageCode).toContain('import { save, person } from "fudic:routes/r";');
    const io = ioOf({ '/c.fud': component('<link rel="server" href="./c.fudapi">') }, { '/c.fudapi': api({ id: 'components/c', functions: ['save'] }) });
    const graph = resolveDocument('/c.fud', io).value;
    expect(emitComponentModule(graph, entryComponent(graph)!)).toContain('import { save } from "fudic:components/c";');
  });

  it('a route path spelled with the other slashes is still the route of its own `load`', () => {
    const graph = resolveDocument(
      '/r.fud',
      ioOf({ '/r.fud': route('<link rel="server" href="./r.fudapi">') }, { '/r.fudapi': api({ load: true, route: '\\r.fud' }) }),
    );
    expect(graph.diagnostics).toEqual([]);
  });
});
