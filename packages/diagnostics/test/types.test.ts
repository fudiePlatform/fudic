/**
 * SDD-50 criterion 7 and invariant 3: a code's input is typed. A parameter that is missing, or
 * one the code does not declare, does not compile — `pnpm typecheck` is what runs this file's
 * `@ts-expect-error`s; the runtime half only proves each call still returns its code.
 *
 * Each `@ts-expect-error` FAILS the typecheck if its line ever starts compiling: the day a
 * code accepts loose parameters, this file says so.
 */

import { describe, expect, it } from 'vitest';
import { FUD0051, FUD0443, FUD0451, FUD0761, span, type ProjectDiagnostic, type SourceDiagnostic } from '../src/index.js';

const S = span(0, 1);

describe('a code takes exactly its parameters (criterion 7)', () => {
  it('a missing parameter does not compile', () => {
    // @ts-expect-error — `name` is what the message is composed from.
    expect(FUD0051({ span: S }).code).toBe('FUD0051');
    // @ts-expect-error — a source code has nowhere to point without its span.
    expect(FUD0051({ name: 'p' }).code).toBe('FUD0051');
    // @ts-expect-error — a file code without its file.
    expect(FUD0443({ target: 'file' }).code).toBe('FUD0443');
  });

  it('a parameter the code does not declare does not compile', () => {
    // @ts-expect-error — `tag` is not a parameter of FUD0051.
    expect(FUD0051({ span: S, name: 'p', tag: 'x' }).code).toBe('FUD0051');
    // @ts-expect-error — a project code has no place to be given.
    expect(FUD0451({ line: 'x', status: 1, file: 'a' }).code).toBe('FUD0451');
  });

  it('a discriminant outside its set does not compile', () => {
    // @ts-expect-error — `target` is 'directory' or 'file'.
    expect(FUD0443({ file: 'a', target: 'folder' }).code).toBe('FUD0443');
  });

  it('the severity is the code’s, never the caller’s', () => {
    // @ts-expect-error — no code takes a severity.
    expect(FUD0051({ span: S, name: 'p', severity: 'warning' }).severity).toBe('error');
  });

  it('a code with two forms returns the shape each form allows', () => {
    const link: SourceDiagnostic = FUD0761({ kind: 'link', span: S, tag: 'x-a', defined: 'a', path: 'b' });
    const library: ProjectDiagnostic = FUD0761({ kind: 'library', tag: 'x-a', library: 'ui', file: 'a' });
    expect(link.span).toEqual(S);
    expect(library).not.toHaveProperty('span');
    // @ts-expect-error — the library form has no span to give back.
    const wrong: SourceDiagnostic = FUD0761({ kind: 'library', tag: 'x-a', library: 'ui', file: 'a' });
    expect(wrong.code).toBe('FUD0761');
  });
});
