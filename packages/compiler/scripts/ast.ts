/**
 * AST inspector: `npx tsx scripts/ast.ts <file.fud>`.
 *
 * Runs the real parse pipeline (SDD-05 parseDocument + SDD-06/08 constructs + SDD-10
 * structureDocument) over a `.fud` and pretty-prints what the emit transformer will
 * consume: diagnostics, the structured document, and the markup tree with spans, a
 * source snippet per node, classified attributes, and the `@code` fragment layout.
 *
 * No emit, no risk — just a window onto the AST.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocument, type AtConstructParser } from '../src/html/index.js';
import { parseControl } from '../src/control/index.js';
import { parseCodeBlock, type CodeBlockNode } from '../src/code/index.js';
import { structureDocument } from '../src/document/index.js';
import { classifyAttribute } from '../src/binding/index.js';
import type { Span } from '../src/types/index.js';
import type {
  Attribute,
  ElementNode,
  HtmlContent,
} from '../src/html/index.js';
import type {
  IfNode,
  ForeachNode,
  ForNode,
  WhileNode,
  SwitchNode,
} from '../src/control/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

const arg = process.argv[2];
if (arg === undefined) {
  console.error('usage: npx tsx scripts/ast.ts <file.fud>');
  process.exit(1);
}
const path = resolve(process.cwd(), arg);
const source = readFileSync(path, 'utf8');

const parsed = parseDocument(source, { atConstructs: constructs });
const structured = structureDocument(source, parsed.value);

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';

/** Collapse whitespace and truncate the source a span covers. */
function snip(span: Span, max = 60): string {
  const text = source.slice(span.start, span.end).replace(/\s+/gu, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function loc(span: Span): string {
  return `${DIM}[${span.start},${span.end})${RESET}`;
}

function line(depth: number, ...parts: string[]): void {
  console.log('  '.repeat(depth) + parts.join(' '));
}

// ── Header ────────────────────────────────────────────────────────────────
console.log(`\n${MAGENTA}=== ${arg} ===${RESET}`);
console.log(`${DIM}${source.length} chars · mode=${parsed.value.mode}${RESET}\n`);

const diagnostics = [...parsed.diagnostics, ...structured.diagnostics];
if (diagnostics.length === 0) {
  console.log(`${GREEN}diagnostics: none${RESET}\n`);
} else {
  console.log(`${YELLOW}diagnostics (${diagnostics.length}):${RESET}`);
  for (const d of diagnostics) {
    console.log(`  ${d.severity} ${d.code} ${loc(d.span)} ${d.message} → ${JSON.stringify(snip(d.span, 30))}`);
  }
  console.log();
}

// ── Structured document ─────────────────────────────────────────────────────
const doc = structured.value;
console.log(`${CYAN}${doc.type}${RESET}`);
if (doc.type === 'component-document') {
  line(1, `name: ${JSON.stringify(doc.name)}`);
  line(1, `links: ${doc.links.length}`);
  if (doc.code) line(1, `code: yes`);
  if (doc.head) line(1, `head: yes`);
  if (doc.host) line(1, `host: <${doc.host.name}>`);
  if (doc.template) line(1, `template: shadowrootmode`);
} else {
  line(1, `links: ${doc.links.length}`, doc.code ? '· code: yes' : '');
}
if (doc.code) {
  console.log(`\n${CYAN}@code fragments${RESET} ${DIM}(what goes to Oxc / where props<T>() lives)${RESET}`);
  dumpCode(doc.code, 1);
}

// ── Markup tree ─────────────────────────────────────────────────────────────
console.log(`\n${CYAN}markup tree${RESET}`);
const roots: readonly HtmlContent[] =
  doc.type === 'page-document' ? [doc.html] : rootsOfComponent(doc);
for (const node of roots) dumpNode(node, 1);
console.log();

// ── Dumpers ─────────────────────────────────────────────────────────────────
function rootsOfComponent(d: Extract<typeof doc, { type: 'component-document' }>): HtmlContent[] {
  const out: HtmlContent[] = [...d.links];
  if (d.head) out.push(d.head);
  if (d.host) out.push(d.host);
  return out;
}

function dumpCode(code: CodeBlockNode, depth: number): void {
  for (const part of code.parts) {
    const kind =
      part.type === 'neutral-js' ? `${YELLOW}neutral${RESET}` :
      part.type === 'server-region' ? `${GREEN}@server${RESET}` :
      `${MAGENTA}@client${RESET}`;
    line(depth, `${kind} ${loc(part.js)} ${DIM}${JSON.stringify(snip(part.js, 70))}${RESET}`);
  }
}

function dumpNode(node: HtmlContent, depth: number): void {
  switch (node.type) {
    case 'element':
      dumpElement(node, depth);
      return;
    case 'text': {
      const text = snip(node.span, 40);
      if (text.length > 0) line(depth, `${DIM}text${RESET} "${text}"`);
      return;
    }
    case 'razor-expression':
      line(depth, `${GREEN}@expr${RESET} ${loc(node.span)} ${node.kind} → ${JSON.stringify(snip(node.expr, 40))}`);
      return;
    case 'raw-expression':
      line(depth, `${GREEN}@raw${RESET} ${loc(node.span)} → ${JSON.stringify(snip(node.expr.expr, 40))}`);
      return;
    case 'if':
      dumpIf(node as unknown as IfNode, depth);
      return;
    case 'foreach':
    case 'for':
    case 'while': {
      const loop = node as unknown as ForeachNode | ForNode | WhileNode;
      line(depth, `${MAGENTA}@${node.type}${RESET} ${loc(node.span)} (${JSON.stringify(snip(loop.header.inner, 40))})`);
      for (const child of loop.body) dumpNode(child, depth + 1);
      return;
    }
    case 'switch': {
      const sw = node as unknown as SwitchNode;
      line(depth, `${MAGENTA}@switch${RESET} ${loc(node.span)} (${JSON.stringify(snip(sw.header.inner, 30))})`);
      for (const c of sw.cases) {
        line(depth + 1, `${DIM}case${RESET} ${c.test ? JSON.stringify(snip(c.test, 20)) : 'default'}`);
        for (const child of c.body) dumpNode(child, depth + 2);
      }
      return;
    }
    case 'code':
      line(depth, `${DIM}@code (see fragments above)${RESET}`);
      return;
    default:
      line(depth, `${DIM}${node.type}${RESET} ${loc(node.span)} ${JSON.stringify(snip(node.span, 30))}`);
      return;
  }
}

function dumpIf(node: IfNode, depth: number): void {
  node.branches.forEach((branch, i) => {
    const kw = i === 0 ? '@if' : 'else if';
    line(depth, `${MAGENTA}${kw}${RESET} ${loc(branch.span)} (${JSON.stringify(snip(branch.header.inner, 40))})`);
    for (const child of branch.body) dumpNode(child, depth + 1);
  });
  if (node.elseBody) {
    line(depth, `${MAGENTA}else${RESET}`);
    for (const child of node.elseBody) dumpNode(child, depth + 1);
  }
}

function dumpElement(el: ElementNode, depth: number): void {
  const ns = el.namespace === 'html' ? '' : `${DIM}:${el.namespace}${RESET}`;
  line(depth, `${CYAN}<${el.name}>${RESET}${ns} ${DIM}${el.kind}${RESET} ${loc(el.span)}`);
  for (const attr of el.attributes) dumpAttr(attr, depth + 1);
  for (const child of el.children) dumpNode(child, depth + 1);
}

function dumpAttr(attr: Attribute, depth: number): void {
  const binding = classifyAttribute(attr, source).value;
  const name = typeof attr.name === 'string' ? attr.name : `(expr)${snip(attr.name.span, 20)}`;
  const value = attr.value.length > 0 ? ` = ${JSON.stringify(snip(attr.span, 40))}` : '';
  line(depth, `${YELLOW}·${RESET} ${binding.type} ${DIM}${name}${RESET}${value}`);
}
