/**
 * `callFunction` and `listRoutes` (SDD-78 §4.2, §4.3): a function called, and the concrete URLs
 * listed, by the project's own vitest. The project is `call-project/`, a folder no other test file
 * runs in; the dev server that answers the call is a node:http server of this test, which only has
 * to answer as one would.
 */

import { existsSync, readdirSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { RENDER_DIR, callFunction, callSource, listRoutes, routesSource } from '../src/render-run.js';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const CALLS = at('./call-project/');
const SLOW = 120_000;

function leftBehind(root: string): readonly string[] {
  const dir = `${root}${RENDER_DIR}`;
  return existsSync(dir) ? readdirSync(dir) : [];
}

describe('the test files', () => {
  test('a call: the function of the module of its id, with what was given', () => {
    expect(
      callSource(
        { root: '/p', id: 'routes/tags/[tag]', name: 'like', args: { a: 1 }, params: { tag: 'uno' }, origin: 'http://127.0.0.1:4318', headers: { cookie: 'c=1' } },
        'C:\\p\\.fudic\\render\\1.json',
      ),
    ).toBe(
      [
        "import { writeFileSync } from 'node:fs';",
        "import { test } from 'vitest';",
        "import { callJob } from '@fudic/testing/render';",
        'import * as api from "fudic:routes/tags/[tag]";',
        '',
        "test('fudic call', async () => {",
        '  writeFileSync("C:/p/.fudic/render/1.json", JSON.stringify(await callJob({ fn: api["like"], origin: "http://127.0.0.1:4318", args: {"a":1}, params: {"tag":"uno"}, headers: {"cookie":"c=1"} })));',
        '}, 60_000);',
        '',
      ].join('\n'),
    );
  });

  test('a call with nothing but the function and the origin', () => {
    expect(callSource({ root: '/p', id: 'components/x', name: 'go', origin: 'http://o' }, '/p/out.json')).toContain(
      'callJob({ fn: api["go"], origin: "http://o" })',
    );
  });

  test('the routes', () => {
    expect(routesSource('C:\\p\\.fudic\\render\\2.json')).toBe(
      [
        "import { writeFileSync } from 'node:fs';",
        "import { test } from 'vitest';",
        "import { concreteRoutes } from '@fudic/testing/render';",
        '',
        "test('fudic routes', async () => {",
        '  writeFileSync("C:/p/.fudic/render/2.json", JSON.stringify({ kind: \'routes\', routes: await concreteRoutes() }));',
        '}, 60_000);',
        '',
      ].join('\n'),
    );
  });
});

describe('a function called by the project', () => {
  let server: Server;
  let origin: string;
  const received: { url: string; headers: IncomingHttpHeaders }[] = [];
  let status = 204;

  beforeAll(async () => {
    server = createServer((req, res) => {
      received.push({ url: req.url!, headers: req.headers });
      req.resume();
      req.on('end', () => {
        if (status === 204) {
          res.writeHead(204);
          res.end();
        } else {
          res.writeHead(status, { 'content-type': 'application/problem+json' });
          res.end(JSON.stringify({ status, title: 'Unauthorized' }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test(
    'what the dev server answered, through the door, and nothing left behind',
    async () => {
      status = 204;
      const out = await callFunction({ root: CALLS, id: 'components/x-ping', name: 'ping', args: { name: 'Ana' }, origin, headers: { cookie: 'fudic-preview=k' } });
      expect(out).toEqual({ kind: 'answered', status: 204, value: null });
      expect(received.at(-1)!.url).toBe('/_fudic/fn/components/x-ping/ping');
      expect(received.at(-1)!.headers['cookie']).toBe('fudic-preview=k');
      expect(leftBehind(CALLS)).toEqual([]);
    },
    SLOW,
  );

  test(
    'a Problem is an answer',
    async () => {
      status = 401;
      expect(await callFunction({ root: CALLS, id: 'components/x-ping', name: 'ping', args: { name: 'Ana' }, origin })).toEqual({
        kind: 'problem',
        status: 401,
        problem: { status: 401, title: 'Unauthorized' },
      });
    },
    SLOW,
  );

  test(
    'an id with no module: broken, saying what could not run',
    async () => {
      const out = await callFunction({ root: CALLS, id: 'components/x-nothing', name: 'ping', origin });
      expect(out).toMatchObject({ kind: 'broken', diagnostics: [{ code: 'FUD1207' }] });
      expect(leftBehind(CALLS)).toEqual([]);
    },
    SLOW,
  );
});

describe('the concrete URLs of the project', () => {
  test(
    'listed by its vitest',
    async () => {
      expect(await listRoutes({ root: CALLS })).toEqual({ kind: 'routes', routes: ['/ping'] });
      expect(leftBehind(CALLS)).toEqual([]);
    },
    SLOW,
  );

  test(
    'a vitest that cannot start: broken',
    async () => {
      expect(await listRoutes({ root: at('./run-broken/') })).toMatchObject({
        kind: 'broken',
        diagnostics: [{ code: 'FUD1207', message: expect.stringContaining('this config is broken') }],
      });
    },
    SLOW,
  );
});
