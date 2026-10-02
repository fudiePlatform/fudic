/**
 * The `.fudspec` parser. Indentation is the structure:
 *
 *     component fud-button          0 spaces
 *     criterion touch-target        0 spaces
 *       given                       2 spaces
 *         route /playground/button  4 spaces
 *       then
 *         min-height fud-button 44
 *
 * It never throws. A line with a wrong indentation is reported and then read at the level
 * its first word belongs to (`criterion` at 0, a block at 2, anything else at 4), so one stray
 * space costs one diagnostic and not the rest of the file. A line that cannot be placed is
 * reported once, and the term lines under it are skipped without a diagnostic each.
 */

import {
  FUD0921,
  FUD0922,
  FUD0923,
  FUD0924,
  FUD0925,
  FUD0926,
  FUD0927,
  FUD0928,
  FUD0929,
  FUD0930,
  FUD0931,
  FUD0932,
  FUD0933,
  FUD0934,
  FUD0935,
  emptySpan,
  span,
  type SourceDiagnostic,
  type Span,
} from '@fudic/diagnostics';
import { toArg } from './args.js';
import type { Block, BlockKind, ComponentDecl, Criterion, Name, ParseResult, SpecFile, TermLine } from './ast.js';
import { levelOf, lines, readLine, type Token } from './line.js';

const BLOCKS: readonly BlockKind[] = ['given', 'when', 'then'];

const isBlock = (word: string): word is BlockKind => (BLOCKS as readonly string[]).includes(word);

interface OpenBlock {
  readonly block: BlockKind;
  readonly keyword: Span;
  readonly terms: TermLine[];
  end: number;
}

interface OpenCriterion {
  readonly keyword: Span;
  readonly slug?: Name;
  readonly blocks: OpenBlock[];
  /** Index in BLOCKS of the last block opened, -1 before the first. */
  order: number;
  end: number;
}

/** Where a term line goes: a block, nowhere silently, or nowhere with a diagnostic. */
type Sink = OpenBlock | 'skip' | 'none';

export function parseSpec(source: string): ParseResult<SpecFile> {
  const out: SourceDiagnostic[] = [];
  const comments: Span[] = [];
  const criteria: Criterion[] = [];
  const slugs = new Map<string, Span>();
  let component: ComponentDecl | undefined;
  let current: OpenCriterion | undefined;
  let sink: Sink = 'none';

  const close = (): void => {
    if (current !== undefined) criteria.push(closeCriterion(current, out));
    current = undefined;
    sink = 'none';
  };

  for (const [start, end] of lines(source)) {
    const line = readLine(source, start, end, out);
    if (line.comment !== undefined) comments.push(line.comment);
    const [head, ...rest] = line.tokens;
    if (head === undefined) continue;

    const level = levelOf(line.indent, head.raw);
    if (line.tabbed || level !== line.indent) out.push(FUD0921({ span: line.indentSpan }));
    const lineEnd = (line.tokens[line.tokens.length - 1] as Token).span.end;

    if (level === 0) {
      if (head.raw === 'component') {
        const decl = declaration(head, rest, 'component', out);
        if (component !== undefined) {
          out.push(FUD0923({ span: head.span, related: [{ span: component.span, message: 'declared here' }] }));
        } else {
          if (criteria.length > 0 || current !== undefined) out.push(FUD0924({ span: head.span }));
          component = {
            kind: 'component',
            keyword: head.span,
            ...(decl !== undefined ? { tag: decl } : {}),
            span: span(head.span.start, lineEnd),
          };
        }
        close();
      } else if (head.raw === 'criterion') {
        close();
        const slug = declaration(head, rest, 'criterion', out);
        if (slug !== undefined) {
          const first = slugs.get(slug.text);
          if (first !== undefined) {
            out.push(FUD0927({ span: slug.span, slug: slug.text, related: [{ span: first, message: 'first declared here' }] }));
          } else {
            slugs.set(slug.text, slug.span);
          }
        }
        current = { keyword: head.span, ...(slug !== undefined ? { slug } : {}), blocks: [], order: -1, end: lineEnd };
      } else {
        out.push(FUD0928({ span: head.span, found: head.raw }));
      }
      continue;
    }

    if (level === 2) {
      if (!isBlock(head.raw)) {
        out.push(FUD0929({ span: head.span, found: head.raw }));
        sink = 'skip';
      } else if (current === undefined) {
        out.push(FUD0931({ span: head.span }));
        sink = 'skip';
      } else {
        const order = BLOCKS.indexOf(head.raw);
        if (order <= current.order) out.push(FUD0930({ span: head.span, keyword: head.raw }));
        current.order = Math.max(current.order, order);
        trailing(rest, head.raw, out);
        const block: OpenBlock = { block: head.raw, keyword: head.span, terms: [], end: lineEnd };
        current.blocks.push(block);
        current.end = lineEnd;
        sink = block;
      }
      continue;
    }

    if (sink === 'none') {
      out.push(FUD0932({ span: span(head.span.start, lineEnd) }));
      sink = 'skip';
    } else if (sink !== 'skip') {
      sink.terms.push({
        kind: 'term',
        name: nameOf(head, out),
        args: rest.map((t) => toArg(t, out)),
        span: span(head.span.start, lineEnd),
      });
      sink.end = lineEnd;
      (current as OpenCriterion).end = lineEnd;
    }
  }
  close();

  if (component === undefined) out.push(FUD0922({ span: emptySpan(0) }));

  return {
    value: {
      kind: 'spec',
      ...(component !== undefined ? { component } : {}),
      criteria,
      comments,
      span: span(0, source.length),
    },
    // In reading order: some are only known when a criterion closes, lines after their place.
    diagnostics: out.sort((a, b) => a.span.start - b.span.start),
  };
}

