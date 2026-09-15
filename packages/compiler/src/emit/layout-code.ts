/**
 * The `@code` of a LAYOUT (SDD-40 §3.1, §4.1): its props, and nothing else.
 *
 * A layout declares props with the same `props<T>()` a component and a route use — one
 * vocabulary, three roles — and that is the ONLY thing its `@code` admits. The restriction
 * is not prudence: it is what keeps a layout from having a half of client.
 *
 *   `@server`   would be a second `load` with no route to call it.
 *   `@client`   would be code nobody downloads: there is no layout chunk, and there is not
 *               one because the route's chunk crosses the layout's markup without anchoring
 *               a single node (SDD-39 §4.3) — the invariant that keeps one entry in
 *               `sources` (SDD-13 §4.3).
 *   loose logic would run in both renderers with nobody able to say when.
 *
 * `FUD0700` over whatever is left over, `FUD0701` over a prop that asks to be reactive, and
 * the layout is emitted all the same: nothing here throws, and a degraded layout still
 * paints (§5).
 */

import type { LayoutDocument } from '../document/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import { errorDiag, span } from '../types/index.js';
import { codeOfDocument, type Prop } from './oxc-code.js';

/** A layout's `@code` contains something that is not its declaration of props. */
const FUD_LAYOUT_CODE = 'FUD0700';
/** A layout prop asks for a reactive value. */
const FUD_LAYOUT_REACTIVE_PROP = 'FUD0701';
/** The route does not resolve a REQUIRED prop of its layout. */
const FUD_LAYOUT_PROP_UNRESOLVED = 'FUD0702';
/** Two layouts of one chain declare the same prop with incompatible types. */
const FUD_LAYOUT_PROP_CLASH = 'FUD0703';

/**
 * A reactive declaration written as a prop's DEFAULT: `const { theme = signal("light") }`.
 *
 * Anchored at the start of the default expression, and that anchor is what makes a text test
 * honest here: `def` is the verbatim source of ONE expression, so a match at offset zero is
 * the callee of that expression and cannot be a `signal` inside a string or a comment. The
 * other half of the rule — a prop whose declared type is `Signal<…>` — is read off the AST,
 * where `channel` already carries it.
 */
