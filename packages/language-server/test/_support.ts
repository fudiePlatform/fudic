/**
 * Shared test helpers: a filesystem that lives in a `Record`, and the corpus paths.
 *
 * The index takes a port precisely so that most of the suite never touches a disk — the one
 * test that does is the one about `node:fs` itself.
 */

import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { GLOBALS_DTS } from '@fudic/language-core';
import { toPosix } from '../src/paths.js';
import type { FileSystemScanner } from '../src/types.js';

/** Absolute POSIX path of the fixture workspace. */
export const FIXTURES = toPosix(fileURLToPath(new URL('../fixtures', import.meta.url)));

/** A `FileSystemScanner` over a map of path → source. */
export function memoryFs(files: Readonly<Record<string, string>>): FileSystemScanner {
  return {
    fudFiles: (root) =>
      Object.keys(files).filter((path) => path.startsWith(root) && path.endsWith('.fud')),
    readFile: (path) => files[path],
  };
}

/** A minimal component `.fud` defining `tag`. */
export function component(tag: string, links: readonly string[] = []): string {
  const head = links.map((href) => `<link rel="component" href="${href}">`).join('\n');
  return `${head}\n<${tag}>\n  <template shadowrootmode="open">\n    <span><slot></slot></span>\n  </template>\n</${tag}>\n`;
}

/**
 * A component that DECLARES props: `pattern` is the destructuring, `type` its argument.
 *
 * Separate from `component` because reading a `props<T>()` is what the workspace index has to
 * do to expand a tag with its required props (BUG-23 task 25), and every other fixture here
 * declares none — which is exactly the degraded case.
 */
export function propsComponent(tag: string, pattern: string, type: string): string {
  return (
    `@code {\n  const ${pattern} = props<${type}>();\n}\n` +
    `<${tag}>\n  <template shadowrootmode="open">\n    <span><slot></slot></span>\n  </template>\n</${tag}>\n`
  );
}

/** A minimal route `.fud` pointing at `layoutHref`. */
export function route(layoutHref: string, links: readonly string[] = []): string {
  const head = links.map((href) => `<link rel="component" href="${href}">`).join('\n');
  return `<link rel="layout" href="${layoutHref}">\n${head}\n<article>hi</article>\n`;
}

/** A minimal layout `.fud`. */
export const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body>
    <main>
      @RenderBody()
    </main>
  </body>
</html>
`;

/** A layout that itself declares a parent layout (decision 87). */
export const NESTED_LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <link rel="layout" href="./_root.fud">
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body>
    <main>
      @RenderBody()
    </main>
  </body>
</html>
`;

/** A minimal standalone page `.fud`. */
export const PAGE = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    <h1>hi</h1>
  </body>
</html>
`;

/**
 * A real TypeScript language service over a projection, under the `.fud`'s own name.
 *
 * For the answers that depend on a TYPE — which name holds a form node, what a prop takes — and
 * a real checker rather than a written one, because a hand-made answer to «what shape is this»
 * is a second implementation of the rule under test.
 *
 * The name is not a detail: Volar registers the virtual code under the source file it belongs
 * to, so the server asks the program for `cached.path`. TypeScript drops a root file whose
 * extension it does not know, and `allowNonTsExtensions` is what stops it — the real server
 * never needs it, because there the projection arrives through Volar rather than through a host.
 */
export function projectionService(path: string, text: string): ts.LanguageService {
  const files: Record<string, string> = { [path]: text, '/p/fudic-globals.d.ts': GLOBALS_DTS };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const found = files[name];
      return found === undefined ? undefined : ts.ScriptSnapshot.fromString(found);
    },
    getScriptKind: () => ts.ScriptKind.TS,
    getCurrentDirectory: () => '/p',
    getCompilationSettings: () => ({
      strict: true,
      target: ts.ScriptTarget.ES2022,
      allowNonTsExtensions: true,
    }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (name) => name in files,
    readFile: (name) => files[name],
  };
  return ts.createLanguageService(host);
}
