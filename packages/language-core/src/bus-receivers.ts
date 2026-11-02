/**
 * The bus receivers of one `.fud`, registered for the whole project (decision 173).
 *
 * The type of what `emit("alta", x)` may send is the contract its RECEIVERS declare: each
 * `bus:alta=@alta` whose `alta` the `@code` declares at its top level adds the type of its
 * first parameter, and `BusDetail` in `@fudic/dom` intersects them. The registry is a global
 * interface, so every `.fud` of the program adds to the same one:
 *
 * ```ts
 * declare global {
 *   interface FudicBusReceivers {
 *     'src/routes/usuarios.fud#0': readonly ['alta', $BusParam<typeof alta>];
 *   }
 * }
 * export {};
 * ```
 *
 * Only a reference to a top-level name registers: `typeof` is written at the end of the module,
 * where a loop variable, a snippet parameter or an import renamed in a block does not exist. A
 * lambda, a call and a `bus:(expr)` register nothing.
 */

import {
  classifyAttribute,
  documentRoots,
  handlerShape,
  loopHeaderNames,
  unwrapParens,
  walk,
  type ForNode,
  type ForeachNode,
  type Node,
  type OxcNode,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';
import type { FragmentAst } from './template/context.js';
import type { VirtualWriter } from './writer.js';

/** One typed receiver: the bus name and the top-level function it subscribes. */
export interface BusReceiver {
  readonly name: string;
  readonly handler: string;
}

/** The typed receivers of a document, in source order. */
export function busReceivers(
  source: string,
  doc: StructuredDocument,
  topLevel: ReadonlySet<string>,
  ast: (at: Span) => FragmentAst | undefined,
): readonly BusReceiver[] {
  const out: BusReceiver[] = [];
  // What each open body declares over the top level. A snippet's parameters are not known
  // here, so its body hides every name: nothing inside it registers.
  const hidden: (ReadonlySet<string> | 'all')[] = [];
  const isHidden = (name: string): boolean =>
    hidden.some((names) => names === 'all' || names.has(name));

  walk(documentRoots(doc), {
    enterBlock(owner: Node) {
      if (owner.type === 'snippet') hidden.push('all');
      else if (owner.type === 'foreach' || owner.type === 'for') {
        const loop = owner as ForeachNode | ForNode;
        hidden.push(new Set(loopHeaderNames(rootOf(ast(loop.header.inner)), loop.type)));
      } else hidden.push(new Set());
    },
    exitBlock() {
      hidden.pop();
    },
    element(el) {
      for (const attr of el.attributes) {
        const binding = classifyAttribute(attr, source).value;
        if (binding.type !== 'bus' || typeof binding.eventName !== 'string') continue;
        const root = rootOf(ast(binding.value.expr));
        if (handlerShape(root) !== 'reference' || root?.type !== 'Identifier') continue;
        const handler = String(root['name']);
        if (topLevel.has(handler) && !isHidden(handler)) out.push({ name: binding.eventName, handler });
      }
    },
  });
  return out;
}

/** The registry block at the end of the module, or nothing for a file with no typed receiver. */
export function emitBusReceivers(
  w: VirtualWriter,
  fudPath: string,
  receivers: readonly BusReceiver[],
): void {
  if (receivers.length === 0) return;
  const file = fudPath.replaceAll('\\', '/');
  w.scaffold('declare global {\n  interface FudicBusReceivers {\n');
  receivers.forEach((receiver, i) => {
    const key = JSON.stringify(`${file}#${String(i)}`);
    w.scaffold(`    ${key}: readonly [${JSON.stringify(receiver.name)}, $BusParam<typeof ${receiver.handler}>];\n`);
  });
  // `declare global` is only valid in a module, and a `@code` with no import is not one.
  w.scaffold('  }\n}\nexport {};\n');
}

function rootOf(ast: FragmentAst | undefined): OxcNode | undefined {
  return ast === undefined || Array.isArray(ast) ? undefined : unwrapParens(ast as OxcNode);
}
