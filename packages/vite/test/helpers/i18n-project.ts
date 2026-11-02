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
import { API_EXTENSION, extractApiMessages } from '@fudic/api';
import { extractMessages, extractScriptMessages } from '@fudic/compiler';
import { splitCatalog, type Catalog } from '@fudic/i18n';

const pkgDir = (name: string): string => fileURLToPath(new URL(`../../../${name}`, import.meta.url));

const INSTALLED = ['core', 'dom', 'ssr', 'transport', 'http', 'i18n'];

export interface I18nProject {
  /** `fudic.json`'s `locales`; absent ⇒ an app without them. */
  readonly locales?: readonly string[];
  /**
   * `fudic.json`'s `site`. With two or more locales it defaults to `https://example.com`,
   * which a build requires; `null` leaves it out.
   */
  readonly site?: string | null;
  /** Files under the root, by POSIX path (`src/routes/about.fud`). */
  readonly files: Readonly<Record<string, string>>;
  /** Per locale: source text → translation. `null` writes an unreadable catalog. */
  readonly catalogs?: Readonly<Record<string, Readonly<Record<string, string>> | null>>;
  /** More `@fudic/*` packages linked under `node_modules`, and named in `package.json`. */
  readonly installed?: readonly string[];
}

function siteOf(project: I18nProject): { site?: string } {
  if (project.site === null) return {};
  if (project.site !== undefined) return { site: project.site };
  return (project.locales?.length ?? 0) >= 2 ? { site: 'https://example.com' } : {};
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
    JSON.stringify({
      id: 'i18n-app',
      kind: 'app',
      prefix: 'app',
      ...(project.locales ? { locales: project.locales } : {}),
      ...siteOf(project),
    }),
  );
  for (const [locale, table] of Object.entries(project.catalogs ?? {})) {
    if (table === null) write(`src/locales/${locale}/routes/about.json`, '{ "broken": ');
    else for (const [path, part] of splitCatalog(catalogOf(project.files, table))) write(`src/locales/${locale}/${path}`, JSON.stringify(part, null, 2));
  }

  const scope = join(root, 'node_modules', '@fudic');
  mkdirSync(scope, { recursive: true });
  const installed = [...INSTALLED, ...(project.installed ?? [])];
  for (const name of installed) symlinkSync(pkgDir(name), join(scope, name), 'junction');
  write(
    'package.json',
    JSON.stringify({
      name: 'i18n-app',
      type: 'module',
      dependencies: Object.fromEntries(installed.map((n) => [`@fudic/${n}`, '*'])),
    }),
  );
  return root;
}

/** The messages of a source file, extracted as `fudic translate` does: a `.fud`, a `.fudapi` or a `.ts`. */
function messagesOf(path: string, text: string): readonly { context: string; key: string; source: string; at: number }[] {
  if (path.endsWith('.fud')) return extractMessages(text, path).value;
  if (path.endsWith(API_EXTENSION)) return extractApiMessages(text, path).value;
  // A script's context is its path under `src/`, as the catalogs of an app name it: `server/index.ts`.
  if (path.endsWith('.ts')) return extractScriptMessages(text, path.replace(/^src\//u, '')).value;
  return [];
}

/** A catalog whose entries are the messages `table` translates, one file per source. */
function catalogOf(files: Readonly<Record<string, string>>, table: Readonly<Record<string, string>>): Catalog {
  const catalog: Record<string, Record<string, Catalog[string][string]>> = {};
  for (const [path, text] of Object.entries(files)) {
    for (const m of messagesOf(path, text)) {
      const translation = table[m.source];
      if (translation === undefined) continue;
      (catalog[m.context] ??= {})[m.key] = { source: m.source, translation, where: path, at: m.at };
    }
  }
  return catalog;
}
