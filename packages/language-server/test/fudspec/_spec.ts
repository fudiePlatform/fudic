/**
 * Shared helpers of the `.fudspec` tests: a workspace held in two maps (the `.fud` files the
 * index scans, and the term modules and fixtures the spec host reads), and a document over it.
 */

import { parseSpec, type SpecFs } from '@fudic/spec';
import { URI } from 'vscode-uri';
import type { SpecDocument } from '../../src/fudspec/document.js';
import { SpecHost } from '../../src/fudspec/host.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { component, propsComponent, memoryFs } from '../_support.js';

export const ROOT = '/ws';
export const WS_TERMS = `${ROOT}/fudic/terms`;
export const FW_TERMS = '/fw/terms';
export const SPEC_PATH = `${ROOT}/components/fud-card.fudspec`;

/** A `SpecFs` over a map; a path mapped to `undefined` is listed but cannot be read. */
export function specFs(files: Readonly<Record<string, string | undefined>>): SpecFs & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    readDirectory(path) {
      const prefix = `${path}/`;
      return Object.keys(files)
        .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'))
        .map((f) => f.slice(prefix.length));
    },
    readFile(path) {
      reads.push(path);
      return files[path];
    },
  };
}

export interface ParamSpec {
  readonly name: string;
  readonly type: string;
}

/** The source of a sound term module. */
export function termSource(name: string, block: string, params: readonly ParamSpec[] = [], describe?: string): string {
  const list = params.map((p) => `{ name: '${p.name}', type: '${p.type}' }`).join(', ');
  const extra = describe === undefined ? '' : `, describe: ${describe}`;
  return [
    `export const meta = { name: '${name}', block: '${block}', params: [${list}]${extra} };`,
    'export async function run(ctx) {}',
    'export const selfTest = [];',
  ].join('\n');
}

/** The `.fud` side: a card with a required prop, a button without any, and a file being started. */
export const FUDS: Readonly<Record<string, string>> = {
  [`${ROOT}/components/fud-card.fud`]: propsComponent('fud-card', '{ title }', '{ title: string }'),
  [`${ROOT}/components/fud-button.fud`]: component('fud-button'),
  // No `<link rel="layout">` and no tag yet: it structures as a component with no name.
  [`${ROOT}/routes/index.fud`]: '<article>hi</article>\n',
};

/** The term modules and fixtures of the default world. */
export const FILES: Readonly<Record<string, string | undefined>> = {
  [`${WS_TERMS}/then/min-height.js`]: termSource(
    'min-height',
    'then',
    [
      { name: 'target', type: 'element' },
      { name: 'px', type: 'number' },
    ],
    '({ target, px }) => `${target} ${px}px`',
  ),
  [`${FW_TERMS}/then/visible.js`]: termSource('visible', 'then', [{ name: 'target', type: 'element' }]),
  [`${FW_TERMS}/given/route.js`]: termSource('route', 'given', [{ name: 'path', type: 'token' }]),
  [`${ROOT}/components/fud-card.fixture.ts`]: "export default {\n  'titulo-largo': { title: 'x' },\n  vacio: { title: '' },\n};\n",
};

export interface WorldOptions {
  readonly files?: Readonly<Record<string, string | undefined>>;
  readonly fuds?: Readonly<Record<string, string>>;
  readonly roots?: readonly string[];
  readonly frameworkTerms?: string | null;
}

/** A spec host over an in-memory workspace. `frameworkTerms: null` leaves the layer out. */
export function world(options: WorldOptions = {}) {
  const index = new WorkspaceIndex(memoryFs({ ...(options.fuds ?? FUDS) }));
  const roots = options.roots ?? [ROOT];
  for (const root of roots) index.scan(root);
  const fs = specFs({ ...(options.files ?? FILES) });
  const framework = options.frameworkTerms === undefined ? FW_TERMS : options.frameworkTerms;
  const host = new SpecHost({
    index,
    fs,
    roots: () => roots,
    ...(framework !== null ? { frameworkTerms: framework } : {}),
  });
  return { host, fs, index };
}

/** A `.fudspec` document as the service sees it. */
export function specDocument(text: string, path = SPEC_PATH): SpecDocument {
  const parsed = parseSpec(text);
  return { uri: URI.file(path), path, text, file: parsed.value, parseDiagnostics: parsed.diagnostics };
}

/** The text without its `|`, and the offset where it was. */
export function cursor(marked: string): { readonly text: string; readonly offset: number } {
  return { text: marked.replace('|', ''), offset: marked.indexOf('|') };
}
