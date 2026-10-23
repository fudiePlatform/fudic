/**
 * The `@code` of a LAYOUT (SDD-40 §3.1, §4.1): its props, and nothing else.
 *
 * A layout declares props with the same `props<T>()` a component and a route use — one
 * vocabulary, three roles — and that is the ONLY thing its `@code` admits. The restriction
 * is not prudence: it is what keeps a layout from having a half of client.
 *
 *   a `load`    would be a second one with no route to call it (`FUD0430`).
 *   loose logic would run in both renderers with nobody able to say when, and in the
 *               browser it would be code nobody downloads: there is no layout chunk, and
 *               there is not one because the route's chunk crosses the layout's markup
 *               without anchoring a single node (SDD-39 §4.3) — the invariant that keeps
 *               one entry in `sources` (SDD-13 §4.3).
 *
 * `FUD0700` over whatever is left over, `FUD0701` over a prop that asks to be reactive, and
 * the layout is emitted all the same: nothing here throws, and a degraded layout still
 * paints (§5).
 */

import type { LayoutDocument } from '../document/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import { span } from '../types/index.js';
import { FUD0700, FUD0701, FUD0702 } from '@fudic/diagnostics';
import { codeOfDocument, type Prop } from './oxc-code.js';
import { layoutBodyDiagnostics } from '../semantic/analyzers/layout-body.js';
import { EXPORTED_LOAD } from '../semantic/analyzers/layout-load.js';

/**
 * `FUD0703` — «two layouts of one chain declare the same prop with incompatible types» — is
 * RETIRED with the chain itself (`FUD0439`).
 *
 * It existed because the layout props of one render were ONE namespace shared by every link
 * of a chain, so two links could ask the route for a single name that had to be two types.
 * One layout has no one to disagree with. The code is not reused.
 */

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

/** A statement that IS an exported `load`: `FUD0430` speaks for it, not `FUD0700`. */
const LOAD_STATEMENT = new RegExp(`^(?:${EXPORTED_LOAD.source})`, 'u');

/**
 * Read a layout's `@code`: its props, plus what is wrong with the rest of it.
 *
 * The extraction is the component's, unchanged — `codeOfDocument` memoizes on the document,
 * so the golden rule holds: Oxc runs once per file however many readers ask. What this adds
 * is the layout's own contract over the answer.
 */
export function layoutCodeOf(source: string, doc: LayoutDocument): LayoutCode {
  const code = codeOfDocument(source, doc);
  const diagnostics: Diagnostic[] = [...code.diagnostics];

  // Loose logic in the `@code`: it would run in BOTH renderers with nobody able to say when.
  // `neutral` is already the `@code` minus what the emit writes in its own shape, so the
  // `props<T>()` destructuring is not in it — everything that IS, is left over. An exported
  // `load` is `FUD0430`'s, which says more about it than «a statement».
  for (const statement of code.neutral) {
    if (LOAD_STATEMENT.test(statement.text)) continue;
    diagnostics.push(
      FUD0700({ span: span(statement.at, statement.at + statement.text.length), kind: 'statement' }),
    );
  }
  // A `signal(…)` / `computed(…)` declaration is left out of `neutral` — the emit writes its
  // own form of one — so it has to be asked for separately. In a layout it is the same fact
  // as the loose statement above and the same code says it.
  for (const reactive of code.signals) {
    diagnostics.push(FUD0700({ span: reactive.span, kind: 'reactive', name: reactive.name }));
  }

  const props = code.props.map((p) => plain(p, diagnostics));
  // `FUD0705` — a `@{ }` in the `<body>` — and `FUD0893`, a hole inside a construct. The rules
  // are the semantic pass's; the build reads a layout's diagnostics off its emit, so they are
  // asked here too. (`FUD0706` is retired: Razor in any `<style>` is `FUD0132`, decision 136.)
  diagnostics.push(...layoutBodyDiagnostics(doc.body));
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
 * It is asked only of a route with no `layout` to resolve them: the one of a linked `.fudapi`
 * is TypeScript's, which checks the `return` of its handler against the type of
 * `props<{…}>()`, and so is the editor's. One voice per fact (§4.7).
 */
export function unresolvedLayoutProps(
  required: readonly Prop[],
  anchor: Span,
): readonly Diagnostic[] {
  return required.map((prop) =>
    FUD0702(
      prop.type === undefined
        ? { span: anchor, name: prop.name }
        : { span: anchor, name: prop.name, type: prop.type },
    ),
  );
}

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
  out.push(FUD0701({ span: prop.at, name: prop.name }));
  // The value is ignored: the prop crosses by value, and a reactive default is dropped
  // rather than emitted — a `signal` the module cannot import is a `ReferenceError`.
  const { channel: _channel, def: _def, ...rest } = prop;
  return reactiveDefault || prop.def === undefined ? rest : { ...rest, def: prop.def };
}
