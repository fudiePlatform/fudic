/**
 * SDD-81 §3.7, decision 182 — `<input type="file">` and the field it binds, as the host describes
 * the linked forms (`LinkedApi.fields`). Criteria 29 (`FUD1484`–`FUD1486`) and 30 (`accept`
 * written from the rule when the author wrote none).
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import {
  apiDiagnostics,
  emitComponentClientModule,
  emitComponentModule,
  emitPageModule,
  emitRouteClientModule,
  emitRouteModuleMapped,
  entryComponent,
} from '../../src/emit/index.js';
import { fieldsOf } from '../../src/emit/file-fields.js';
import type { LinkedApi } from '../../src/types/io.js';
import { memoryIo } from './_support.js';

const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>';

const API: LinkedApi = {
  id: 'routes/r',
  load: false,
  paths: false,
  layout: false,
  functions: ['save'],
  forms: ['alta'],
  fields: {
    alta: {
      name: { type: 'str' },
      avatar: { type: 'file', accept: 'image/png, image/jpeg' },
      docs: { type: 'file[]' },
      'data.proof': { type: 'file' },
    },
  },
};

const COMPONENT = (body: string): string => `<link rel="server" href="./r.fudapi">
<app-f>
  <template shadowrootmode="open">
    <form control=@alta>${body}</form>
  </template>
</app-f>`;

function graphOf(body: string, api: LinkedApi | undefined = API) {
  const route = `<link rel="layout" href="./l.fud">
<link rel="server" href="./r.fudapi">
<link rel="component" href="./f.fud">
<form control=@alta form:=@save>${body}</form>
<app-f></app-f>`;
  const io = {
    ...memoryIo({ '/r.fud': route, '/l.fud': LAYOUT, '/f.fud': COMPONENT(body) }),
    api: (path: string) => (path === '/r.fudapi' ? api : undefined),
  };
  return resolveDocument('/r.fud', io).value;
}

/** The FUD148x of the route's own markup, with the text each one covers. */
function found(body: string): (readonly [string, string])[] {
  const graph = graphOf(body);
  return apiDiagnostics(graph)
    .filter((d) => d.code.startsWith('FUD148'))
    .map((d) => [d.code, graph.entrySource.slice(d.span.start, d.span.end)] as const);
}

describe('criterion 29: a file input and its field', () => {
  it('file to file, file[] to multiple: nothing to say', () => {
    expect(found('<input type="file" control=@alta.avatar><input type="file" multiple control=@alta.docs>')).toEqual([]);
    expect(found('<input type="file" control=@alta.data.proof>')).toEqual([]);
    expect(found('<input control=@alta.name>')).toEqual([]);
  });

  it('FUD1484: multiple on a file, over the attribute', () => {
    expect(found('<input type="file" multiple control=@alta.avatar>')).toEqual([['FUD1484', 'multiple']]);
  });

  it('FUD1485: a file[] without multiple, over the binding', () => {
    expect(found('<input type="file" control=@alta.docs>')).toEqual([['FUD1485', 'control=@alta.docs']]);
  });

  it('FUD1486: a file input on a str, and a text input on a file', () => {
    expect(found('<input type="file" control=@alta.name>')).toEqual([['FUD1486', 'control=@alta.name']]);
    expect(found('<input control=@alta.avatar>')).toEqual([['FUD1486', 'control=@alta.avatar']]);
    const graph = graphOf('<input control=@alta.avatar><input type="file" control=@alta.name>');
    expect(apiDiagnostics(graph).map((d) => d.message)).toEqual([
      'a `file` field needs `<input type="file">`: this control cannot choose a file',
      'a file input bound to something that is not a file: the field is `str`',
    ]);
  });

  it('silent where nothing is known: a node of no linked form, a dynamic type, a host that says nothing', () => {
    expect(found('<input type="file" control=@other.avatar><input type="@t" control=@alta.avatar><input control=@alta.ghost>')).toEqual([]);
    const blind = graphOf('<input type="file" control=@alta.name>', { ...API, fields: undefined } as unknown as LinkedApi);
    expect(apiDiagnostics(blind).filter((d) => d.code.startsWith('FUD148'))).toEqual([]);
  });
});

