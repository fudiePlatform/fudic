/**
 * `silenceEchoes` without a server (SDD-62, task 24). The acceptance test silences against a real
 * one; these are the documents it must leave alone — anything that is not the client projection
 * of a `.fud` —, the plugins it cannot wrap, and whose errors count as spoken.
 */

import type { LanguageServiceContext, LanguageServicePlugin } from '@volar/language-service';
import { clientFileName } from '@fudic/language-core';
import type { fudicDiagnostics } from '@fudic/typecheck';
import { describe, expect, it, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../../src/document-cache.js';
import { silenceEchoes } from '../../src/services/one-voice.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { memoryFs } from '../_support.js';

type Diagnostic = ReturnType<typeof fudicDiagnostics>[number];

/** fudic errors the test adds to what the file really has. */
const extra = vi.hoisted(() => ({ diagnostics: [] as Diagnostic[] }));
vi.mock('@fudic/typecheck', async (importOriginal) => {
  const real = await importOriginal<typeof import('@fudic/typecheck')>();
  return {
    ...real,
    fudicDiagnostics: (...args: Parameters<typeof real.fudicDiagnostics>) => [
      ...real.fudicDiagnostics(...args),
      ...extra.diagnostics,
    ],
  };
});

const FOUND = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'ts' }];
const DOCUMENT = TextDocument.create('volar-embedded-content://client_ts/x', 'typescript', 1, 'x');
const FUD = URI.file('/p/components/app-card.fud');

function plugin(found: typeof FOUND | null = FOUND): LanguageServicePlugin {
  return { name: 'typescript-semantic', capabilities: {}, create: () => ({ provideDiagnostics: () => found }) };
}

/** A context whose embedded URI decodes to `decoded`, and whose script for it has `root`. */
function context(decoded: [URI, string] | undefined, root?: unknown): LanguageServiceContext {
  return {
    decodeEmbeddedDocumentUri: () => decoded,
    language: { scripts: { get: () => (root === undefined ? undefined : { generated: { root } }) } },
    // No TypeScript service: the portable-type half of what is spoken is left out.
    inject: () => undefined,
  } as unknown as LanguageServiceContext;
}

async function diagnostics(
  service: LanguageServicePlugin,
  ctx: LanguageServiceContext,
  document = DOCUMENT,
): Promise<unknown> {
  const [wrapped] = silenceEchoes([service], new WorkspaceIndex(memoryFs({})));
  return wrapped!.create(ctx).provideDiagnostics!(document, { isCancellationRequested: false } as never);
}

describe('silenceEchoes leaves alone what is not a .fud projection', () => {
  it('a document that is not embedded in anything', async () => {
    expect(await diagnostics(plugin(), context(undefined))).toEqual(FOUND);
  });

  it('a document embedded in a file that is not a .fud', async () => {
    expect(await diagnostics(plugin(), context([URI.file('/p/a.ts'), 'client_ts']))).toEqual(FOUND);
  });

  it('a .fud with no generated root', async () => {
    expect(await diagnostics(plugin(), context([FUD, 'client_ts']))).toEqual(FOUND);
  });

  it('another embedded code of the .fud (a style, not the client)', async () => {
    const root = { client: { id: 'client_ts' }, document: { path: '/p/components/app-card.fud', virtuals: [] } };
    expect(await diagnostics(plugin(), context([FUD, 'style_0'], root))).toEqual(FOUND);
  });

  it('a client whose projection has no virtual file of that name', async () => {
    const root = { client: { id: 'client_ts' }, document: { path: '/p/components/app-card.fud', virtuals: [] } };
    expect(await diagnostics(plugin(), context([FUD, 'client_ts'], root))).toEqual(FOUND);
  });

  it('a reply with no diagnostics at all', async () => {
    expect(await diagnostics(plugin(null), context(undefined))).toBeNull();
  });

  it('a plugin with no diagnostics to give is handed back as it is', () => {
    const instance = {};
    const [wrapped] = silenceEchoes(
      [{ name: 'other', capabilities: {}, create: () => instance }],
      new WorkspaceIndex(memoryFs({})),
    );
    expect(wrapped!.create(context(undefined))).toBe(instance);
  });
});

describe('what counts as spoken', () => {
  const PATH = '/p/components/app-card.fud';
  const SOURCE = `@code {\n  const shown = 1;\n}\n\n<app-card>\n  <template shadowrootmode="open"><p>@shown</p></template>\n</app-card>\n`;
  const cached = new DocumentCache(new WorkspaceIndex(memoryFs({ [PATH]: SOURCE }))).get(PATH, 1, SOURCE);
  const client = cached.virtuals.find((virtual) => virtual.fileName === clientFileName(PATH))!;
  const projection = TextDocument.create('volar-embedded-content://client_ts/p', 'typescript', 1, client.text);
  const root = { client: { id: 'client_ts' }, document: cached };
  const at = SOURCE.lastIndexOf('shown');
  const span = { start: at, end: at + 'shown'.length };
  // A TypeScript error over the read of `shown` in the view, in the projection's coordinates.
  const start = client.text.lastIndexOf('shown');
  const found = [{ range: { start: projection.positionAt(start), end: projection.positionAt(start + 5) }, message: 'ts' }];
  const error = (file?: string): Diagnostic => ({
    code: 'FUD0907',
    severity: 'error',
    message: 'fudic',
    span,
    ...(file === undefined ? {} : { file }),
  });

  it('a fudic error of this file silences the TypeScript one it meets, with no TypeScript service', async () => {
    extra.diagnostics = [error(PATH)];
    expect(await diagnostics(plugin(found), context([FUD, 'client_ts'], root), projection)).toEqual([]);
    extra.diagnostics = [error()];
    expect(await diagnostics(plugin(found), context([FUD, 'client_ts'], root), projection)).toEqual([]);
  });

  it('an error of another file, at the same offsets, silences nothing here', async () => {
    extra.diagnostics = [error('/p/components/other.fud')];
    expect(await diagnostics(plugin(found), context([FUD, 'client_ts'], root), projection)).toEqual(found);
    extra.diagnostics = [];
  });
});
