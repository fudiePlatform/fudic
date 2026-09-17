/**
 * SDD-41 criteria 11 and 12: the `id` is required exactly where its absence does damage.
 *
 * A project with a Service Worker and no identity has caches named after nothing, and two
 * such apps on one origin wipe each other's — so the build stops. A project without a
 * Service Worker has no caches at all, so asking it for an identity would be asking for a
 * value nobody reads, and it builds in green.
 */

import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FUD_CONFIG_ID_REQUIRED, FUD_CONFIG_MALFORMED } from '@fudic/config';
import { fudic } from '../src/index.js';
import { readProject } from '../src/config.js';
import { runtimeAlias } from './helpers/alias.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body><h1>Home</h1></body>
</html>
`;

interface Project {
  readonly sw?: boolean;
  readonly config?: string;
}

/** Build a project, returning the error it failed with, or `null` when it went green. */
async function buildProject(project: Project): Promise<string | null> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-id-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  if (project.sw === true) writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  if (project.config !== undefined) writeFileSync(join(root, 'fudic.json'), project.config);

  try {
    await build({
      root,
      logLevel: 'silent',
      resolve: { alias: { ...runtimeAlias } },
      plugins: [fudic()],
      build: { write: false, minify: false },
    });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

describe('vite build — fudic.json and the id', () => {
  it('a project with sw.json and no id fails the build (criterion 11)', async () => {
    const failure = await buildProject({ sw: true });

    expect(failure).toContain(FUD_CONFIG_ID_REQUIRED);
  }, 180000);

  it('a fudic.json without an id is no better than none of it', async () => {
    const failure = await buildProject({ sw: true, config: JSON.stringify({ prefix: 'app' }) });

    expect(failure).toContain(FUD_CONFIG_ID_REQUIRED);
  }, 180000);

  it('a project without sw.json and without an id builds green (criterion 12)', async () => {
    expect(await buildProject({})).toBeNull();
  }, 180000);

  it('a project with sw.json and an id builds green', async () => {
    expect(await buildProject({ sw: true, config: JSON.stringify({ id: 'shop' }) })).toBeNull();
  }, 180000);
});

describe('readProject — the two severities of §5', () => {
  const io = {
    exists: () => true,
    read: () => '{"id":"Shop"}',
  };

  it('a malformed file is a warning: the build goes on without configuration', () => {
    const result = readProject('/p', false, io);

    expect(result.config).toBeNull();
    expect(result.warnings.map((d) => d.code)).toEqual([FUD_CONFIG_MALFORMED]);
    expect(result.errors).toEqual([]);
  });

  it('a malformed file under a Service Worker is also missing an id', () => {
    const result = readProject('/p', true, io);

    expect(result.warnings.map((d) => d.code)).toEqual([FUD_CONFIG_MALFORMED]);
    expect(result.errors.map((d) => d.code)).toEqual([FUD_CONFIG_ID_REQUIRED]);
  });

  it('a good id under a Service Worker is nothing at all', () => {
    const result = readProject('/p', true, { exists: () => true, read: () => '{"id":"shop"}' });

    expect(result.config?.id).toBe('shop');
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