const REACTIVE_DEFAULT = /^(?:signal|computed)\s*\(/u;

/** What the emit takes out of a layout's `@code`. */
export interface LayoutCode {
  /**
   * The props the layout declares, in source order, with their defaults.
   *
   * A prop `FUD0701` rejected is still here — with its reactive half REMOVED, which is what
   * «the value is ignored» means: it crosses by value like every other layout prop, and the
   * reactive default does not reach the emitted module. A layout that degrades still paints.
   */
  readonly props: readonly Prop[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Read a layout's `@code`: its props, plus what is wrong with the rest of it.
 *
 * The extraction is the component's, unchanged — `codeOfDocument` memoizes on the document,
 * so the golden rule holds: Oxc runs once per file however many readers ask. What this adds
 * is the layout's own contract over the answer.
 */
export function layoutCodeOf(
  source: string,
  doc: LayoutDocument,
  inherited: readonly Prop[] = [],
): LayoutCode {
  const code = codeOfDocument(source, doc);
  const diagnostics: Diagnostic[] = [...code.diagnostics];

  // A region of its own. The span covers the whole `@server { … }` marker, because what is
  // wrong is the region and not one statement inside it.
  for (const part of doc.code?.parts ?? []) {
    if (part.type === 'server-region') {
      diagnostics.push(
        errorDiag(
          FUD_LAYOUT_CODE,
          'a layout has no `@server` region: it would be a second `load` with no route to call it. Its data comes from the route, which resolves its props in `export function layout(ctx, data)`',
          part.span,
        ),
      );
    } else if (part.type === 'client-region') {
      diagnostics.push(
        errorDiag(
          FUD_LAYOUT_CODE,
          'a layout has no `@client` region: there is no layout chunk for it to travel in, and a layout prop is a render value that never repaints',
          part.span,
        ),
      );
    }
  }

  // Loose logic in the neutral zone: it would run in BOTH renderers with nobody able to say
  // when. `neutral` is already the zone minus what the emit writes in its own shape, so the
  // `props<T>()` destructuring is not in it — everything that IS, is left over.
  for (const statement of code.neutral) {
    diagnostics.push(
      errorDiag(
        FUD_LAYOUT_CODE,
        'the `@code` of a layout declares its props and nothing else: this statement would run in both renderers with nobody able to say when',
        span(statement.at, statement.at + statement.text.length),
      ),
    );
  }
  // A `signal(…)` / `computed(…)` declaration is left out of `neutral` — the emit writes its
  // own form of one — so it has to be asked for separately. In a layout it is the same fact
  // as the loose statement above and the same code says it.
  for (const reactive of code.signals) {
    diagnostics.push(
      errorDiag(
        FUD_LAYOUT_CODE,
        `a layout declares no reactive state: \`${reactive.name}\` has no half of client that could repaint it`,
        reactive.span,
      ),
    );
  }

  const props = code.props.map((p) => plain(p, diagnostics));
  reportClashes(props, inherited, doc.layoutLink?.openSpan, diagnostics);
  return { props, diagnostics };
}

/**
 * The props the whole layout chain of a graph REQUIRES — no default and not optional.
 *
 * Read off `codeOfDocument` rather than `layoutCodeOf`: what is wanted is what the chain
 * declares, and each layout's own diagnostics belong to its own module. A prop with a default
 * is not required, which is the whole of §6.3's first half — the default is the answer to
 * «the route resolved nothing», not a problem to report.
 */
export function requiredLayoutProps(
  layouts: readonly { readonly source: string; readonly doc: LayoutDocument }[],
): readonly Prop[] {
  return layouts
    .flatMap((l) => codeOfDocument(l.source, l.doc).props)
    .filter((p) => !p.optional && p.def === undefined);
}

/**
 * `FUD0702` — a required prop of the layout that the route does not resolve (§4.7).
 *
 * That a route fails to resolve one is an ERROR and nothing softer; it is the same contract a
 * component's required prop has, reported the same way (SDD-36 §3.1). It lands on the route's
 * `<link rel="layout">`, which is where the route declares the relation and therefore the one
 * place in the file that is about the layout at all.
 *
 * `resolved` is what `layout(ctx, data)` returns, and `undefined` there means «no resolver, or
 * one this pass cannot read». The first case is exactly what the diagnostic is for; the second
 * would be inventing an error, and the caller separates them before calling.
 *
 * In the EDITOR this is not served: the fact is TypeScript's, which checks the `return` of
 * `layout` against the type of `props<{…}>()` over the projection. One voice per fact — what
 * the server adds there is the hands, not a second opinion (§4.7).
 */
export function unresolvedLayoutProps(
  required: readonly Prop[],
  resolved: readonly string[],
  anchor: Span,
): readonly Diagnostic[] {
  const has = new Set(resolved);
  return required
    .filter((prop) => !has.has(prop.name))
    .map((prop) =>
      errorDiag(
        FUD_LAYOUT_PROP_UNRESOLVED,
        `the layout requires the prop \`${prop.name}\`${prop.type === undefined ? '' : `: ${prop.type}`} and this route does not resolve it — return it from \`export function layout(ctx, data)\``,
        anchor,
      ),
    );
}

/**
 * `FUD0703` — the same name declared twice in one chain, with two different types (§4.8).
 *
 * There is ONE namespace for the layout props of a render: what the route's
 * `layout(ctx, data)` returns is the union of what the chain declares, and each link takes
 * its own names out of the one object. So two links that spell the same name differently are
 * asking the route for one value that has to be two things.
 *
 * Anchored on the nested layout's `<link rel="layout">`, which is where THIS file declares
 * the relation — the same place `FUD0702` lands on the route's, and the only span of the
 * chain that belongs to the file being emitted. A type neither file states is not compared:
 * «not provable» invents no error, exactly as it does not for `optional` (BUG-23 §4.4).
 */
function reportClashes(
  own: readonly Prop[],
  inherited: readonly Prop[],
  anchor: Span | undefined,
  out: Diagnostic[],
): void {
  if (anchor === undefined) return;
  const above = new Map(inherited.map((p) => [p.name, p]));
  for (const prop of own) {
    const parent = above.get(prop.name);
    if (parent === undefined || prop.type === undefined || parent.type === undefined) continue;
    if (normalizeType(prop.type) === normalizeType(parent.type)) continue;
    out.push(
      errorDiag(
        FUD_LAYOUT_PROP_CLASH,
        `the layout prop \`${prop.name}\` is declared as \`${prop.type}\` here and as \`${parent.type}\` by a layout above it: one render resolves one value under one name`,
        anchor,
      ),
    );
  }
}

/**
 * Type sources compared as text, with whitespace collapsed.
 *
 * Deliberately not a type comparison: this pass has an AST, and `string` against `String` is
 * a question for a typechecker. What it catches is what it is for — the two layouts that
 * wrote `string` and `Post`.
 */
const normalizeType = (type: string): string => type.replace(/\s+/gu, ' ').trim();

/**
 * One prop, with whatever made it reactive taken off it and reported.
 *
 * Two ways to write the same mistake and one code for both: the type says `Signal<…>`, or
 * the default IS a `signal(…)`. What is lost by refusing them is exactly nothing of what
 * motivated the spec — a culture does not change without a reload (§4.3).
 */
function plain(prop: Prop, out: Diagnostic[]): Prop {
  const reactiveDefault = prop.def !== undefined && REACTIVE_DEFAULT.test(prop.def);
  if (prop.channel !== 'signal' && !reactiveDefault) return prop;
  out.push(
    errorDiag(
      FUD_LAYOUT_REACTIVE_PROP,
      `the layout prop \`${prop.name}\` may not be reactive: a layout has no half of client that could repaint it, and a chunk that had to know which of its nodes to repaint would have to anchor them (SDD-39 §4.3)`,
      prop.at,
    ),
  );
  // The value is ignored: the prop crosses by value, and a reactive default is dropped
  // rather than emitted — a `signal` the module cannot import is a `ReferenceError`.
  const { channel: _channel, def: _def, ...rest } = prop;
  return reactiveDefault || prop.def === undefined ? rest : { ...rest, def: prop.def };
}
