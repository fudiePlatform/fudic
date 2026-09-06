/**
 * `prop-channel` — a prop that asked for a CHANNEL has to be fed something that can be one
 * (BUG-24 §4.9, decision 105).
 *
 *  - **`FUD0200`** a `Signal<T>` prop fed something that is not the bare name of a reactive.
 *  - **`FUD0201`** a callback prop fed something that is not the bare name of a function.
 *  - **`FUD0202`** a cell crossing to a component that does NOT hydrate, and so could never
 *    receive one. It is the one that pays for the rest: passing a signal to a level-1 child
 *    is a mistake that would otherwise surface as a `TypeError` in a browser, and with the
 *    graph resolved it is decidable while the page compiles.
 *  - **`FUD0203`** a `computed` crossing to a prop the child WRITES. A derived value has no
 *    value of its own (SDD-31 §4.3), so the write would have nowhere to land.
 *
 * Like the two contract rules of BUG-23 §4.4, all four are silent where the child cannot be
 * READ: with no `propsOf` there is no channel to check anything against, and a build does not
 * invent what it cannot demonstrate.
 *
 * **It is not in `ANALYZERS`, and that is the same split BUG-23 settled.** The rule needs four
 * things only a caller holding the resolved graph can answer — what the child declares, whether
 * it hydrates, whether it writes the prop, and what each name of THIS component can cross as —
 * and the editor has none of them. Over there TypeScript already rejects the same values across
 * the projection, with the real type and more to say; a second voice would only repeat it worse.
 * So the build owns these four, as it owns `FUD0197`–`FUD0199`: one voice per fact.
 */

import { classifyAttribute } from '../../binding/index.js';
import { errorDiag, span, type Span } from '../../types/index.js';
import type { Attribute, AttributeValuePart, ElementNode } from '../../html/index.js';
import type { ChannelInput, CrossingKind, Report } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_NOT_A_SIGNAL = 'FUD0200';
const FUD_NOT_A_FUNCTION = 'FUD0201';
const FUD_CELL_TO_INERT = 'FUD0202';
const FUD_COMPUTED_WRITTEN = 'FUD0203';

/** The `.` that makes an attribute a property binding (decision 23). */
const PROPERTY_PREFIX = '.';

/** One identifier and nothing else — the only shape a reference can cross as. */
const BARE_NAME = /^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u;

/** The bare name a value crosses as, or `undefined` when it is not one. */
function bareName(source: string, value: readonly AttributeValuePart[]): string | undefined {
  const only = value.length === 1 ? value[0] : undefined;
  if (only?.type !== 'razor-expression') return undefined;
  const text = source.slice(only.expr.start, only.expr.end);
  return BARE_NAME.test(text) ? text : undefined;
}

/** The span of the whole value, for a report that points at what was written. */
function valueSpan(attr: Attribute, value: readonly AttributeValuePart[]): Span {
  const only = value[0];
  return only === undefined ? attr.span : span(only.span.start, value[value.length - 1]!.span.end);
}

/** The attribute NAME, which is where a report about the PROP rather than its value goes. */
function nameSpan(attr: Attribute, name: string): Span {
  return span(attr.span.start, Math.min(attr.span.start + name.length + 1, attr.span.end));
}

/** What a value crossing a signal channel may be: a reactive of this component. */
const REACTIVE: ReadonlySet<CrossingKind> = new Set<CrossingKind>(['signal', 'computed']);

export function checkPropChannel(input: ChannelInput, report: Report): void {
  const { components, names, source } = input;
  const propsOf = components.propsOf?.bind(components);
  if (propsOf === undefined) return;
  const hydratable = components.hydratable?.bind(components);
  const writes = components.writes?.bind(components);

  const ownHost = input.document.type === 'component-document' ? input.document.host : undefined;

  walk(documentRoots(input.document), {
    element(el: ElementNode) {
      if (el === ownHost) return;
      const declared = propsOf(el.name);
      if (declared === undefined) return;

      for (const attr of el.attributes) {
        const binding = classifyAttribute(attr, source).value;
        if (binding.type !== 'property') continue;
        const channel = declared.find((d) => d.name === binding.name)?.channel;
        if (channel === undefined) continue;

        const at = valueSpan(attr, binding.value);
        const name = bareName(source, binding.value);
        const kind = name === undefined ? undefined : names.get(name);

        if (channel === 'fn') {
          if (kind !== 'fn') {
            report(
              errorDiag(
                FUD_NOT_A_FUNCTION,
                `\`.${binding.name}\` takes a function by reference: name one of @code { @client }`,
                at,
              ),
            );
            continue;
          }
        } else if (kind === undefined || !REACTIVE.has(kind)) {
          report(
            errorDiag(
              FUD_NOT_A_SIGNAL,
              `\`.${binding.name}\` takes a Signal by reference: name a signal(…) or computed(…)`,
              at,
            ),
          );
          continue;
        }

        // The value is a real cell, and the child could never receive one: it has no chunk, so
        // nothing of it ever comes alive to hold it. Asked LAST, and only of a well-formed
        // crossing, so a page — which owns no reactive at all — hears about the value it wrote
        // and not about a level it was never going to reach. Over the NAME, because what is
        // wrong here is the pairing rather than what the parent named.
        if (hydratable?.(el.name) === false) {
          report(
            errorDiag(
              FUD_CELL_TO_INERT,
              `\`${el.name}\` does not hydrate, so it can never receive \`.${binding.name}\` by reference`,
              nameSpan(attr, PROPERTY_PREFIX + binding.name),
            ),
          );
          continue;
        }
        // A derived value has no value of its own to write, and the child is the one who
        // would try. Only when the child really writes it: a `computed` a child only READS
        // crosses perfectly well.
        if (kind === 'computed' && writes?.(el.name, binding.name) === true) {
          report(
            errorDiag(
              FUD_COMPUTED_WRITTEN,
              `\`${name}\` is a computed and \`${el.name}\` writes \`.${binding.name}\`: a derived value is not writable`,
              at,
            ),
          );
        }
      }
    },
  });
}