/** The name after `component` or `criterion`, and a report for anything missing or extra. */
function declaration(
  head: Token,
  rest: readonly Token[],
  keyword: 'component' | 'criterion',
  out: SourceDiagnostic[],
): Name | undefined {
  const [name, ...extra] = rest;
  if (name === undefined) {
    out.push(FUD0925({ span: head.span, keyword }));
    return undefined;
  }
  trailing(extra, keyword, out);
  return nameOf(name, out);
}

/** Report tokens a structural line does not take, as one span. */
function trailing(extra: readonly Token[], keyword: 'component' | 'criterion' | BlockKind, out: SourceDiagnostic[]): void {
  const first = extra[0];
  const last = extra[extra.length - 1];
  if (first !== undefined && last !== undefined) {
    out.push(FUD0926({ span: span(first.span.start, last.span.end), keyword }));
  }
}

/** A tag, a slug or a term name: a bare word. Anything quoted is reported and kept as written. */
function nameOf(token: Token, out: SourceDiagnostic[]): Name {
  if (token.quoted.length > 0 && token.quoted.every((q) => q.closed)) out.push(FUD0935({ span: token.span }));
  return { text: token.raw, span: token.span };
}

/** Freeze a criterion, reporting empty blocks and a missing `then`. */
function closeCriterion(open: OpenCriterion, out: SourceDiagnostic[]): Criterion {
  const blocks: Block[] = open.blocks.map((b) => {
    if (b.terms.length === 0) out.push(FUD0934({ span: b.keyword, keyword: b.block }));
    return { kind: 'block', block: b.block, keyword: b.keyword, terms: b.terms, span: span(b.keyword.start, b.end) };
  });
  // A criterion without a slug is already reported, and while it is being typed a second
  // error on the same line is noise.
  if (open.slug !== undefined && !open.blocks.some((b) => b.block === 'then')) {
    out.push(FUD0933({ span: open.slug.span, slug: open.slug.text }));
  }
  return {
    kind: 'criterion',
    keyword: open.keyword,
    ...(open.slug !== undefined ? { slug: open.slug } : {}),
    blocks,
    span: span(open.keyword.start, open.end),
  };
}
