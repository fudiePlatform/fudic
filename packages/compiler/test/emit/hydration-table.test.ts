/**
 * The hydration level of every `.fud` of the repository, against a table taken before SDD-60
 * (criterion 33): a `@code` without regions is browser code now, with a server cut, and none of
 * that may change who hydrates or how a route comes up.
 *
 * The table was written by this same test against the compiler of the commit before SDD-60's
 * phase 7 (`FUD_WRITE_LEVELS=1`). It is keyed by path, so the migration of the examples (phase
 * 11) has to keep every row as it is.
 *
 * Each file is asked the questions the plugin asks: a route or a page, whether it is reactive,
 * how it comes up and which tags of its graph hydrate; a component, whether it hydrates on its
 * own, reached from a page that links it and nothing else. A link this filesystem cannot follow
 * (a package `href`, a template's placeholder) reads as an empty file, on both sides of the
 * comparison alike.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  hydratableTags,
  isIntrinsicallyHydratable,
  isReactiveRoute,
  resolveComponents,
  routeHydration,
  type ResolveIo,
} from '../../src/emit/index.js';
import { parse } from './_support.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const table = join(dirname(fileURLToPath(import.meta.url)), '__golden__', 'hydration-levels.json');

/** The page that reaches a component on its own. */
const PROBE = '__level_probe__.fud';

function ioWith(extra: Readonly<Record<string, string>>): ResolveIo {
  return {
    read: (path) => {
      const own = extra[path];
      if (own !== undefined) return own;
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return '';
      }
    },
    resolve: (from, href) => resolve(dirname(from), href),
  };
}

type Row =
  | { readonly kind: 'route'; readonly reactive: boolean; readonly hydration: string; readonly hydrates: readonly string[] }
  | { readonly kind: 'component'; readonly tag: string; readonly hydrates: boolean };

function rowOf(path: string): Row | undefined {
  const doc = parse(readFileSync(path, 'utf8'));
  if (doc.type === 'route-document' || doc.type === 'page-document') {
    const graph = resolveComponents(path, ioWith({}));
    return {
      kind: 'route',
      reactive: isReactiveRoute(graph),
      hydration: routeHydration(graph),
      hydrates: [...hydratableTags(graph)].sort(),
    };
  }
  if (doc.type === 'component-document' && doc.name !== '') {
    const probe = join(dirname(path), PROBE);
    const page = `<!DOCTYPE html>\n<html><head><link rel="component" href="./${basename(path)}"></head><body><${doc.name}></${doc.name}></body></html>\n`;
    const graph = resolveComponents(probe, ioWith({ [probe]: page }));
    const comp = graph.components.get(doc.name);
    return comp === undefined ? undefined : { kind: 'component', tag: doc.name, hydrates: isIntrinsicallyHydratable(comp) };
  }
  return undefined;
}

/** Every tracked `.fud` outside `experiments/`, by its path from the root. */
function files(): readonly string[] {
  return execFileSync('git', ['ls-files', '*.fud'], { cwd: repo, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f !== '' && !f.startsWith('experiments/'))
    .sort();
}

function levels(): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const file of files()) {
    const row = rowOf(join(repo, file));
    if (row !== undefined) out[file] = row;
  }
  return out;
}

describe('the hydration level of the repository does not change (SDD-60 criterion 33)', () => {
  it('every route, page and component hydrates as it did before SDD-60', () => {
    const now = levels();
    if (process.env['FUD_WRITE_LEVELS'] === '1') writeFileSync(table, `${JSON.stringify(now, null, 2)}\n`);
    const before = JSON.parse(readFileSync(table, 'utf8')) as Record<string, Row>;
    expect(now).toEqual(before);
  }, 120_000);
});
