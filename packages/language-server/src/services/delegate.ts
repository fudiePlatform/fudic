/**
 * The names a `delegate:` may write (SDD-37 §6.19).
 *
 * The twin of `styleClassNames`, and the same case one door over: a finite, local, ALREADY
 * PARSED list, answered by the server and never by TypeScript. There the names live in the
 * `<style>` of the file; here in the header of the loop the attribute is written in — which
 * the batch parsed once, for the scope of every expression around it.
 *
 * Offering IS validating here, which is where the two part company: a name outside this list
 * is `FUD0662`, so the completion is not a convenience but the way the error stops being
 * written at all.
 */

import {
  VALUE_ARGUMENT,
  documentRoots,
  eventsReadingRow,
  handlerAt,
  span,
  type DelegationJs,
  type HandlerFacts,
  type OxcNode,
  type Region,
  type Span,
} from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import { handlerArgumentsAt, type DelegateValueContext } from './position.js';
import { loopBindingNames } from './template-scope.js';

/** The delegation's view of the batch this document already parsed. */
function delegationJs(document: CachedDocument): DelegationJs {
  const astOf = (node: Parameters<CachedDocument['js']['fragmentId']>[0]): OxcNode | undefined => {
    const id = document.js.fragmentId(node);
    const root = id === undefined ? undefined : document.js.result.ast(id);
    return Array.isArray(root) ? undefined : (root as OxcNode | undefined);
  };
  return {
    headerAst: astOf,
    valueAst: astOf,
    spanOf: (node) => document.js.result.mapSpan(node.start, node.end),
    scope: new Set(),
  };
}

/**
 * The events a `delegate:p="…"` may still list (decision 176): those of the handlers above the
 * marker that read `p`, minus the ones its value already names. Spelled without `@`, because
 * the value is a list of event NAMES and not of bindings — a named handler with its name,
 * `click.borrar` (decision 179).
 *
 * The answer comes from the compiler's own pairing, read over the batch this document already
 * parsed: what is offered is exactly what `FUD1381` accepts.
 */
export function delegateEvents(document: CachedDocument, at: DelegateValueContext): readonly string[] {
  const events = eventsReadingRow(document.source, documentRoots(document.document), delegationJs(document), at.element, at.name);
  return events.filter((event) => !at.listed.includes(event));
}

/**
 * What `$value` reads in the handler whose attribute is `attribute`, and the marks that serve it
 * (SDD-80 §4.8): the compiler's own plan, so `$value` is offered exactly where it compiles.
 */
export function handlerFacts(document: CachedDocument, attribute: Span): HandlerFacts {
  return handlerAt(document.source, documentRoots(document.document), delegationJs(document), attribute);
}

/**
 * The bindings of every loop whose body contains `offset`, innermost last.
 *
 * Every enclosing loop and not only the innermost, because a marker may name any of them
 * (decision 119): `<b delegate:row delegate:tag>` inside two `@foreach` is one element handing
 * over two identities. Source order puts the outer names first, which is the order they are
 * declared in.
 *
 * `headerEnd` is what keeps a name from being offered where it does not exist yet: inside
 * `(const x of xs)` the `x` is being declared, and an attribute cannot be written there at all.
 */
export function delegateNames(document: CachedDocument, offset: number): readonly string[] {
  const names = new Set<string>();
  for (const loop of document.js.loops) {
    if (offset < loop.headerEnd || offset > loop.span.end) continue;
    for (const name of loopBindingNames(loop.statement)) names.add(name);
  }
  return [...names];
}

/** A hover the delegation answers: its text and the stretch it is about. */
export interface HandlerHover {
  readonly value: string;
  readonly span: Span;
}

/** `@click.borrar`: the event and the name of its handler (decision 179). */
const NAMED_EVENT = /^@([A-Za-z][-\w]*)\.([a-z][a-z0-9-]*)$/u;

/**
 * The hover over what a handler is written with (SDD-80 §4.8): `$value` in its arguments, with the
 * type and the element it is read from; and the name of a named handler, `@click.borrar`, with the
 * event it listens to and how many marks serve it.
 */
export function handlerHover(document: CachedDocument, offset: number, region: Region): HandlerHover | undefined {
  const attribute = region.attribute;
  if (attribute === undefined || typeof attribute.name !== 'string') return undefined;

  const named = NAMED_EVENT.exec(attribute.name);
  const nameEnd = attribute.span.start + attribute.name.length;
  if (named !== null && offset <= nameEnd) {
    const marks = handlerFacts(document, attribute.span).served?.marks ?? 0;
    return {
      value: `\`${named[1]!}\`, handler \`${named[2]!}\`; read by ${marks} ${marks === 1 ? 'mark' : 'marks'} \`delegate:…="${named[1]!}.${named[2]!}"\`.`,
      span: span(attribute.span.start, nameEnd),
    };
  }

  const start = offset - /[\w$]*$/u.exec(document.source.slice(0, offset))![0].length;
  const end = offset + /^[\w$]*/u.exec(document.source.slice(offset))![0].length;
  if (document.source.slice(start, end) !== VALUE_ARGUMENT || handlerArgumentsAt(document.source, start, region) === undefined) return undefined;
  const facts = handlerFacts(document, attribute.span);
  if (facts.value === undefined) return undefined;
  const from = facts.served === undefined ? 'the element that carries the event' : `the element marked \`delegate:${facts.served.name}\` that serves this handler`;
  return { value: `\`$value: ${facts.value.type}\` — ${facts.value.what}, read from ${from}.`, span: span(start, end) };
}
