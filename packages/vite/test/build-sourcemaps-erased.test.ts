/**
 * BUG-47 in a real `vite build` with `sourcemap: true` and a Service Worker.
 *
 * - Criterion 4: no client map carries the text of a module the erasure changed — a middleware
 *   with its `.server(…)` half, a form with its `serverValidator` — its entry is `null` and its
 *   `sources` still names it. A module with nothing erased keeps its text.
 * - Criterion 9: `import { Tokens, type User }` with `Tokens` used only in `.server(…)` leaves
 *   `import type`, and the client never loads `tokens.ts`.
 * - Criterion 10: the Service Worker's linked chunk of a page that imports that form erases it
 *   too, and its map drops the form's text.
 *
 * `verbatimModuleSyntax`, as `examples/basic`: without it the TS strip elides what the erasure
 * left behind and the defects cannot be seen.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const TOKENS = `import { Service } from '@fudic/di';

export interface User {
  readonly name: string;
}

const KNOWN: Record<string, User> = { TOKENS_TABLE_MARK: { name: 'ana' } };

export class Tokens {
  verify(token: string): User {
    const user = KNOWN[token];
    if (user === undefined) throw new Error('token desconocido');
    return user;
  }
}
Service(Tokens);
`;

const AUTH = `import { middleware } from '@fudic/http';
import { Tokens, type User } from '../services/tokens';

export const auth = middleware<{ user: User }>()
  .client((ctx, next) => {
    ctx.headers.set('x-user', 'CLIENT_HALF_MARK');
    return next(ctx);
  })
  .server((ctx, next) => next(Object.assign(ctx, { user: new Tokens().verify('SERVER_HALF_MARK') })));
`;

const ALIASES = `export const ALIAS_TABLE = 'ALIAS_TABLE_MARK';

export async function aliasTaken(alias: string): Promise<boolean> {
  return Promise.resolve(alias === ALIAS_TABLE);
}
`;

const FORM = `import { control, form, serverValidator } from '@fudic/forms';
import { aliasTaken } from '../data/aliases';

export const personForm = form({
  alias: control('ana', [serverValidator(async (v) => ((await aliasTaken(String(v))) ? { taken: true } : null))]),
});
`;

/** A client module with nothing to erase: its text stays in the map. */
const PLAIN = `export const greeting = (): string => 'PLAIN_TEXT_MARK';
`;

const PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Personas</title>
@code {
  import { personForm } from '../forms/person.form';
  @server {
    import { get } from '@fudic/http';
    import { auth } from '../middlewares/auth';
    export const who = get().use(auth).handle((ctx) => ctx.user.name);
  }
  @client {
    import { signal } from '@fudic/core';
    import { greeting } from '../plain';
    const n = signal(0);
    function bump(): void { n.set(n() + greeting().length); }
  }
}
</head>
<body><p>@personForm.alias()</p><button @click=@bump>@n()</button></body>
</html>
`;

/** Every file under `dir`, recursively, with its text. */
function filesUnder(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [{ path, text: readFileSync(path, 'utf8') }];
  });
}

interface Map3 {
  readonly sources: readonly string[];
  readonly sourcesContent?: readonly (string | null)[];
}

/** Every `(map file, source, content)` of the client maps whose source ends with `suffix`. */
function entries(maps: readonly { path: string; map: Map3 }[], suffix: string) {
  return maps.flatMap(({ path, map }) =>
    map.sources.flatMap((source, i) => (source.endsWith(suffix) ? [{ path, source, content: map.sourcesContent?.[i] }] : [])),
  );
}

let dist: { path: string; text: string }[];
let maps: { path: string; map: Map3 }[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-erased-maps-'));
  writeHttpTypecheckConfig(root, { module: 'esnext', moduleResolution: 'bundler', verbatimModuleSyntax: true });
  const files: Record<string, string> = {
    'src/services/tokens.ts': TOKENS,
    'src/middlewares/auth.ts': AUTH,
    'src/data/aliases.ts': ALIASES,
    'src/forms/person.form.ts': FORM,
    'src/plain.ts': PLAIN,
    'src/routes/personas.fud': PAGE,
    'sw.json': JSON.stringify({ shell: [] }),
    'fudic.json': JSON.stringify({ id: 'erased' }),
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  await build({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic()],
    build: { minify: false, sourcemap: true },
  });
  dist = filesUnder(join(root, 'dist'));
  maps = dist.filter((f) => f.path.endsWith('.map')).map((f) => ({ path: f.path, map: JSON.parse(f.text) as Map3 }));
}, 240000);

const swChunk = /[\\/]sw[\\/]c[\\/]personas-[^\\/]+\.js$/u;

describe('criterion 4: the client maps', () => {
  it('the middleware and the form are named in `sources`, with a null text', () => {
    for (const suffix of ['middlewares/auth.ts', 'forms/person.form.ts']) {
      const found = entries(maps, suffix);
      expect(found.length, suffix).toBeGreaterThan(0);
      for (const entry of found) expect(entry.content, `${entry.source} in ${entry.path}`).toBeNull();
    }
  });

  it('a module with nothing erased keeps its text', () => {
    const found = entries(maps, 'src/plain.ts');
    expect(found.length).toBeGreaterThan(0);
    for (const entry of found) expect(entry.content).toContain('PLAIN_TEXT_MARK');
  });

  it('no map carries a word of what was erased, nor of what only it reached', () => {
    for (const { path, map } of maps) {
      const text = JSON.stringify(map.sourcesContent ?? []);
      for (const mark of ['SERVER_HALF_MARK', 'token desconocido', 'TOKENS_TABLE_MARK', 'ALIAS_TABLE_MARK']) {
        expect(text, `${mark} in ${path}`).not.toContain(mark);
      }
    }
  });
});

describe('criterion 9: only types left from tokens.ts', () => {
  it('the client JS never loads tokens.ts, not even as a bare import', () => {
    const js = dist.filter((f) => f.path.endsWith('.js'));
    expect(js.some((f) => f.text.includes('CLIENT_HALF_MARK'))).toBe(true);
    for (const file of js) {
      for (const mark of ['services/tokens', 'token desconocido', 'TOKENS_TABLE_MARK', 'Service(Tokens)']) {
        expect(file.text, `${mark} in ${file.path}`).not.toContain(mark);
      }
    }
  });
});

describe('criterion 10: the Service Worker chunk of the page', () => {
  it('is there, and carries nothing the server validator only used', () => {
    const chunk = dist.find((f) => swChunk.test(f.path));
    expect(chunk, 'dist/sw/c/personas-*.js').toBeDefined();
    expect(chunk!.text).not.toContain('ALIAS_TABLE_MARK');
    expect(chunk!.text).not.toContain('aliasTaken');
  });

  it('its map names the form with a null text', () => {
    const own = maps.filter((m) => swChunk.test(m.path.slice(0, -'.map'.length)));
    expect(own).toHaveLength(1);
    const found = entries(own, 'forms/person.form.ts');
    expect(found.length).toBeGreaterThan(0);
    for (const entry of found) expect(entry.content).toBeNull();
  });
});
