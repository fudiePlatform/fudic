/**
 * `<input ...resto>` in the editor: projected as `$spreadAttrs(resto)`, which takes any object.
 *
 * Which keys become attributes is the runtime's to filter, so the projection asks only one
 * thing of the value — that it is an object (or nothing). A number is not; an object with
 * keys no attribute has is. And a bare `...` is the same completion anchor a component has.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapToGenerated } from '../src/mapping.js';
import { languageServiceFor, projectCorpus, typecheckCorpus } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';
const source = readFileSync(resolve(FIXTURES, SLUG), 'utf8');

/** The slug page with `decl` in its `@code` and `markup` after its body paragraph. */
const withNative = (decl: string, markup: string): Record<string, string> => ({
  [SLUG]: source
    .replace('  type PageData', `${decl}\n  type PageData`)
    .replace('  <p>@data.body</p>', `  <p>@data.body</p>\n  ${markup}`),
});

describe('a spread on a native element', () => {
  it('any object checks clean, whatever keys it carries', () => {
    const decl = "  const resto = { placeholder: 'x', required: true, maxlength: 20, extra: { a: 1 } };";
    expect(typecheckCorpus(withNative(decl, '<input ...resto>'))).toEqual([]);
  });

  it('null or undefined is fine: it writes nothing', () => {
    const decl = '  const nada: { a: string } | null | undefined = null;';
    expect(typecheckCorpus(withNative(decl, '<input ...nada>'))).toEqual([]);
  });

  it('a number is a type error, on the expression', () => {
    const diags = typecheckCorpus(withNative('  const n = 3;', '<input ...n>'));
    expect(diags.map((d) => [d.code, d.sourceText])).toEqual([[2345, 'n']]);
  });

  it('a bare `...` offers the names in scope', () => {
    const files = withNative("  const elegido = { a: 'x' };", '<input ...>');
    const text = files[SLUG]!;
    const offset = text.indexOf('<input ...') + '<input ...'.length;
    const virtual = projectCorpus(files).find((p) => p.file.path === SLUG)!.virtuals[0]!;
    const at = mapToGenerated(virtual, offset, 'completion');
    expect(at).toBeDefined();
    const { service, pathOf } = languageServiceFor(files);
    const names = (service.getCompletionsAtPosition(pathOf(virtual.fileName), at!, undefined)?.entries ?? []).map((e) => e.name);
    expect(names).toContain('elegido');
  });
});
