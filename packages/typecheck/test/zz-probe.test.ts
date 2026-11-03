import { it, expect } from 'vitest';
import ts from 'typescript';
import { mapToGenerated, clientFileName } from '@fudic/language-core';
import { contractOf, typedContract } from '../src/contract.js';
import { projected } from './_support.js';
it('p', () => {
  const path = '/p/app-x.fud';
  const source = `@code {\n  import { emit } from "@fudic/dom";\n  let count = 0;\n  /** Pressed. */\n  function go() { emit("press", count); emit("change", "a"); emit("change", 1); emit("close"); }\n}\n<app-x>\n  <template shadowrootmode="open"><button onclick="@go">x</button><slot></slot></template>\n</app-x>\n`;
  const { document } = projected(path, source);
  const client = document.virtuals.find((v) => v.fileName === clientFileName(path))!;
  const files = new Map([[client.fileName, client.text]]);
  const service = ts.createLanguageService({
    getScriptFileNames: () => [client.fileName], getScriptVersion: () => '1',
    getScriptSnapshot: (n) => files.has(n) ? ts.ScriptSnapshot.fromString(files.get(n)!) : undefined,
    getCurrentDirectory: () => '/p', getCompilationSettings: () => ({ noLib: true, strict: true }),
    getDefaultLibFileName: () => 'lib.d.ts', fileExists: (n) => files.has(n), readFile: (n) => files.get(n),
  });
  const c = contractOf(source, document.document);
  const t = typedContract(c, service, client.fileName, (o) => mapToGenerated(client, o, 'completion'));
  expect({ c: c.events, t: t.events, text: client.text }).toEqual({});
});
