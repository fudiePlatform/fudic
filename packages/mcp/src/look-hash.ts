/**
 * The hash of a component's look (SDD-78 §3.4): of the files that can change how it is drawn,
 * never of its pixels — a screenshot changes with the browser, the fonts and the scale of each
 * machine, and `fudic_status` would have to open a browser to know. Its inputs without its tests
 * and its criteria, and the global sheets of its project and of each library the project adopts.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashFiles, InputGraph, nodeIo, TEST_EXTENSION } from '@fudic/history';
import { SPEC_EXTENSION } from '@fudic/spec';
import { packageDir } from './fudic.js';

/** A `fudic.json`, as far as the look reads it; undefined when there is none or it does not parse. */
function configOf(dir: string): { readonly kind?: unknown; readonly globalStyles?: unknown } | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, 'fudic.json'), 'utf8')) as { kind?: unknown; globalStyles?: unknown };
  } catch {
    return undefined;
  }
}

/** The files of the `globalStyles` of the fudic project at `dir`, in the order it names them. */
function globalSheets(dir: string): readonly string[] {
  const styles = configOf(dir)?.globalStyles;
  if (typeof styles !== 'object' || styles === null) return [];
  // The check reports a `globalStyles` that is not names and paths: here it is read as one.
  return Object.values(styles as Readonly<Record<string, string>>).map((path) => join(dir, path));
}

/** The libraries `project` depends on that are fudic libraries, in the order its `package.json` lists them. */
function libraries(project: string): readonly string[] {
  let manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as typeof manifest;
  } catch {
    return [];
  }
  const names = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];
  return names.flatMap((name) => {
    const dir = packageDir(name, project);
    return dir !== undefined && configOf(dir)?.kind === 'lib' ? [dir] : [];
  });
}

/** What a component's look is made of: absolute paths; one that cannot be read is left out of the hash. */
export function lookFiles(piece: string, project: string, root: string): readonly string[] {
  const inputs = [...new InputGraph(nodeIo(root)).filesOf(piece)].filter((file) => !file.endsWith(TEST_EXTENSION) && !file.endsWith(SPEC_EXTENSION));
  // A sheet that is not there is not in the hash: `hashFiles` leaves out what it cannot read.
  const sheets = [project, ...libraries(project)].flatMap(globalSheets);
  return [...inputs, ...sheets];
}

/** The hash of a component's look, as its `look` line writes it. */
export function lookHashOf(piece: string, project: string, root: string): string {
  return hashFiles(nodeIo(root), lookFiles(piece, project, root));
}
