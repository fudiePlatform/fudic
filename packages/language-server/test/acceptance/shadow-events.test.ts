/**
 * SDD-47 §4.5 — the `<template shadowrootmode>` takes events, and the editor treats them
 * exactly as it treats the host's: the same list at `@`, the same check on the handler.
 *
 * Asked the way an editor asks, against the running server: the projection alone could be
 * right and the answer still not reach the author.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  DocumentDiagnosticRequest,
  type CompletionItem,
  type CompletionList,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { startHarness, type Harness } from './_harness.js';

const FILE = 'components/app-badge.fud';

let harness: Harness;
let version = 1;

/** A component whose host carries `hostAttrs` and whose `<template>` carries `templateAttrs`. */
function component(hostAttrs: string, templateAttrs: string): string {
  return `@code {
  @client {
    function onKey(e: KeyboardEvent) { void e; }
  }
}

<app-badge${hostAttrs}>
  <template shadowrootmode="open" shadowrootadoptedstylesheets="panel"${templateAttrs}>
    <span>hi</span>
  </template>
</app-badge>
`;
}

async function completeTyping(marked: string, triggerCharacter: string): Promise<string[]> {
  const text = marked.replace('|', '');
  const { uri } = await harness.open(FILE);
  await harness.change(uri, text, ++version);
  const answer = (await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, marked.indexOf('|')),
    context: { triggerKind: 2, triggerCharacter },
  })) as CompletionList | CompletionItem[] | null;
  const items = answer === null ? [] : Array.isArray(answer) ? answer : answer.items;
  return items.map((item) => item.label);
}

/** The TypeScript errors of `text`, each with the source it underlines. */
async function tsErrors(text: string): Promise<{ code: unknown; under: string }[]> {
  const { uri } = await harness.open(FILE);
  await harness.change(uri, text, ++version);
  const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
    textDocument: { uri },
  })) as FullDocumentDiagnosticReport;
  const offsetOf = (line: number, character: number): number =>
    text.split('\n').slice(0, line).reduce((n, l) => n + l.length + 1, 0) + character;
  return report.items
    // Errors only: a handler nobody hangs is "declared but never read", a hint and not a rule.
    .filter((item) => item.source === 'ts' && item.severity === 1)
    .map((item) => ({
      code: item.code,
      under: text.slice(
        offsetOf(item.range.start.line, item.range.start.character),
        offsetOf(item.range.end.line, item.range.end.character),
      ),
    }));
}

beforeAll(async () => {
  harness = await startHarness();
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('criterion 11 — `@` on the template offers the events of the DOM', () => {
  it('the same list the host offers', async () => {
    const onTemplate = await completeTyping(component('', ' @|'), '@');
    expect(onTemplate).toEqual(expect.arrayContaining(['click', 'keydown', 'focusin']));
    expect(onTemplate).not.toContain('@if');
  });

  it('`@cli` narrows to the names that start that way', async () => {
    const labels = await completeTyping(component('', ' @cli|'), '@');
    expect(labels).toContain('click');
    expect(labels.filter((label) => label.startsWith('on'))).toEqual([]);
  });
});

describe('criterion 12 — the same rules in both places', () => {
  it('a handler whose event type does not match is the same error on the host and on the template', async () => {
    const onHost = await tsErrors(component(' @click=@onKey', ''));
    const onTemplate = await tsErrors(component('', ' @click=@onKey'));

    expect(onHost).toHaveLength(1);
    expect(onTemplate).toEqual(onHost);
    expect(onTemplate[0]?.under).toBe('onKey');
  });

  it('a handler that matches says nothing in either place', async () => {
    expect(await tsErrors(component(' @keydown=@onKey', ' @keydown=@onKey'))).toEqual([]);
  });

  it('the DSD’s own attributes are not checked against anybody’s vocabulary', async () => {
    // `shadowrootmode` and `shadowrootadoptedstylesheets` sit on every template of this file:
    // projecting them against HTML's attributes would underline both.
    expect(await tsErrors(component('', ''))).toEqual([]);
  });
});
