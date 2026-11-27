/**
 * The files of a style guide: those of `@fudic/guide`, the guide fudic.dev uses, copied byte for
 * byte. The CLI depends on the package, so the copy is of the version it was installed with. What
 * makes the package a package — its `package.json`, `README.md` and `fudic.json` — stays behind: a
 * copy kept as a library writes its own from `templates/guide/`, and an app's copy goes without.
 */

import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { joinPosix } from '../paths.js';
import { renderTemplate, templateTree } from '../templates.js';
import type { ScaffoldFile } from './scaffold.js';

/** The package every project gets its style guide from, unless it has a copy of its own. */
export const GUIDE_PACKAGE = '@fudic/guide';

/** Where a standalone app keeps its copy of the guide. */
export const APP_GUIDE_DIR = 'src/guide';

/**
 * The folder `@fudic/guide` is installed in. Resolved when a guide is copied, not when the CLI
 * loads: a command that writes no guide does not depend on finding it.
 */
function guideRoot(): string {
  return dirname(createRequire(import.meta.url).resolve(`${GUIDE_PACKAGE}/fudic.json`));
}

/** The package's own files, which a copy does not take. */
const PACKAGE_FILES = new Set(['package.json', 'README.md', 'fudic.json']);

/** Every file of the guide a copy takes, relative to its folder, with `/`, sorted. */
export function guideSources(): readonly string[] {
  const root = guideRoot();
  return (readdirSync(root, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/gu, '/'))
    .filter((file) => !PACKAGE_FILES.has(file))
    .sort();
}

/**
 * A file as the copy writes it: text when it is UTF-8 that reads back to the same bytes — a sheet,
 * an icon, a licence —, so it is diffed and shown like any generated file; its bytes otherwise —
 * the font. Either way, what lands on disk is the package's file byte for byte.
 */
function asCopied(bytes: Buffer): string | Uint8Array {
  const text = bytes.toString('utf8');
  return Buffer.from(text, 'utf8').equals(bytes) ? text : new Uint8Array(bytes);
}

/** A copy kept as a library of the workspace: its npm name, and its folder name. */
export interface GuideLibrary {
  readonly pkgName: string;
  readonly project: string;
}

/** The guide's files in `dir`; with `library`, as that library, else as an app's folder. */
export function guideFiles(dir: string, library?: GuideLibrary): readonly ScaffoldFile[] {
  const root = guideRoot();
  const copied = guideSources().map((file): ScaffoldFile => [joinPosix(dir, file), asCopied(readFileSync(join(root, file)))]);
  if (library === undefined) return copied;
  const own = templateTree('guide').map((file): ScaffoldFile => [
    joinPosix(dir, file.slice(0, -'.tmpl'.length)),
    renderTemplate(`guide/${file}`, { name: library.pkgName, project: library.project }),
  ]);
  return [...copied, ...own];
}

/** What a standalone app's `fudic.json` names its copy of the guide with, once it is in `src/guide/`. */
export const APP_GUIDE_FIELDS = {
  globalStyles: { base: `${APP_GUIDE_DIR}/base.css` },
  guide: { sheet: `${APP_GUIDE_DIR}/guide.css`, icon: `${APP_GUIDE_DIR}/logo.svg` },
} as const;