/** The component `/f.fud` compiled as its own entry, as the plugin compiles it: both branches. */
function component(body: string): { server: string; client: string; diagnostics: (readonly [string, string])[] } {
  const io = { ...memoryIo({ '/f.fud': COMPONENT(body) }), api: (path: string) => (path === '/r.fudapi' ? API : undefined) };
  const graph = resolveDocument('/f.fud', io).value;
  const comp = entryComponent(graph)!;
  return {
    server: emitComponentModule(graph, comp),
    client: emitComponentClientModule(graph, comp),
    diagnostics: apiDiagnostics(graph).map((d) => [d.code, graph.entrySource.slice(d.span.start, d.span.end)] as const),
  };
}

describe('criterion 30: accept written from the rule', () => {
  const ACCEPT = `'accept', "image/png, image/jpeg"`;

  it('on both branches of a component, when the author wrote none: the server paints it, the client fabricates it', () => {
    const { server, client, diagnostics } = component('<input type="file" control=@alta.avatar>');
    expect(server).toContain(ACCEPT);
    expect(client).toContain(ACCEPT);
    expect(client).toContain('bindFile(');
    expect(diagnostics).toEqual([]);
  });

  it('the diagnostics of a component speak of its own links too', () => {
    expect(component('<input type="file" multiple control=@alta.avatar>').diagnostics).toEqual([['FUD1484', 'multiple']]);
  });

  it("the author's own wins; a field with no accept rule gets none", () => {
    const own = component('<input type="file" accept=".png" control=@alta.avatar>');
    expect(own.server).not.toContain('image/jpeg');
    expect(own.client).not.toContain('image/jpeg');
    expect(component('<input type="file" control=@alta.data.proof>').server).not.toContain(`'accept'`);
  });

  it('a route links the same .fudapi: its client chunk binds the file input', () => {
    expect(emitRouteClientModule(graphOf('<input type="file" control=@alta.avatar>'), {})).toContain('bindFile(');
    expect(emitRouteModuleMapped(graphOf('<input type="file" control=@alta.avatar>'), {}).diagnostics).toEqual([]);
  });

  it('a route paints on the server what the compiler adds: its chunk adopts that markup and never fabricates it', () => {
    const { code } = emitRouteModuleMapped(graphOf('<input type="file" control=@alta.avatar><span error=@alta.avatar></span>'), {});
    expect(code).toContain(ACCEPT);
    expect(code).toContain(`'novalidate', ''`);
    expect(code).toContain(`'aria-describedby', "fud-e-alta-avatar"`);
    expect(code).toContain(`'id', "fud-e-alta-avatar"`);
  });

  it('and so does a page', () => {
    const page = `<!DOCTYPE html><html><head><link rel="server" href="./r.fudapi"></head><body><form control=@alta><input type="file" control=@alta.avatar></form></body></html>`;
    const io = { ...memoryIo({ '/p.fud': page }), api: (path: string) => (path === '/r.fudapi' ? API : undefined) };
    const code = emitPageModule(resolveDocument('/p.fud', io).value, {});
    expect(code).toContain(ACCEPT);
    expect(code).toContain(`'novalidate', ''`);
  });
});

describe('fieldsOf', () => {
  it('resolves a path from a linked form, and nothing else', () => {
    const field = fieldsOf([{ api: API } as never, { api: undefined } as never]);
    expect(field(' alta.avatar ')).toEqual({ type: 'file', accept: 'image/png, image/jpeg' });
    expect(field('alta')).toBeUndefined();
    expect(field('alta["avatar"]')).toBeUndefined();
    expect(field('other.avatar')).toBeUndefined();
  });
});
