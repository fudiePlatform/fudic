/**
 * A package's style guide, from the build's point of view.
 *
 * The `guide` of a `fudic.json` names a sheet of `@import`s. The build reads it twice, for two
 * readers. Once per PACKAGE, from the package's own folder: which of its imports are pieces a
 * component may adopt, and what is wrong with it — reported once, where it is read. And once
 * per ENTRY, from the entry's folder: the whole guide flattened as that entry sees it, because
 * the page links it, and every `url()` in it has to resolve from the page that is compiled.
 *
 * The compiler reads the CSS; this module only gives it the files.
 */

import { dirname, posix, relative, resolve } from 'node:path';
import { readGuide, type GuidePiece, type GuideSheet } from '@fudic/compiler';
import { CONFIG_FILE, type ProjectConfig, type ProjectStyleFile } from '@fudic/config';
import { FUD0740, FUD1443, type FileDiagnostic, type Span } from '@fudic/diagnostics';
import type { PackageFs } from '@fudic/resolve';

/** A package's guide, read from its own folder. Every path absolute, with `/`. */
export interface PackageGuide {
  /** The guide's entry sheet. */
  readonly sheet: string;
  /** Its icon, when it declares one that exists. */
  readonly icon?: string;
  /** The files of its `globalStyles`, which are never pieces. */
  readonly globals: readonly string[];
  /** Its pieces, in import order; each `path` absolute. */
  readonly pieces: readonly GuidePiece[];
}

export interface PackageGuideResult {
  /** Absent when the package declares no guide, or its sheet is not there. */
  readonly guide?: PackageGuide;
  readonly errors: readonly FileDiagnostic[];
  readonly warnings: readonly FileDiagnostic[];
  /** The pieces as files, for the checks every adopted sheet gets. */
  readonly files: readonly ProjectStyleFile[];
}

const NO_GUIDE: PackageGuideResult = { errors: [], warnings: [], files: [] };

/** Read the guide `config` declares, from the package at `root`. */
export function readPackageGuide(
  root: string,
  config: ProjectConfig | null,
  globals: readonly string[],
  io: PackageFs,
): PackageGuideResult {
  const declared = config?.guide;
  if (declared === undefined) return NO_GUIDE;
  const errors: FileDiagnostic[] = [];
  const sheet = `${root}/${declared.sheet}`;
  if (io.readFile(sheet) === undefined) {
    return {
      ...NO_GUIDE,
      errors: [FUD0740({ file: CONFIG_FILE, name: 'guide', entry: declared.sheet, problem: 'missing' })],
    };
  }
  let icon: string | undefined;
  if (declared.icon !== undefined) {
    if (io.readFile(`${root}/${declared.icon}`) === undefined) {
      const span = valueSpan(io.readFile(`${root}/${CONFIG_FILE}`) ?? '', 'icon');
      errors.push(FUD1443({ file: CONFIG_FILE, icon: declared.icon, ...(span === undefined ? {} : { span }) }));
    } else {
      icon = `${root}/${declared.icon}`;
    }
  }
  const read = readGuide(
    specFrom(root, sheet),
    (spec) => io.readFile(posix.join(root, spec)),
    new Set(globals.map((g) => specFrom(root, g))),
  );
  const pieces = read.value.pieces.map((p): GuidePiece => ({ ...p, path: posix.join(root, p.path) }));
  errors.push(...read.diagnostics.map((d) => ({ ...d, file: declared.sheet })));
  const flat = read.value.sheet.diagnostics.map(({ file, diagnostic }) => ({
    ...diagnostic,
    file: posix.normalize(file),
  }));
  return {
    guide: { sheet, ...(icon === undefined ? {} : { icon }), globals, pieces },
    errors: [...errors, ...flat.filter((d) => d.severity === 'error')],
    warnings: flat.filter((d) => d.severity !== 'error'),
    files: pieces.map((p) => ({
      specifier: p.name,
      entry: posix.relative(root, p.path),
      path: p.path,
      css: p.css,
    })),
  };
}

/** The guide as the entry `file` links it: flattened from the entry's folder. */
export function entryGuide(guide: PackageGuide, file: string, io: PackageFs): GuideSheet {
  const dir = dirname(file);
  const spec = specFrom(dir, guide.sheet);
  const read = readGuide(
    spec,
    (path) => io.readFile(resolve(dir, path)),
    new Set(guide.globals.map((g) => specFrom(dir, g))),
  );
  return { spec, sheet: read.value.sheet };
}

/** `target` as a specifier from the folder `dir`: `./a.css`, `../b/a.css`, always with `/`. */
export function specFrom(dir: string, target: string): string {
  const rel = relative(dir, target).replace(/\\/gu, '/');
  return rel.startsWith('..') ? rel : `./${rel}`;
}

/** Over the string value of `"<key>": "…"` in a JSON text, when it is written plainly. */
function valueSpan(text: string, key: string): Span | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*("[^"]*")`, 'u').exec(text);
  if (match === null) return undefined;
  const start = match.index + match[0].length - match[1]!.length;
  return { start, end: start + match[1]!.length };
}
