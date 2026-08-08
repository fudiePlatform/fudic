/**
 * One walk that finds every delegated fragment, and one concurrent pass that formats them
 * all (SDD-26 §4.1).
 *
 * This is the module that lets the printer be synchronous. The leaves are the only
 * asynchronous thing in the formatter and they do not depend on one another: gathering them
 * first turns N sequential awaits into one, and leaves the printer a plain table to consult.
 *
 * A fragment this walk misses is not a bug that corrupts anything — the printer falls back
 * to the source slice and prints it as the user wrote it. That asymmetry is deliberate: the
 * failure mode of the collector is "less formatted", never "wrong".
 */

import type {
  Attribute,
  CodeBlockNode,
  Diagnostic,
  ElementNode,
  ForeachNode,
  HtmlContent,
  IfNode,
  SectionNode,
  StyleNode,
  SwitchNode,
  WhileNode,
} from '@fudic/compiler';
import { fragmentNotFormatted } from '../diagnostics.js';
import { OPAQUE_ELEMENTS } from '../tags.js';
import type { ResolvedOptions } from '../types.js';
import type { LeafEngine } from './engine.js';
import { formatJsFragment, type JsFragmentKind } from './js.js';
import { formatStyleBody } from './css.js';

// A control construct is stored as the base `RazorConstruct`; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asLoop = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;
const asWhile = (node: HtmlContent): WhileNode => node as unknown as WhileNode;
const asSwitch = (node: HtmlContent): SwitchNode => node as unknown as SwitchNode;
const asCode = (node: HtmlContent): CodeBlockNode => node as unknown as CodeBlockNode;
const asSection = (node: HtmlContent): SectionNode => node as unknown as SectionNode;

/** A fragment to hand over, located by span so the printer can ask for it by node. */
interface Job {
  readonly language: 'ts' | 'css';
  readonly kind: JsFragmentKind;
  /** Present only for a `<style>`: the parts are what the placeholders are built from. */
  readonly style?: StyleNode;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
  /** True for a fragment that lives inside an attribute value. See `LeafRequest`. */
  readonly inAttribute: boolean;
}

/** What the printer consults: formatted text by span, plus what was left alone. */
export class LeafTable {
  readonly #byKey = new Map<string, string>();
  readonly #notes: Diagnostic[] = [];

  /** Every note the leaves produced, in source order — never in the order they resolved. */
  get notes(): readonly Diagnostic[] {
    return this.#notes;
  }

  set(start: number, end: number, text: string): void {
    this.#byKey.set(`${start},${end}`, text);
  }

  /** The formatted text for this span, or `undefined` when nobody formatted it. */
  get(span: { readonly start: number; readonly end: number }): string | undefined {
    return this.#byKey.get(`${span.start},${span.end}`);
  }

  addNote(note: Diagnostic): void {
    this.#notes.push(note);
  }
}

function js(
  kind: JsFragmentKind,
  span: { start: number; end: number },
  depth: number,
  inAttribute = false,
): Job {
  return { language: 'ts', kind, start: span.start, end: span.end, depth, inAttribute };
}

function collectAttribute(attribute: Attribute, depth: number, jobs: Job[]): void {
  // `bus:(expr)="…"` (decision 28.b) is the only attribute whose NAME is an expression.
  if (typeof attribute.name !== 'string') {
    jobs.push(js('expression', attribute.name.expr, depth, true));
  }
  for (const part of attribute.value) {
    if (part.type === 'razor-expression') jobs.push(js('expression', part.expr, depth, true));
  }
}

function collectElement(element: ElementNode, depth: number, jobs: Job[]): void {
  for (const attribute of element.attributes) collectAttribute(attribute, depth, jobs);
  // An opaque element is copied byte for byte (§4.4): nothing inside it is anybody's to touch.
  if (OPAQUE_ELEMENTS.has(element.name)) return;
  collectContent(element.children, depth + 1, jobs);
}

/** The `key (…)` of a loop (decision 91): one more expression to hand over. */
function collectKey(loop: ForeachNode | WhileNode, depth: number, jobs: Job[]): void {
  if (loop.key !== undefined) jobs.push(js('expression', loop.key.expr, depth));
}

function collectIf(node: IfNode, depth: number, jobs: Job[]): void {
  for (const branch of node.branches) {
    jobs.push(js('condition', branch.header.inner, depth));
    collectContent(branch.body, depth + 1, jobs);
  }
  if (node.elseBody !== undefined) collectContent(node.elseBody, depth + 1, jobs);
}

