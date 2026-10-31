/**
 * SDD-71 criterion 15 — the hover of a pipe a view imports, unit by unit: what the wrapper of a
 * TypeScript service adds under TypeScript's own hover, and when it leaves it alone. The whole
 * path through a live server is `acceptance/pipes-editor.test.ts`.
 */

import type { LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import { describe, expect, it } from 'vitest';
import type { Hover, LocationLink } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { redirectServerDefinitions } from '../../src/services/server-definition.js';
import { FILES, SRC, world } from '../fudapi/_api.js';

const PIPES = `${SRC}/pipes`;
const VIEW = `${SRC}/components/card.fud`;
const { host } = world({
  files: {
    ...FILES,
    [`${PIPES}/truncar.fudapi`]: '# Cuts a text.\npipe truncar\n  on str\n  max u32\n',
    [`${PIPES}/truncar.ts`]: "import { truncar } from 'fudic:pipes/truncar';\nexport default truncar.implement((v) => v);\n",
    [`${PIPES}/iniciales.fudapi`]: 'pipe iniciales\n  on str\n',
    [`${PIPES}/iniciales.ts`]: "import { iniciales } from 'fudic:pipes/iniciales';\nexport default iniciales.implement((v) => v);\n",
  },
});

/** The embedded TS document of the view, and one of a plain `.ts`. */
const EMBEDDED = TextDocument.create('volar-embedded://card/script.ts', 'typescript', 1, 'const x = truncar;\n');
const PLAIN = TextDocument.create(URI.file(`${SRC}/plain.ts`).toString(), 'typescript', 1, 'const x = 1;\n');
const context = {
  decodeEmbeddedDocumentUri: (uri: URI) => (uri.toString() === EMBEDDED.uri ? [URI.file(VIEW), 'script'] : undefined),
} as never;

const linkTo = (path: string): LocationLink => {
  const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
  return { targetUri: URI.file(path).toString(), targetRange: range, targetSelectionRange: range };
};

/** A TypeScript service that hovers with `shown` and defines at `links`, wrapped. */
function wrapped(shown: Hover | null, links: LocationLink[] | null, withHover = true): LanguageServicePluginInstance {
  const plugin: LanguageServicePlugin = {
    name: 'ts',
    capabilities: {},
    create: () => ({
      provideDefinition: () => links,
      ...(withHover ? { provideHover: () => shown } : {}),
    }),
  };
  return redirectServerDefinitions([plugin], host)[0]!.create(context);
}

const position = { line: 0, character: 11 };
const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) };
const hoverOf = async (instance: LanguageServicePluginInstance, doc = EMBEDDED): Promise<Hover | null | undefined> =>
  (await instance.provideHover!(doc, position, token)) as Hover | null | undefined;

describe('the hover of a pipe a view imports (criterion 15)', () => {
  it('TypeScript\'s own, then the pipe as written, then its documentation', async () => {
    const shown: Hover = { contents: { kind: 'markdown', value: '(alias) const truncar' } };
    const hover = await hoverOf(wrapped(shown, [linkTo(`${PIPES}/truncar.ts`)]));
    expect(hover?.contents).toEqual({
      kind: 'markdown',
      value: '(alias) const truncar\n\n```fudapi\npipe truncar\n  on str\n  max u32\n```\n\nCuts a text.',
    });
  });

  it('TypeScript\'s contents as a list of marked strings, and a pipe without documentation', async () => {
    const shown: Hover = { contents: ['plain', { language: 'ts', value: 'const iniciales' }], range: { start: position, end: position } };
    const hover = await hoverOf(wrapped(shown, [linkTo(`${PIPES}/iniciales.ts`)]));
    expect(hover).toEqual({
      contents: { kind: 'markdown', value: 'plain\n\nconst iniciales\n\n```fudapi\npipe iniciales\n  on str\n```' },
      range: { start: position, end: position },
    });
  });

  it('a target that is no pipe, or no target at all, keeps TypeScript\'s hover', async () => {
    const shown: Hover = { contents: 'const x' };
    expect(await hoverOf(wrapped(shown, [linkTo(`${SRC}/other.ts`)]))).toBe(shown);
    expect(await hoverOf(wrapped(shown, null))).toBe(shown);
  });

  it('outside a .fud, or with no hover from TypeScript, nothing is added', async () => {
    const shown: Hover = { contents: 'const x' };
    expect(await hoverOf(wrapped(shown, [linkTo(`${PIPES}/truncar.ts`)]), PLAIN)).toBe(shown);
    expect(await hoverOf(wrapped(null, [linkTo(`${PIPES}/truncar.ts`)]))).toBeNull();
  });

  it('a service without hover gets none', () => {
    expect(wrapped(null, [], false).provideHover).toBeUndefined();
  });
});
