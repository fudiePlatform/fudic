/**
 * BUG-16 §3.3 — the contract, measured with `tsc` BEFORE any emitter is written.
 *
 * In fudic a property is written with a dot, so a plain attribute on a component is HTML's
 * own vocabulary and nothing else. The projection says that by checking it against
 * `$attrs<{}>({ … })`, i.e. `{} & $GlobalAttrs`, and the whole plan rests on TypeScript
 * giving a BETTER error there than a `FUD` code would: one that lands on the NAME and
 * suggests the global the user meant. That is not something to assume — it is measured
 * here, the way BUG-11 measured its own intersection before trusting it.
 */
import { describe, expect, it } from 'vitest';
import { posix } from 'node:path';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '../src/globals.js';

const ROOT = '/probe';
const PROBE = posix.join(ROOT, 'probe.ts');

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  skipLibCheck: true,
  noEmit: true,
};

/** One complaint of the checker, with the probe text it actually underlines. */
interface Complaint {
  readonly code: number;
  readonly message: string;
  readonly text: string;
}

/** Typecheck one probe body against `GLOBALS_DTS` and report what the checker says. */
function check(body: string): readonly Complaint[] {
  const files = new Map<string, string>([
    [posix.join(ROOT, GLOBALS_FILE_NAME), GLOBALS_DTS],
    [PROBE, body],
  ]);
  const read = (f: string): string | undefined =>
    files.get(f) ?? (f.includes('lib.') ? readFileSync(f, 'utf8') : undefined);

  const host: ts.CompilerHost = {
    fileExists: (f) => files.has(f) || f.includes('lib.'),
    readFile: read,
    getSourceFile: (f, v) => {
      const text = read(f);
      return text === undefined ? undefined : ts.createSourceFile(f, text, v, true);
    },
    getDefaultLibFileName: () =>
      posix.join(
        ...ts.getDefaultLibFilePath(OPTIONS).split(/[\\/]/).slice(0, -1),
        'lib.es2023.full.d.ts',
      ),
    writeFile: () => undefined,
    getCurrentDirectory: () => ROOT,
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };

  const program = ts.createProgram({ rootNames: [...files.keys()], options: OPTIONS, host });
  return program.getSemanticDiagnostics().map((d) => ({
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    text: d.start === undefined ? '' : body.slice(d.start, d.start + (d.length ?? 0)),
  }));
}

describe('a plain attribute is checked against $GlobalAttrs alone (§3.3, §6.6)', () => {
  it('rejects a name that is not HTML vocabulary, ON the name', () => {
    const [only, ...rest] = check(`$attrs<{}>({ tone: 'info' });`);
    expect(rest).toEqual([]);
    expect(only!.code).toBe(2353); // Object literal may only specify known properties
    expect(only!.text).toBe('tone');
    expect(only!.message).toContain("'tone'");
  });

  it('keeps the suggestion when the name is a misspelt global', () => {
    const [only] = check(`$attrs<{}>({ titel: 'x' });`);
    expect(only!.code).toBe(2561); // …did you mean to write 'title'?
    expect(only!.text).toBe('titel');
    expect(only!.message).toContain("'title'");
  });

  it('accepts the globals, the data-* and the aria-*', () => {
    expect(
      check(`$attrs<{}>({ id: 'x', class: 'c', role: 'button', 'data-x': 1, 'aria-label': 'l' });`),
    ).toEqual([]);
  });

  it('still checks a declared prop against the component contract', () => {
    const withProps = `type P = { tone?: 'neutral' | 'success' };\n$attrs<P>({ tone: 'nope' });`;
    const [only] = check(withProps);
    expect(only!.code).toBe(2322); // not assignable
    expect(only!.text).toBe('tone');
  });
});