function collectSwitch(node: SwitchNode, depth: number, jobs: Job[]): void {
  jobs.push(js('discriminant', node.header.inner, depth));
  for (const branch of node.cases) {
    // A `case` label sits one level inside the `@switch`; its body one level further.
    if (branch.test !== undefined) jobs.push(js('expression', branch.test, depth + 1));
    collectContent(branch.body, depth + 2, jobs);
  }
}

function collectCode(node: CodeBlockNode, depth: number, jobs: Job[]): void {
  for (const part of node.parts) {
    // A neutral chunk sits one level in; a region's body two, inside its own braces.
    const inner = part.type === 'neutral-js' ? depth + 1 : depth + 2;
    jobs.push(js('statements', part.js, inner));
  }
}

function collectContent(nodes: readonly HtmlContent[], depth: number, jobs: Job[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'element':
        collectElement(node, depth, jobs);
        break;
      case 'style-content':
        jobs.push({
          language: 'css',
          kind: 'statements',
          style: node,
          start: node.span.start,
          end: node.span.end,
          depth,
          inAttribute: false,
        });
        break;
      case 'razor-expression':
        jobs.push(js('expression', node.expr, depth));
        break;
      case 'raw-expression':
        jobs.push(js('expression', node.expr.expr, depth));
        break;
      case 'inline-code':
        jobs.push(js('statements', node.group.inner, depth + 1));
        break;
      case 'if':
        collectIf(asIf(node), depth, jobs);
        break;
      case 'foreach':
      case 'for': {
        const loop = asLoop(node);
        jobs.push(js('iteration', loop.header.inner, depth));
        collectKey(loop, depth, jobs);
        collectContent(loop.body, depth + 1, jobs);
        break;
      }
      case 'while': {
        const loop = asWhile(node);
        jobs.push(js('condition', loop.header.inner, depth));
        collectKey(loop, depth, jobs);
        collectContent(loop.body, depth + 1, jobs);
        break;
      }
      case 'switch':
        collectSwitch(asSwitch(node), depth, jobs);
        break;
      case 'code':
        collectCode(asCode(node), depth, jobs);
        break;
      case 'section':
        collectContent(asSection(node).children, depth + 1, jobs);
        break;
      default:
        // Text, comments, doctype, cdata, raw text, `@@`, the `Render*` markers and the
        // degraded node: none of them holds another language.
        break;
    }
  }
}

/**
 * Walk the tree, format every leaf at once, and return the table the printer reads.
 *
 * The width each fragment is formatted against is the width that will be LEFT for it —
 * `printWidth` minus the columns its indentation eats — which is why the depth is carried
 * through the walk instead of recovered afterwards.
 *
 * Results are written back **in job order**, not in resolution order. Two runs of the same
 * file must produce the same notes in the same sequence, and `Promise.all` guarantees the
 * values, never the timing.
 */
export async function collectLeaves(
  engine: LeafEngine,
  source: string,
  roots: readonly HtmlContent[],
  options: ResolvedOptions,
): Promise<LeafTable> {
  const jobs: Job[] = [];
  collectContent(roots, 0, jobs);

  const results = await Promise.all(
    jobs.map(async (job) => {
      const indentColumns = job.depth * options.tabWidth;
      if (job.style !== undefined) {
        return formatStyleBody(
          engine,
          source,
          job.style,
          { start: job.start, end: job.end },
          indentColumns,
          options,
        );
      }
      const out = await formatJsFragment(
        engine,
        {
          kind: job.kind,
          source: source.slice(job.start, job.end),
          indentColumns,
          // The attribute delimiter decides which quote the JS inside it may not use, and
          // that it is delimited at all is why it may not break either.
          singleQuote: job.inAttribute && options.quote === 'double',
          singleLine: job.inAttribute,
        },
        options,
      );
      return out.ok
        ? { text: out.text }
        : { text: out.text, note: fragmentNotFormatted({ start: job.start, end: job.end }) };
    }),
  );

  const table = new LeafTable();
  for (const [index, result] of results.entries()) {
    const job = jobs[index]!;
    table.set(job.start, job.end, result.text);
    if (result.note !== undefined) table.addNote(result.note);
  }
  return table;
}
