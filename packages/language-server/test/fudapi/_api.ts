/**
 * Shared helpers of the `.fudapi` tests: a project held in a map — an app with its `src/` and
 * the `fudapi/` of its dependencies under `node_modules` — and a document over it.
 */

import { URI } from 'vscode-uri';
import type { ApiDocument } from '../../src/fudapi/document.js';
import type { ApiEntry, ApiFs } from '../../src/fudapi/fs.js';
import { ApiHost } from '../../src/fudapi/host.js';

export const ROOT = '/ws';
export const APP = `${ROOT}/app`;
export const SRC = `${APP}/src`;
export const FORMS = `${APP}/node_modules/@fudic/forms/fudapi`;
export const HTTP = `${APP}/node_modules/@fudic/http/fudapi`;

/** `@fudic/forms` as it publishes its rules and patterns (SDD-60 §3.10). */
export const RULES = [
  '# The value is not empty.',
  'rule required',
  '  on field *',
  '  runs both',
  '  fails required',
  '',
  'rule min-length',
  '  on field str str[]',
  '  runs both',
  '  n  u32',
  '  fails min-length n',
  '',
  'rule pattern',
  '  on field str',
  '  runs both',
  '  regex  pattern',
  '  fails pattern',
  '',
].join('\n');

export const PATTERNS = 'pattern email  [^@]+@[^@]+\n';

/** `@fudic/http` as it publishes its middlewares (SDD-60 §3.10). */
export const MIDDLEWARES = [
  'middleware csrf',
  '  client',
  '  server',
  '',
  'middleware error-pages',
  '  client',
  '  routes  map u16 str',
  '',
].join('\n');

/** The app's own middleware, documented and adding to `ctx`. */
export const AUTH = [
  '# Who is calling.',
  'middleware auth',
  '  server',
  '  adds',
  '    user  str',
  '    roles  str[]',
  '  fails unauthorized 401',
  '',
].join('\n');

export const PACKAGE = JSON.stringify({
  name: 'app',
  dependencies: { '@fudic/forms': '0.0.1', '@fudic/http': '0.0.1', 'no-api': '1.0.0' },
  devDependencies: { '@fudic/dev': '0.0.1' },
});

/** The default project: an app with two libraries, a third without `fudapi/` and a transitive one. */
export const FILES: Readonly<Record<string, string | undefined>> = {
  [`${APP}/package.json`]: PACKAGE,
  [`${FORMS}/rules.fudapi`]: RULES,
  [`${FORMS}/patterns.fudapi`]: PATTERNS,
  [`${HTTP}/middlewares.fudapi`]: MIDDLEWARES,
  [`${APP}/node_modules/no-api/index.js`]: '',
  [`${APP}/node_modules/@fudic/dev/fudapi/dev.fudapi`]: 'type DevOnly\n  x  str\n',
  // A dependency of a dependency: never read.
  [`${APP}/node_modules/transitive/fudapi/t.fudapi`]: 'type Transitive\n  x  str\n',
  [`${SRC}/middlewares/auth.fudapi`]: AUTH,
  [`${SRC}/types/person.fudapi`]: 'type Person\n  name  str\nenum Role\n  admin\n  user\n',
  [`${SRC}/routes/usuarios.fud`]: '<app-usuarios></app-usuarios>\n',
  [`${SRC}/routes/blog/[slug].fud`]: '<app-post></app-post>\n',
  [`${SRC}/routes/_error.fud`]: '<app-error></app-error>\n',
  // Never read: what a build leaves, and what a dot folder hides.
  [`${SRC}/node_modules/x/y.fudapi`]: 'type Hidden\n  x  str\n',
  [`${SRC}/.cache/z.fudapi`]: 'type Dotted\n  x  str\n',
  [`${SRC}/notes.txt`]: 'not a contract',
};

/** An `ApiFs` over a map; a path mapped to `undefined` is listed but cannot be read. */
export function apiFs(files: Readonly<Record<string, string | undefined>>): ApiFs & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    readFile(path) {
      reads.push(path);
      return files[path];
    },
    list(path) {
      const prefix = `${path}/`;
      const entries = new Map<string, ApiEntry>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const [name, ...rest] = file.slice(prefix.length).split('/');
        entries.set(name!, { name: name!, directory: rest.length > 0 });
      }
      return [...entries.values()];
    },
  };
}

export interface WorldOptions {
  readonly files?: Readonly<Record<string, string | undefined>>;
  readonly roots?: readonly string[];
  readonly open?: Readonly<Record<string, string>>;
}

/** An `.fudapi` host over an in-memory project. */
export function world(options: WorldOptions = {}) {
  const fs = apiFs({ ...(options.files ?? FILES) });
  const roots = options.roots ?? [ROOT];
  const open = options.open ?? {};
  const host = new ApiHost({ fs, roots: () => roots, open: (path) => open[path] });
  return { host, fs };
}

/** A `.fudapi` document as the service sees it, through `host`. */
export function apiDocument(host: ApiHost, text: string, path = `${SRC}/components/x.fudapi`): ApiDocument {
  return { uri: URI.file(path), path, text, ...host.load(path, text) };
}

/** The text without its `|`, and the offset where it was. */
export function cursor(marked: string): { readonly text: string; readonly offset: number } {
  return { text: marked.replace('|', ''), offset: marked.indexOf('|') };
}
