/**
 * SDD-87 §4.3, criterion 18 (the editor's half): the `.fudapi` beside the error page a library
 * offers, `src/_error.fud`, is an error page's. `load` or a function there is FUD1010 (and
 * `paths`, FUD1091), as in an app's `routes/_error.fudapi`; only a library has it there.
 */

import { describe, expect, it } from 'vitest';
import { CancellationToken, type Diagnostic } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { createFudapiService } from '../../src/fudapi/service.js';
import { RequestStats } from '../../src/stats.js';
import { fakeServiceContext } from '../_lsp.js';
import { APP, FILES, SRC, world } from './_api.js';

const ERROR_API = `${SRC}/_error.fudapi`;
const ERROR_PAGE = `${SRC}/_error.fud`;
const LIB = JSON.stringify({ kind: 'lib', prefix: 'ui' });

/** The project of `FILES`, as a library (or an app) with its `src/_error.fud`, or without it. */
const filesOf = (config: string | undefined, page = true): Readonly<Record<string, string | undefined>> => ({
  ...FILES,
  ...(config !== undefined ? { [`${APP}/fudic.json`]: config } : {}),
  // Every page links a layout (SDD-88): the library's error page links one of the library's.
  ...(page
    ? {
        [ERROR_PAGE]: '<link rel="layout" href="./layouts/_layout.fud">\n<head><title>@data.status</title></head>\n',
        [`${SRC}/layouts/_layout.fud`]: '<!DOCTYPE html>\n<html><head>@RenderHead()</head><body>@RenderBody()</body></html>\n',
      }
    : {}),
});

/** What the service says about `text` written in `src/_error.fudapi`. */
async function diagnostics(files: Readonly<Record<string, string | undefined>>, text: string): Promise<readonly string[]> {
  const { host, implementations, generated } = world({ files });
  const uri = URI.file(ERROR_API);
  const embedded = URI.parse(`volar-embedded-content://root/${encodeURIComponent(uri.toString())}`);
  const decode = (u: URI): [URI, string] | undefined => (u.toString() === embedded.toString() ? [uri, 'root'] : undefined);
  const service = createFudapiService({ host, implementations, generated, stats: new RequestStats() }).create(fakeServiceContext({}, decode));
  const doc = TextDocument.create(embedded.toString(), 'fudapi', 1, text);
  const found = ((await service.provideDiagnostics?.(doc, CancellationToken.None)) ?? []) as Diagnostic[];
  return found.map((d) => String(d.code));
}

describe('src/_error.fudapi of a library', () => {
  it('its context is an error page’s', () => {
    // With the props of the layout it links, which its `layout` resolves (SDD-88 §3.6).
    expect(world({ files: filesOf(LIB) }).host.load(ERROR_API, '').context).toEqual({
      route: { params: [], error: true, layoutProps: "import('../../src/layouts/_layout.fud').$Props" },
    });
  });

  it('load and a function are FUD1010 in the editor; paths is FUD1091, as in an app’s error page', async () => {
    expect(await diagnostics(filesOf(LIB), 'load\n  n  i32\n')).toEqual(['FUD1010']);
    expect(await diagnostics(filesOf(LIB), 'get f\n  -> str\n')).toEqual(['FUD1010']);
    expect(await diagnostics(filesOf(LIB), 'paths\n')).toEqual(['FUD1091']);
  });

  it('without its _error.fud, or in an app, it is no error page', () => {
    expect(world({ files: filesOf(LIB, false) }).host.load(ERROR_API, '').context).toEqual({});
    expect(world({ files: filesOf(JSON.stringify({ kind: 'app', prefix: 'a' })) }).host.load(ERROR_API, '').context).toEqual({});
    expect(world({ files: filesOf(undefined) }).host.load(ERROR_API, '').context).toEqual({});
  });
});
