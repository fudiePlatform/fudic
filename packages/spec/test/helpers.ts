import type { SourceDiagnostic, Span } from '@fudic/diagnostics';
import { parseSpec, type Arg, type SpecFile } from '../src/index.js';

/** The canonical file of SDD-52 §1, plus a criterion with `when` and `then`. */
export const CANONICAL = [
  'component fud-button',
  '',
  'criterion tamano-tactil-minimo',
  '  given',
  '    route /playground/button',
  '  then',
  '    min-height fud-button 44',
  '',
  'criterion icono-cambia   # the icon follows the attribute',
  '  when',
  '    set-attribute fud-button icon "search"',
  '  then',
  '    visible role:button/"Buscar"',
  '',
].join('\n');

/** Every fixture a sweep starts from. */
export const FIXTURES: readonly string[] = [
  CANONICAL,
  [
    'component fud-card # comment',
    'criterion a',
    '  given',
    '    props titulo-largo',
    '    route /x "y \\"z\\""',
    '  when',
    '    click role:button/"Detalles con espacio"',
    '  then',
    '    min-height x #fff',
    '    text a#b "\\\\"',
  ].join('\n'),
];

export const slice = (source: string, s: Span): string => source.slice(s.start, s.end);

export const codes = (source: string): readonly string[] => parseSpec(source).diagnostics.map((d) => d.code);

/** The only diagnostic of a source, which must have exactly one. */
export function only(source: string): SourceDiagnostic {
  const { diagnostics } = parseSpec(source);
  if (diagnostics.length !== 1) throw new Error(`expected one diagnostic, got ${diagnostics.map((d) => d.code).join(', ')}`);
  return diagnostics[0] as SourceDiagnostic;
}

/** Every span in a tree, for invariants over all of them. */
export function spansOf(file: SpecFile): readonly Span[] {
  const out: Span[] = [file.span, ...file.comments];
  if (file.component !== undefined) {
    out.push(file.component.span, file.component.keyword);
    if (file.component.tag !== undefined) out.push(file.component.tag.span);
  }
  for (const c of file.criteria) {
    out.push(c.span, c.keyword);
    if (c.slug !== undefined) out.push(c.slug.span);
    for (const b of c.blocks) {
      out.push(b.span, b.keyword);
      for (const t of b.terms) {
        out.push(t.span, t.name.span);
        for (const a of t.args) out.push(...argSpans(a));
      }
    }
  }
  return out;
}

function argSpans(a: Arg): readonly Span[] {
  if (a.kind === 'string') return [a.span, a.contentSpan];
  if (a.kind === 'role') return a.name !== undefined ? [a.span, a.role.span, a.name.span] : [a.span, a.role.span];
  return [a.span];
}

/** The tree with every span dropped, to compare two parses whose offsets differ. */
export function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'span' || k === 'contentSpan' || k === 'comments' || (k === 'keyword' && typeof v === 'object')) continue;
      out[k] = shape(v);
    }
    return out;
  }
  return value;
}
