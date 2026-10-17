/**
 * SDD-59 §6.7.7 — a workspace with two projects, one with `@fudic/terms` installed and one
 * without: the server validates each `.fudspec` with the framework layer of its own project, and
 * completes after `then` with the stock vocabulary only where it is installed. Nothing injected:
 * the server finds the package on disk, as it does in an editor.
 */

import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  DidChangeWatchedFilesNotification,
  DocumentDiagnosticRequest,
  FileChangeType,
  type CompletionItem,
  type CompletionList,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { toPosix } from '@fudic/typecheck';
import { component } from '../_support.js';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

/** `@fudic/terms` in the repo: what a project's `node_modules` links to once installed. */
const TERMS_PACKAGE = toPosix(fileURLToPath(new URL('../../../terms', import.meta.url)));

/** The stock `then` vocabulary of SDD-59 §3.5. */
const STOCK_THEN = ['attribute', 'focused', 'hidden', 'min-height', 'min-width', 'present', 'slotted', 'text', 'visible'];

const SPEC = 'component ui-button\n\ncriterion renders\n  then\n    visible ui-button\n';

let harness: Harness;
let root: string;
const versions = new Map<string, number>();

/** A project folder of the workspace, with its fudic.json and its component. */
function project(name: string): void {
  mkdirSync(`${root}/${name}/src`, { recursive: true });
  writeFileSync(`${root}/${name}/fudic.json`, '{}');
  writeFileSync(`${root}/${name}/package.json`, `{ "name": "${name}", "private": true }`);
  writeFileSync(`${root}/${name}/src/ui-button.fud`, component('ui-button'));
}

beforeAll(async () => {
  // The fixture workspace the harness opens, with two projects of their own inside.
  root = copyWorkspace();
  project('con');
  project('sin');
  mkdirSync(`${root}/con/node_modules/@fudic`, { recursive: true });
  symlinkSync(TERMS_PACKAGE, `${root}/con/node_modules/@fudic/terms`, 'junction');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
  // The copy stays in the temp folder, as every acceptance copy does: the server's process holds
  // it until it exits. The link goes, so nothing there leads back into the repo.
  rmSync(`${root}/con/node_modules/@fudic/terms`, { force: true });
});

/** The codes the server publishes for `text` as the `.fudspec` of a project. */
async function diagnosticsOf(relative: string, text: string): Promise<string[]> {
  const uri = harness.uriOf(relative);
  const version = versions.get(relative) ?? 0;
  if (version === 0) await harness.open(relative, text, 'fudspec');
  else await harness.change(uri, text, version + 1);
  versions.set(relative, version + 1);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } })) as FullDocumentDiagnosticReport;
  return report.items.map((d) => `${d.code}@${d.range.start.line}`).sort();
}

async function complete(relative: string, marked: string): Promise<CompletionItem[]> {
  const { text, position } = harness.cursor(marked);
  await diagnosticsOf(relative, text);
  const result = await harness.client.sendRequest(CompletionRequest.type, { textDocument: { uri: harness.uriOf(relative) }, position });
  return result === null ? [] : Array.isArray(result) ? result : (result as CompletionList).items;
}

describe('SDD-59 §6.7.7 — each .fudspec with the layer of its project', () => {
  it('in the project with @fudic/terms, visible is the stock term', async () => {
    expect(await diagnosticsOf('con/src/ui-button.fudspec', SPEC)).toEqual([]);
  });

  it('in the project without it, visible is an unknown term', async () => {
    expect(await diagnosticsOf('sin/src/ui-button.fudspec', SPEC)).toEqual(['FUD0940@4']);
  });

  it('completion after then offers the stock vocabulary where it is installed, and nothing where it is not', async () => {
    const marked = 'component ui-button\n\ncriterion a\n  then\n    |';
    const con = await complete('con/src/ui-button.fudspec', marked);
    expect(con.map((i) => i.label)).toEqual(STOCK_THEN);
    expect(new Set(con.map((i) => i.labelDetails?.description))).toEqual(new Set(['framework']));
    expect(await complete('sin/src/ui-button.fudspec', marked)).toEqual([]);
  });

  it('installing the package in the other project gives it the layer, once its package.json changes', async () => {
    mkdirSync(`${root}/sin/node_modules/@fudic`, { recursive: true });
    cpSync(`${TERMS_PACKAGE}/terms`, `${root}/sin/node_modules/@fudic/terms/terms`, { recursive: true });
    await harness.client.sendNotification(DidChangeWatchedFilesNotification.type, {
      changes: [{ uri: harness.uriOf('sin/package.json'), type: FileChangeType.Changed }],
    });
    expect(await diagnosticsOf('sin/src/ui-button.fudspec', SPEC)).toEqual([]);
  });
});
