/**
 * The `ComponentRegistry` a BUILD can answer with (BUG-23 §4.4).
 *
 * The semantic pass asks three questions about a child tag — is it a component, what props
 * does it declare, what slots does it declare — and only a caller that resolved the graph can
 * answer the last two: they are facts about ANOTHER file. The language server leaves them
 * out on purpose, because over there TypeScript already checks the same two things through
 * the projection; here there is no TypeScript, so the graph answers.
 *
 * Props come from `codeOf`, which is memoized on the `ResolvedComponent`: asking a second
 * time costs nothing and, above all, opens no second Oxc invocation for that file.
 */

import { warningDiag, type Diagnostic } from '../types/index.js';
import type { ComponentDeclaredProps } from '../binding/index.js';
import type { ComponentRegistry, CrossingKind } from '../semantic/model.js';
import { checkComponentProps } from '../semantic/analyzers/component-props.js';
import { checkPropChannel } from '../semantic/analyzers/prop-channel.js';
import { checkSlotName } from '../semantic/analyzers/slot-name.js';
import { checkScriptBody } from '../semantic/analyzers/script-body.js';
import { documentRoots, walk } from '../semantic/walk.js';
import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import { componentOf } from './resolve.js';
import { codeOf } from './oxc-code.js';
import { hydratableTags } from './level.js';

/** A declaration nobody uses (BUG-32 T6). The only `warning` of this module. */
const FUD_UNUSED_COMPONENT_LINK = 'FUD0721';

/** The `<slot name="…">` names a component declares, in source order. */
function slotNames(comp: ResolvedComponent): readonly string[] {
  const names: string[] = [];
  walk(documentRoots(comp.doc), {
    element(el) {
      if (el.name !== 'slot') return;
      for (const attr of el.attributes) {
        if (attr.name !== 'name') continue;
        // One literal part and nothing else: `name=""` is the default slot (decision 44) and
        // an interpolated name is not a name this pass can check anything against.
        const only = attr.value.length === 1 ? attr.value[0] : undefined;
        if (only?.type === 'attribute-text' && only.value !== '') names.push(only.value);
      }
    },
  });
  return names;
}

/**
 * What the child declares of each prop, read off its `props<T>()`.
 *
 * `required` is the `?` of `T` and NOT whether the destructuring gives a default: the editor
 * checks the very same thing through `$Missing<$Props, …>`, and the two have to say the same
 * (BUG-23 §5). `channel` is read off the same `T`, and it is what decides the FORM of the
 * crossing (props-spec decision 86) — so both facts a parent needs about a child come out of
 * one read.
 *
 * Exported because the crossing rule has more readers than the semantic pass: the cell layout
 * asks the very same question about the very same child (`state.ts`).
 */
export function declaredProps(comp: ResolvedComponent): readonly ComponentDeclaredProps[] {
  return codeOf(comp).props.map((prop) => ({
    name: prop.name,
    required: !prop.optional,
    ...(prop.channel === undefined ? {} : { channel: prop.channel }),
  }));
}

/** The registry of a resolved graph: the entry included, which is what `componentOf` adds. */
export function graphRegistry(graph: ComponentGraph): ComponentRegistry {
  return {
    has: (tag) => componentOf(graph, tag) !== undefined,
    propsOf: (tag) => {
      const comp = componentOf(graph, tag);
      return comp === undefined ? undefined : declaredProps(comp);
    },
    slotsOf: (tag) => {
      const comp = componentOf(graph, tag);
      return comp === undefined ? undefined : slotNames(comp);
    },
    // Both are facts about the GRAPH and not about a file, which is exactly why they cannot
    // be answered anywhere else: whether a tag hydrates depends on what its ancestors hand it
    // (`level.ts`), and whether it writes a prop is read off its own `@client`.
    hydratable: (tag) =>
      componentOf(graph, tag) === undefined ? undefined : hydratableTags(graph).has(tag),
    writes: (tag, prop) => {
      const comp = componentOf(graph, tag);
      return comp === undefined ? undefined : codeOf(comp).setCalls.has(prop);
    },
  };
}

/**
 * What each name of a component can cross AS (BUG-24 §4.9) — its own reactives, the functions
 * of its `@client`, and the props it itself received as cells.
 *
 * That last group is not a nicety: a component that FORWARDS a callback is feeding a channel
 * with something that is not a function of its own, and reading that as `FUD0201` would reject
 * the one thing props-spec decision 86 exists to allow.
 */
