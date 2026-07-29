/**
 * Test-only helpers: parse a `.fud` the way the compiler pipeline does, and drive Oxc over
 * a JS span. Lives in `test/`, so it stays out of the coverage denominator.
 */

import {
  JsBatch,
  parseCodeBlock,
  parseControl,
  parseDirective,
  parseDocument,
  structureDocument,
  type AtConstructParser,
  type CodeBlockNode,
  type OxcNode,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';
import { partitionCode } from '../src/code.js';
import { emitClientVirtual } from '../src/emit-client.js';
import { findPropsCall, type PropsCall } from '../src/props.js';
import type { FileRegistry, VirtualFile } from '../src/types.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

/** Full parse of a `.fud` source into its structured document. */
export function parseFud(source: string): StructuredDocument {
  const html = parseDocument(source, { atConstructs: constructs }).value;
  return structureDocument(source, html).value;
}

/** The `@code` of a parsed document, whatever its role. */
export function codeOf(doc: StructuredDocument): CodeBlockNode | undefined {
  return doc.code;
}

/** A `FileRegistry` backed by a plain map, for tests. */
export function registryOf(
  components: Readonly<Record<string, string>>,
  layout?: string,
): FileRegistry {
  return {
    component: (tag) => components[tag],
    layout: () => layout,
  };
}

/** Parse a `.fud` and emit its client virtual, wiring Oxc the way `emit.ts` will. */
export function emitClient(
  source: string,
  fudPath = 'x.fud',
  registry: FileRegistry = registryOf({}),
): VirtualFile {
  const doc = parseFud(source);
  const first = partitionCode(doc.code).neutral[0];
  let props: PropsCall | undefined;
  if (first !== undefined) {
    const { statements, mapSpan } = statementsOf(source, first);
    props = findPropsCall(statements, mapSpan);
  }
  return emitClientVirtual(source, fudPath, doc, registry, props);
}

/** Parse one JS span as top-level statements, with its offset mapper. */
export function statementsOf(
  source: string,
  js: Span,
): { statements: readonly OxcNode[]; mapSpan: (s: number, e: number) => Span } {
  const batch = new JsBatch(source);
  const id = batch.add('module-statements', js);
  const result = batch.parse().value;
  const ast = result.ast(id);
  return {
    statements: Array.isArray(ast) ? ast : [ast as OxcNode],
    mapSpan: (s, e) => result.mapSpan(s, e),
  };
}
