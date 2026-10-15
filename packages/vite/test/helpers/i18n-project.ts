/**
 * A two-locale app on disk (SDD-58), installed the way a consumer has it: the runtime packages
 * linked under `node_modules`, so the typecheck resolves `@fudic/i18n` and its runtime pieces
 * are discovered like any publisher's (SDD-45).
 *
 * The catalogs are written from the real extraction (`extractMessages`), so their keys are the
 * ones the plugin looks up: a test only says which source text translates to what.
 */

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMessages } from '@fudic/compiler';

const pkgDir = (name: string): string => fileURLToPath(new URL(`../../../${name}`, import.meta.url));

const INSTALLED = ['core', 'dom', 'ssr', 'transport', 'http', 'i18n'];

export interface I18nProject {
  /** `fudic.json`'s `locales`; absent ⇒ an app without them. */
  readonly locales?: readonly string[];
  /** Files under the root, by POSIX path (`src/routes/about.fud`). */
  readonly files: Readonly<Record<string, string>>;
  /** Per locale: source text → translation. `null` writes an unreadable catalog. */
  readonly catalogs?: Readonly<Record<string, Readonly<Record<string, string>> | null>>;
  /** Raw catalog text per locale, written as is (an invalid one, say). */
  readonly rawCatalogs?: Readonly<Record<string, string>>;
}

/** Write the project and return its root. */
export function writeI18nProject(project: I18nProject): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-i18n-'));
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const [path, text] of Object.entries(project.files)) write(path, text);
  write(
    'fudic.json',
    JSON.stringify({ id: 'i18n-app', kind: 'app', prefix: 'app', ...(project.locales ? { locales: project.locales } : {}) }),
  );
  for (const [locale, table] of Object.entries(project.catalogs ?? {})) {
    write(`src/locales/${locale}.json`, table === null ? '{ "broken": ' : catalogText(project.files, table));
  }
  for (const [locale, text] of Object.entries(project.rawCatalogs ?? {})) write(`src/locales/${locale}.json`, text);

  const scope = join(root, 'node_modules', '@fudic');
  mkdirSync(scope, { recursive: true });
  for (const name of INSTALLED) symlinkSync(pkgDir(name), join(scope, name), 'junction');
  write(
    'package.json',
    JSON.stringify({
      name: 'i18n-app',
      type: 'module',
      dependencies: Object.fromEntries(INSTALLED.map((n) => [`@fudic/${n}`, '*'])),
    }),
  );
  return root;
}

/** A catalog whose entries are the `.fud` messages `table` translates. */
function catalogText(files: Readonly<Record<string, string>>, table: Readonly<Record<string, string>>): string {
  const catalog: Record<string, Record<string, object>> = {};
  for (const [path, text] of Object.entries(files)) {
    if (!path.endsWith('.fud')) continue;
    for (const m of extractMessages(text, path).value) {
      const translation = table[m.source];
      if (translation === undefined) continue;
      (catalog[m.context] ??= {})[m.key] = { source: m.source, translation, where: path, at: m.at };
    }
  }
  return JSON.stringify(catalog, null, 2);
}
