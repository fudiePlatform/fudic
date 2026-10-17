/**
 * BUG-50 §6.5 — `expect(t.host).toBeInTheDocument()` types in the user's `tsc` and editor, with
 * nothing but `@fudic/testing` imported. The setup registers jest-dom's matchers at runtime; their
 * types travel in the package's own declaration, so the reference has to survive the build.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const INDEX = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const REFERENCE = '/// <reference types="@testing-library/jest-dom/vitest" preserve="true" />';

describe('the jest-dom matchers, typed by importing @fudic/testing', () => {
  it('keeps the reference in the declaration the build emits', () => {
    const { outputText } = ts.transpileDeclaration(readFileSync(INDEX, 'utf8'), { fileName: INDEX });
    expect(outputText).toContain(REFERENCE);
  });

  it('types toBeInTheDocument in a file that imports only the package', () => {
    const probe = fileURLToPath(new URL('./matcher-types.probe.ts', import.meta.url)).replaceAll('\\', '/');
    const source = `import { expect } from 'vitest';
import { mount } from '../src/index.js';
void mount;
expect(document.body).toBeInTheDocument();
`;
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      // No ambient types: what types the matcher has to come through the import.
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const read = host.readFile.bind(host);
    host.readFile = (file) => (file === probe ? source : read(file));
    const exists = host.fileExists.bind(host);
    host.fileExists = (file) => file === probe || exists(file);
    const getSource = host.getSourceFile.bind(host);
    host.getSourceFile = (file, version) =>
      file === probe ? ts.createSourceFile(file, source, version) : getSource(file, version);

    const program = ts.createProgram([probe], options, host);
    const errors = ts
      .getPreEmitDiagnostics(program, program.getSourceFile(probe))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
    // A whole program is typechecked: seconds, longer under coverage.
  }, 60_000);
});
