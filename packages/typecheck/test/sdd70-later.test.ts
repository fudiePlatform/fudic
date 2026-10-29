/**
 * SDD-70 — the `later` fields of a linked `.fudapi`, read by the host (`FudIndex.server`) and handed
 * to the semantic pass (`apisOf`), so the editor and the build say FUD1320 and FUD1321 with the
 * fields the contract really marks (criteria 4, 5).
 */

import { describe, expect, it } from 'vitest';
import { fudicDiagnostics } from '../src/index.js';
import { indexOf, LAYOUT, projected } from './_support.js';

const ROUTE = '/p/src/routes/r.fud';
const API = 'load\n  title  str\n  users  Person[]  later\n  stats  map str i32  later\n\ntype Person\n  id  i32\n';

const route = (body: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./r.fudapi">\n<article>\n${body}\n</article>\n`;

describe('FudIndex.server — the later fields of a linked .fudapi (SDD-70)', () => {
  it('in declaration order, each with its type as the contract writes it', () => {
    const index = indexOf({ '/p/src/routes/r.fudapi': API });
    expect(index.server(ROUTE, './r.fudapi')?.later).toEqual([
      { name: 'users', type: 'Person[]' },
      { name: 'stats', type: 'map str i32' },
    ]);
  });

  it('none when no field of load is later', () => {
    const index = indexOf({ '/p/src/routes/r.fudapi': 'load\n  title  str\n' });
    expect(index.server(ROUTE, './r.fudapi')).not.toHaveProperty('later');
  });
});

describe('the semantic pass hears of them (criteria 4, 5)', () => {
  const on = (body: string, api = API): readonly string[] => {
    const source = route(body);
    const { index, document } = projected(ROUTE, source, { '/p/src/routes/r.fudapi': api, '/p/src/layouts/_layout.fud': LAYOUT });
    return fudicDiagnostics(document, index)
      .filter((d) => /^FUD132[01]$/u.test(d.code))
      .map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
  };

  it('an `@await` of a later field, read inside, says nothing', () => {
    expect(on('@await data.users { <p>@data.users</p> }')).toEqual([]);
  });

  it('an `@await` of a field that is not later is FUD1320', () => {
    expect(on('@await data.title { }')).toEqual(['FUD1320 data.title']);
  });

  it('a later field read outside its `@await` is FUD1321', () => {
    expect(on('<p>@data.stats</p>')).toEqual(['FUD1321 data.stats']);
  });

  it('a contract with no later field: every `@await` of data is FUD1320, and no read is FUD1321', () => {
    expect(on('@await data.users { } <p>@data.users</p>', 'load\n  users  str\n')).toEqual(['FUD1320 data.users']);
  });
});
