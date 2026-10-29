/**
 * SDD-70 criteria 3–6 — the `await` analyzer: FUD1320 (not a `later` field of `data`), FUD1321
 * (a `later` field read outside its `@await`) and FUD1322 (an `@await` where nothing waits), each
 * on its exact span.
 */

import { describe, expect, it } from 'vitest';
import type { SemanticInput } from '../../src/semantic/index.js';
import { viewDiagnostics } from './_view.js';

const OWN = /^FUD132[0-2]$/u;

/** What the host says when the route links a `.fudapi` whose `users` and `stats` are `later`. */
const LATER: SemanticInput['apis'] = { data: true, names: new Set(), later: new Set(['users', 'stats']) };

const route = (body: string): string => `<link rel="layout" href="./_layout.fud">\n${body}\n`;

/** A host that cannot say which fields are `later`: no `apis` at all. */
const BLIND = 'blind';

/** The codes of the analyzer over `source`, `CODE text` each, in source order. */
function codes(source: string, apis: SemanticInput['apis'] | typeof BLIND = LATER): readonly string[] {
  return viewDiagnostics(source, apis === BLIND ? undefined : apis)
    .filter((d) => OWN.test(d.code))
    .sort((a, b) => a.span.start - b.span.start)
    .map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
}

describe('criterion 3 — an `@await` of a `later` field, with its catch, says nothing', () => {
  it('reading the field inside its body, by its own name', () => {
    expect(
      codes(route('<article>@await data.users { <p>@data.users.length @data.title</p> } @catch (e) { <p>@e.status</p> }</article>')),
    ).toEqual([]);
  });

  it('and each of two fields in its own `@await`', () => {
    expect(codes(route('@await data.users { <p>@data.users</p> }\n@await data.stats { <p>@data.stats</p> }'))).toEqual([]);
  });
});

describe('criterion 4 — what follows `@await` is not a `later` field of data: FUD1320 on the expression', () => {
  it('a field without `later`, a call, any other shape', () => {
    expect(codes(route('@await data.title { }'))).toEqual(['FUD1320 data.title']);
    expect(codes(route('@await signal() { }'))).toEqual(['FUD1320 signal()']);
    expect(codes(route('@await fetchX() { }'))).toEqual(['FUD1320 fetchX()']);
    expect(codes(route('@await data.users.items { }'))).toEqual(['FUD1320 data.users.items']);
  });

  it('a `.fudapi` with no `later` field: every field is one that is already there', () => {
    expect(codes(route('@await data.users { }'), { data: true, names: new Set() })).toEqual(['FUD1320 data.users']);
  });

  it('a host that cannot say which fields are `later` checks the shape alone', () => {
    expect(codes(route('@await data.title { <p>@data.title</p> }'), BLIND)).toEqual([]);
    expect(codes(route('@await signal() { }'), BLIND)).toEqual(['FUD1320 signal()']);
  });
});

describe('criterion 5 — a `later` field read outside its `@await`: FUD1321 on the read', () => {
  it('in the markup, and as the value of a prop of a component', () => {
    expect(codes(route('<p>@data.users</p>'))).toEqual(['FUD1321 data.users']);
    expect(codes(route('<x-list .rows=@data.users></x-list>'))).toEqual(['FUD1321 data.users']);
  });

  it('names the field in its message', () => {
    const [found] = viewDiagnostics(route('<p>@data.stats</p>'), LATER).filter((d) => d.code === 'FUD1321');
    expect(found?.message).toContain('stats');
  });

  it('inside the `@await` of another field, and inside the catch', () => {
    expect(codes(route('@await data.stats { <p>@data.users</p> }'))).toEqual(['FUD1321 data.users']);
    expect(codes(route('@await data.users { } @catch (e) { <p>@data.users</p> }'))).toEqual(['FUD1321 data.users']);
  });

  it('nothing for a field without `later`, a computed read, or a `data` the template declares', () => {
    expect(codes(route('<p>@data.title @(data["users"])</p>'))).toEqual([]);
    expect(codes(route('<div>@{ let data = { users: 1 }; }<p>@data.users</p></div>'))).toEqual([]);
  });

  it('nothing when the host cannot say, or no field is `later`', () => {
    expect(codes(route('<p>@data.users</p>'), BLIND)).toEqual([]);
    expect(codes(route('<p>@data.users</p>'), { data: true, names: new Set(), later: new Set() })).toEqual([]);
  });

  it('an `@await` of a shape that is not a field waits for nothing: its body reads the promise', () => {
    expect(codes(route('@await signal() { <p>@data.users</p> }'))).toEqual(['FUD1320 signal()', 'FUD1321 data.users']);
  });
});

const LAYOUT = `<!DOCTYPE html>
<html>
  <head>
    @RenderHead()
  </head>
  <body>
    BODY
    <main>@RenderBody()</main>
  </body>
</html>
`;

const page = (head: string, body: string, rest = ''): string =>
  `<!DOCTYPE html>\n<html>\n  <head>\n    <title>t</title>\n    ${head}\n  </head>\n  <body>\n    ${body}\n  </body>\n</html>\n${rest}`;

describe('criterion 6 — an `@await` where nothing waits: FUD1322 on the keyword', () => {
  const AWAIT = '@await data.users { <p>x</p> }';

  it('in the `<head>` of a route', () => {
    expect(codes(route(`<head>\n  <title>t</title>\n  ${AWAIT}\n</head>\n<article></article>`))).toEqual(['FUD1322 @await']);
  });

  it('in the body of a snippet of a route', () => {
    expect(codes(route(`@snippet row() { ${AWAIT} }\n<article>@render row()</article>`))).toEqual(['FUD1322 @await']);
  });

  it('in a component', () => {
    expect(codes(`<x-a><template shadowrootmode="open">${AWAIT}</template></x-a>`)).toEqual(['FUD1322 @await']);
  });

  it('in a layout', () => {
    expect(codes(LAYOUT.replace('BODY', AWAIT))).toEqual(['FUD1322 @await']);
  });

  it('in the `<head>` of a page and in the body of a snippet of a page', () => {
    expect(codes(page(AWAIT, '<p>b</p>'))).toEqual(['FUD1322 @await']);
    // A page declares its snippets in its `<head>` (decisions 59, 60).
    expect(codes(page(`@snippet row() { ${AWAIT} }`, '<p>@render row()</p>'))).toEqual(['FUD1322 @await']);
  });

  it('compiles in the body of a page, of a route, and in a `@section` of a route', () => {
    expect(codes(page('', AWAIT))).toEqual([]);
    expect(codes(route(`<head><title>t</title></head>\n<article>${AWAIT}</article>`))).toEqual([]);
    expect(codes(route(`@section nav { ${AWAIT} }\n<article></article>`))).toEqual([]);
  });

  it('a misplaced one that also waits for the wrong thing says both', () => {
    expect(codes(`<x-a><template shadowrootmode="open">@await data.title { }</template></x-a>`)).toEqual([
      'FUD1322 @await',
      'FUD1320 data.title',
    ]);
  });
});
