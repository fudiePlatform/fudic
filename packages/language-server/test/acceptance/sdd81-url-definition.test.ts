/**
 * SDD-81 §3.4 — Ctrl+Click on the `url` of a `get` in a view (`avatar.url({ id })`) opens that
 * `get` in its `.fudapi`, as Ctrl+Click on the function's name does (BUG-59). The method is the
 * framework's `Linkable`; what the developer wants to read is the function they declared.
 *
 * `@fudic/http/contract` is installed here as a declaration of the names the generated `.d.ts`
 * imports, with `Linkable` as the package writes it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DefinitionRequest, type Location } from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const CARD = 'src/components/photo-card.fud';

const SOURCE = `<link rel="server" href="./photo-card.fudapi">

@code {
  import { photo as other } from "fudic:components/photo-card";
  const direct = other.url({ id: 2 });
  const wrapped = (photo).url({ id: 3 });
}

<photo-card>
  <template shadowrootmode="open">
    <img src=@photo.url({ id: 1 }) alt="">
    <a href=@report.url()>CSV</a>
  </template>
</photo-card>
`;

const CONTRACT = `get photo
  id  i32
  -> file?

get report
  -> file
`;

const HTTP = `export interface Linkable<A> {
  url(...args: [A] extends [void] ? [args?: A] : [args: A]): string;
}
export interface Contract<C, R, A> {
  (args: A): Promise<R>;
  handle(handler: (ctx: C) => R | Promise<R>): void;
}
export type FnContext<P, Q, B> = { readonly params: P; readonly query: Q; readonly args: B };
export type BrowserLoadPiece = unknown;
export type PageContext = unknown;
export type PagePiece = unknown;
export declare class HttpError extends Error {}
`;

let harness: Harness;
let root: string;

beforeAll(async () => {
  root = copyWorkspace();
  const http = `${root}/node_modules/@fudic/http`;
  mkdirSync(http, { recursive: true });
  writeFileSync(`${http}/package.json`, JSON.stringify({ name: '@fudic/http', exports: { './contract': { types: './contract.d.ts' } } }), 'utf8');
  writeFileSync(`${http}/contract.d.ts`, HTTP, 'utf8');
  writeFileSync(`${root}/${CARD}`, SOURCE, 'utf8');
  writeFileSync(`${root}/src/components/photo-card.fudapi`, CONTRACT, 'utf8');
  harness = await startHarness({ root });
  await harness.open(CARD);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** Where Ctrl+Click on the `delta`-th character of `needle` goes: the file and its line. */
async function definitionAt(needle: string, delta: number): Promise<{ file: string; text: string }[]> {
  const text = readFileSync(`${root}/${CARD}`, 'utf8');
  const at = text.indexOf(needle);
  expect(at, `${needle} is in ${CARD}`).toBeGreaterThan(-1);
  const answer = (await harness.client.sendRequest(DefinitionRequest.type, {
    textDocument: { uri: URI.file(`${root}/${CARD}`).toString() },
    position: harness.positionAt(text, at + delta),
  })) as Location[] | null;
  return (answer ?? []).map((link) => {
    const path = URI.parse(link.uri).fsPath.replace(/\\/gu, '/');
    const lines = readFileSync(path, 'utf8').split('\n');
    return { file: path.slice(path.lastIndexOf('/') + 1), text: (lines[link.range.start.line] ?? '').trim() };
  });
}

describe('SDD-81: the url of a get opens the get', () => {
  it('with arguments and without', async () => {
    expect(await definitionAt('photo.url(', 7)).toEqual([{ file: 'photo-card.fudapi', text: 'get photo' }]);
    expect(await definitionAt('report.url(', 8)).toEqual([{ file: 'photo-card.fudapi', text: 'get report' }]);
  });

  it('a name the view does not take from its link, or no name, keeps the method', async () => {
    expect(await definitionAt('other.url(', 7)).toEqual([{ file: 'contract.d.ts', text: 'url(...args: [A] extends [void] ? [args?: A] : [args: A]): string;' }]);
    // Nor does a link written on something that is not a name.
    expect(await definitionAt('(photo).url(', 9)).toEqual([{ file: 'contract.d.ts', text: 'url(...args: [A] extends [void] ? [args?: A] : [args: A]): string;' }]);
  });
});
