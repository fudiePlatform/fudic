/**
 * `a | b` in the view, projected as `$pipe(a, b)` (SDD-58 §4.11, criterion 32).
 *
 * The operands are copied 1:1, so hover, rename and definition keep working on them; only
 * `$pipe(`, the comma — anchored to the `|` — and the `)` are scaffolding. And the real checker,
 * over the projected corpus, puts the error of a value the pipe cannot format on the value.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCAFFOLD_CAPS, USER_CAPS } from '../src/caps.js';
import type { VirtualFile } from '../src/types.js';
import { emitClient } from './_support.js';
import { typecheckCorpus } from './typecheck.js';

const component = (code: string, body: string): string =>
  `@code {\n${code}\n}\n<app-x><template shadowrootmode="open">${body}</template></app-x>\n`;

const CODE = "  const precio = 3.5;\n  const euros = { kind: 'currency', options: {} };\n  const ok = true;";

/** The mapping that starts at the source offset of `needle` in `source`. */
function mappingAt(virtual: VirtualFile, source: string, needle: string, from = 0) {
  const at = source.indexOf(needle, from);
  return virtual.mappings.find((m) => m.sourceOffset === at && m.sourceLength === needle.length);
}

describe('the projection of a pipe', () => {
  it('writes `$pipe(value, preset)` and copies both operands 1:1', () => {
    const source = component(CODE, '<p>@(precio | euros)</p>');
    const virtual = emitClient(source);
    expect(virtual.text).toContain('$pipe(precio, euros)');
    const body = source.indexOf('<p>');
    expect(mappingAt(virtual, source, 'precio', body)?.caps).toEqual(USER_CAPS);
    expect(mappingAt(virtual, source, 'euros', body)?.caps).toEqual(USER_CAPS);
  });

  it('the comma is scaffolding anchored to the `|`', () => {
    const source = component(CODE, '<p>@(precio | euros)</p>');
    const comma = mappingAt(emitClient(source), source, '|');
    expect(comma?.caps).toEqual(SCAFFOLD_CAPS);
    expect(comma?.length).toBe(2);
  });

  it('a chain is left-associative: `a | p | q` is `$pipe($pipe(a, p), q)`', () => {
    expect(emitClient(component(CODE, '<p>@(precio | euros | euros)</p>')).text).toContain(
      '$pipe($pipe(precio, euros), euros)',
    );
  });

  it('with the precedence of `|`: inside `? :` without parentheses', () => {
    expect(emitClient(component(CODE, '<p>@(ok ? precio | euros : "—")</p>')).text).toContain(
      'ok ? $pipe(precio, euros) : "—"',
    );
  });

  it('in an attribute as in content', () => {
    expect(emitClient(component(CODE, '<p title=@(precio | euros)>x</p>')).text).toContain('$pipe(precio, euros)');
  });

  it('`|` in @code stays the OR of bits', () => {
    const virtual = emitClient(component(`${CODE}\n  const bits = 1 | 2;`, '<p>x</p>'));
    expect(virtual.text).toContain('const bits = 1 | 2;');
    expect(virtual.text).not.toContain('$pipe(1');
  });
});

describe('the checker over the projection', () => {
  const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
  const SLUG = 'blog/[slug].fud';
  const slug = readFileSync(resolve(FIXTURES, SLUG), 'utf8');
  /** A preset that formats numbers, written structurally: the corpus has no `@fudic/i18n`. */
  const PRESET =
    "  const euros = { kind: 'currency', options: {} } as { readonly kind: 'currency'; readonly options: object; readonly __in?: (v: number | bigint) => void };";

  const withPipe = (decl: string, markup: string): Record<string, string> => ({
    [SLUG]: slug
      .replace('  type PageData', `${PRESET}\n${decl}\n  type PageData`)
      .replace('  <p>@data.body</p>', `  <p>@data.body</p>\n  ${markup}`),
  });

  it('a value the preset formats is accepted', () => {
    expect(typecheckCorpus(withPipe('  const precio = 3.5;', '<p>@(precio | euros)</p>'))).toEqual([]);
  });

  it('criterion 21: a value it cannot format is the error, on the value', () => {
    const diags = typecheckCorpus(withPipe("  const nombre: string = 'Ana';", '<p>@(nombre | euros)</p>'));
    expect(diags).toHaveLength(1);
    expect(diags[0]!.sourceText).toBe('nombre');
  });

  it('criterion 32: a right operand that is no preset is the error, on the operand', () => {
    const diags = typecheckCorpus(withPipe('  const precio = 3.5;\n  const cinco = 5;', '<p>@(precio | cinco)</p>'));
    expect(diags).toHaveLength(1);
    expect(diags[0]!.sourceText).toBe('cinco');
  });
});
