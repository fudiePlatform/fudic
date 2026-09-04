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

import type { Diagnostic } from '../types/index.js';
import type { ComponentDeclaredProps } from '../binding/index.js';
import type { ComponentRegistry } from '../semantic/model.js';
import { checkComponentProps } from '../semantic/analyzers/component-props.js';
import { checkSlotName } from '../semantic/analyzers/slot-name.js';
import { documentRoots, walk } from '../semantic/walk.js';
import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import { componentOf } from './resolve.js';
import { codeOf } from './oxc-code.js';

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
 * crossing (decision 105) — so both facts a parent needs about a child come out of one read.
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
  };
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
  const input = { document: graph.entry, components: graphRegistry(graph) };
  const out: Diagnostic[] = [];
  const report = (diagnostic: Diagnostic): void => {
    out.push(diagnostic);
  };
  checkComponentProps(input, report);
  checkSlotName(input, report);
  return out;
}
