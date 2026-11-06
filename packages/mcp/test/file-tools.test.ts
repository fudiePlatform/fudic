/**
 * The file tools over the HTTP entry (SDD-77 criteria 9–11): what a chat without files of its own
 * lists, reads and writes, and a write that answers at once with what it broke.
 */

import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { openProject, type Git } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, newApp, tempDir } from './helpers.js';

const BADGE = '<app-badge>\n  <template shadowrootmode="open">\n    <span>x</span>\n  </template>\n</app-badge>\n';
const BADGE_FILE = 'src/components/app-badge/app-badge.fud';

let app: Awaited<ReturnType<typeof newApp>>;
let outside: ReturnType<typeof tempDir>;
let client: Client;

/** No git in the folder: the commit is fixed and the listing walks the disk. */
const git: Git = (_root, args) => {
  if (args[0] === 'rev-parse') return 'b59fa7d';
  throw new Error('not a git repository');
};

beforeAll(async () => {
  app = await newApp();
  outside = tempDir({ 'secret.txt': 'x' });
  mkdirSync(join(app.root, 'src', 'components', 'app-badge'), { recursive: true });
  writeFileSync(join(app.root, BADGE_FILE), BADGE);
  mkdirSync(join(app.root, '.git'));
  writeFileSync(join(app.root, '.git', 'config'), '[core]\n');
  mkdirSync(join(app.root, 'dist'));
  writeFileSync(join(app.root, 'dist', 'index.html'), '');
  symlinkSync(outside.root, join(app.root, 'out'), 'junction');
  client = await connect(createServer({ project: openProject(app.root, git), entry: 'http' }));
}, 120_000);

afterAll(async () => {
  await client.close();
  app.dispose();
  outside.dispose();
});

async function call(name: string, args: Record<string, unknown>): Promise<{ readonly body: Record<string, unknown>; readonly isError: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  return { body: result.structuredContent as Record<string, unknown>, isError: result.isError === true };
}

const codes = (body: Record<string, unknown>): string[] => (body['diagnostics'] as { code: string }[]).map((d) => d.code);

describe('fudic_files (criterion 11)', () => {
  it('lists the project, without node_modules, dist, .git or .fudic', async () => {
    const { body, isError } = await call('fudic_files', {});
    expect(isError).toBe(false);
    const files = body['files'] as string[];
    expect(files).toContain(BADGE_FILE);
    expect(files).toContain('package.json');
    expect(files.filter((f) => /^(node_modules|dist|\.git|\.fudic)\//u.test(f))).toEqual([]);
    expect([...files].sort()).toEqual(files);
  });

  it('what git ignores is not listed: the listing is git\'s', async () => {
    const tracked: Git = (_root, args) => (args[0] === 'rev-parse' ? 'b59fa7d' : 'package.json\nsrc/routes/index.fud\n');
    const other = await connect(createServer({ project: openProject(app.root, tracked), entry: 'http' }));
    try {
      const result = await other.callTool({ name: 'fudic_files', arguments: {} });
      expect((result.structuredContent as { files: string[] }).files).toEqual(['package.json', 'src/routes/index.fud']);
    } finally {
      await other.close();
    }
  });

  it('under a folder; a folder out of the project is FUD1400', async () => {
    expect((await call('fudic_files', { under: 'src/components' })).body['files']).toEqual([BADGE_FILE]);
    const refused = await call('fudic_files', { under: '../' });
    expect(refused.isError).toBe(true);
    expect(codes(refused.body)).toEqual(['FUD1400']);
  });
});

describe('fudic_read (criterion 9)', () => {
  it('numbers the lines and keeps to offset and limit', async () => {
    const { body } = await call('fudic_read', { path: BADGE_FILE, offset: 2, limit: 2 });
    expect(body).toMatchObject({ path: BADGE_FILE, lines: '2-3', total: 5, text: '  2→  <template shadowrootmode="open">\n  3→    <span>x</span>' });
  });

  it.each([['../x'], ['.git/config'], ['out/secret.txt']])('%s: FUD1400', async (path) => {
    const { body, isError } = await call('fudic_read', { path });
    expect(isError).toBe(true);
    expect(codes(body)).toEqual(['FUD1400']);
  });

  it('a file that does not exist: FUD1401', async () => {
    const { body, isError } = await call('fudic_read', { path: 'src/nope.fud' });
    expect(isError).toBe(true);
    expect(codes(body)).toEqual(['FUD1401']);
  });
});

describe('fudic_write (criterion 10)', () => {
  it('two edits, one that does not match: FUD1402, and the file untouched', async () => {
    const { body, isError } = await call('fudic_write', {
      path: BADGE_FILE,
      edits: [
        { old: '<span>x</span>', new: '<span>y</span>' },
        { old: 'not in the file', new: 'z' },
      ],
    });
    expect(isError).toBe(true);
    expect(codes(body)).toEqual(['FUD1402']);
    expect(readFileSync(join(app.root, BADGE_FILE), 'utf8')).toBe(BADGE);
  });

  it('a valid write that breaks a .fud answers its diagnostic, with at and quote, at once', async () => {
    const { body, isError } = await call('fudic_write', { path: BADGE_FILE, edits: [{ old: '<span>x</span>', new: '<span>x' }] });
    expect(isError).toBe(false);
    expect(body['written']).toBe(BADGE_FILE);
    const [first] = body['diagnostics'] as { code: string; at: string; quote: string }[];
    expect(first).toMatchObject({ code: 'FUD0052', at: `${BADGE_FILE}:3:5`, quote: '<span>x' });
    expect(body['summary']).toMatchObject({ errors: expect.any(Number) });
    expect((body['codes'] as Record<string, unknown>)['FUD0052']).toBeDefined();
  }, 120_000);

  it('the whole content, in a folder that did not exist; clean, it says so', async () => {
    const { body, isError } = await call('fudic_write', { path: BADGE_FILE, content: BADGE });
    expect(isError).toBe(false);
    expect(body['diagnostics']).toEqual([]);
    const created = await call('fudic_write', { path: 'src/components/app-tag/app-tag.fud', content: BADGE.replaceAll('app-badge', 'app-tag') });
    expect(created.body['written']).toBe('src/components/app-tag/app-tag.fud');
    expect(created.body['next']).toBeNull();
  }, 120_000);

  it('never into .fudic, node_modules or out of the project: FUD1400', async () => {
    for (const path of ['.fudic/api/x.d.ts', 'node_modules/x.js', '../x.fud']) {
      const { body, isError } = await call('fudic_write', { path, content: 'x' });
      expect(isError, path).toBe(true);
      expect(codes(body)).toEqual(['FUD1400']);
    }
  });

  it.each([
    ['neither content nor edits', {}],
    ['both content and edits', { content: 'x', edits: [] }],
  ])('with %s the SDK refuses the input, and nothing changes', async (_why, input) => {
    const result = await client.callTool({ name: 'fudic_write', arguments: { path: BADGE_FILE, ...input } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('exactly one of them');
    expect(readFileSync(join(app.root, BADGE_FILE), 'utf8')).toBe(BADGE);
  });
});