function crossingNames(comp: ResolvedComponent): ReadonlyMap<string, CrossingKind> {
  const code = codeOf(comp);
  const out = new Map<string, CrossingKind>();
  for (const reactive of code.signals) out.set(reactive.name, reactive.kind);
  for (const fn of code.clientFunctions) out.set(fn, 'fn');
  for (const prop of code.props) {
    if (prop.channel === 'signal') out.set(prop.name, 'signal');
    else if (prop.channel === 'fn') out.set(prop.name, 'fn');
  }
  return out;
}

/**
 * `FUD0197`/`FUD0198`/`FUD0199` for one entry document, against its resolved graph.
 *
 * The rules themselves are the semantic pass's — the very functions its two analyzers are —
 * and this only supplies the registry no editor can build. Nothing here parses JavaScript,
 * so it costs no Oxc invocation: these are questions about markup and about a contract the
 * graph already read.
 */
export function contractDiagnostics(graph: ComponentGraph): readonly Diagnostic[] {
  const components = graphRegistry(graph);
  const input = { document: graph.entry, components };
  const out: Diagnostic[] = [];
  const report = (diagnostic: Diagnostic): void => {
    out.push(diagnostic);
  };
  checkComponentProps(input, report);
  checkSlotName(input, report);
  // A `<script>` body (decision 129). Unlike the other three this needs no registry at all,
  // and it is here for the opposite reason: it is the build's only door to a rule the editor
  // already serves. Reported by one side alone it would be a rule half the users never see.
  checkScriptBody(input, report);
  // The FORM of every crossing this file writes (BUG-24 §4.9). It joins the two above because
  // it is the same kind of fact: what one file may write depends on what ANOTHER declares, and
  // only a caller that resolved the graph can put the two side by side.
  //
  // A page or a route has no names of its own to cross — the reactive primitives are of the
  // client (SDD-31 §8) — so an empty map is the honest reading, and a page naming something
  // against a `Signal<T>` prop is exactly the `FUD0200` it should be.
  const entry = graph.entry;
  const own = entry.type === 'component-document' ? componentOf(graph, entry.name) : undefined;
  checkPropChannel(
    {
      source: graph.entrySource,
      document: entry,
      components,
      names: own === undefined ? new Map() : crossingNames(own),
    },
    report,
  );
  // The declaration nobody uses (BUG-32 T6). Here and not in an analyzer of its own for the
  // same reason as the two above: a `<link>` carries a PATH and a component carries its tag,
  // so only a caller that resolved the graph can put the two side by side.
  checkUnusedComponentLinks(graph, report);
  return out;
}

/**
 * `FUD0721` — a `<link rel="component">` whose tag appears nowhere in this document.
 *
 * A WARNING and not an error, and that is decided rather than inherited: an unused import is
 * a warning in every language that has one, and here it is also the state a file passes
 * through while its template is being rewritten. Breaking the build over it would punish the
 * middle of an edit.
 *
 * The usages come from `documentRoots`, which already gives each document shape the right
 * roots: a component's are its host and everything under its `<template>`, a route's are its
 * markup AND its `@section` blocks, a page's and a layout's are the whole `<html>`. Counting
 * the markup alone would report a false positive the moment a route used the tag in a section
 * (T7).
 *
 * A link that does not resolve to a component is not in `entryLinkTags` and is not judged
 * here: `FUD0191` and the resolver already speak for those, and a second complaint about a
 * file this pass could not read would be inventing an error over an absence.
 */
function checkUnusedComponentLinks(
  graph: ComponentGraph,
  report: (diagnostic: Diagnostic) => void,
): void {
  if (graph.entryLinkTags.size === 0) return;
  const host = graph.entry.type === 'component-document' ? graph.entry.host : undefined;
  const used = new Set<string>();
  walk(documentRoots(graph.entry), {
    element(el) {
      // The component's own host DECLARES its identity, it does not use one (decision 75) —
      // the same exclusion `component-declared` makes, and for the same reason.
      if (el === host || el.namespace !== 'html' || !el.name.includes('-')) return;
      used.add(el.name);
    },
  });
  for (const [link, tag] of graph.entryLinkTags) {
    if (used.has(tag)) continue;
    report(
      warningDiag(
        FUD_UNUSED_COMPONENT_LINK,
        `\`<${tag}>\` is declared here and used nowhere in this file: the \`<link rel="component">\` can go`,
        link.openSpan,
      ),
    );
  }
}
