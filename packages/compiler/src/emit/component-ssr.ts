/**
 * SSR emit (SDD-15, server branch): transform a component's AST into **one function
 * per component** that renders its SSR markup. NOT the `{c,h,r}` controller — that is
 * the browser/hydration artifact (SDD-17). This is the server side only.
 *
 * The emitted function is PURE and adapter-injected: `render($dom, $shadow, props)`
 * builds the shadow subtree by calling the `Dom<N>` contract (`element`, `text`,
 * `setAttr`, `append`). The compiler produces this as TEXT and depends on nothing at
 * runtime; a consumer (e.g. @fudic/ssr) injects `SsrDom` and serializes the tree with
 * `renderToString`. Dependency direction: the compiler emits, the runtime packages
 * consume — never the reverse.
 *
 * Styles follow SDD-18 and travel as a SEPARATE artifact: a
 * `<style type="module" specifier="<tag>">` for the page `<head>`. The template's
 * `shadowrootadoptedstylesheets` is added by the serializer from the host tag, so it
 * is not this emit's concern.
 *
 * SLICE 1 covers what `app-badge` exercises — elements, text, static attributes,
 * `class:` conditional classes, `<slot>`, and `props<T>()` defaults read via Oxc
 * (SDD-11). Content interpolation, control flow, event/property/bus bindings and
 * `@client` are OUT of this slice and reported as diagnostics, never faked.
 */

import type { ComponentDocument } from '../document/index.js';
import type { ElementNode, HtmlContent, AttributeText } from '../html/index.js';
import type { Span } from '../types/index.js';
import { classifyAttribute } from '../binding/index.js';
import { JsBatch, type OxcNode } from '../oxc/index.js';
import { CodeWriter } from './writer.js';

/** One destructured prop from `props<T>()`, with its default expression source if any. */
export interface Prop {
  readonly name: string;
  readonly def?: string;
}

export interface SsrEmitResult {
  /** The component tag; also the CSS module specifier (SDD-18 D-1). */
  readonly specifier: string;
  /** `<style type="module" specifier="<tag>">…</style>` for the page `<head>` ('' if no styles). */
  readonly styleModule: string;
  /** Source of `function render($dom, $shadow, props) { … }` — one function per component. */
  readonly render: string;
  /** Honest notes on constructs this slice does not yet emit. */
  readonly diagnostics: readonly string[];
}

export function emitComponentSsr(source: string, doc: ComponentDocument): SsrEmitResult {
  const diagnostics: string[] = [];
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);

  const props = extractProps(source, doc, diagnostics);
  const styleModule = emitStyleModule(source, doc);

  // Build statements in tree order: each node is fabricated, its attributes set, its
  // children built (which append themselves to it), and finally it is appended to its
  // parent. One linear body — no controller, no create/mount/subscribe split.
  const body: string[] = [];
  let nodeId = 0;
  const fresh = (): string => `$n${nodeId++}`;

  const emitAttrs = (el: ElementNode, v: string): void => {
    let baseClass: string | undefined;
    const classBindings: Array<{ className: string; expr: string }> = [];
    for (const attr of el.attributes) {
      const binding = classifyAttribute(attr, source).value;
      if (binding.type === 'class') {
        classBindings.push({ className: binding.className, expr: slice(binding.value.expr) });
      } else if (binding.type === 'attr') {
        const staticOnly = binding.value.every((part) => part.type === 'attribute-text');
        if (!staticOnly) {
          diagnostics.push(`attribute '${binding.name}' has interpolation — out of the SSR slice.`);
          continue;
        }
        const literal = binding.value.map((part) => (part as AttributeText).value).join('');
        if (binding.name === 'class') baseClass = literal;
        else body.push(`$dom.setAttr(${v}, '${binding.name}', ${JSON.stringify(literal)});`);
      } else {
        diagnostics.push(`binding '${binding.type}' — out of the SSR slice.`);
      }
    }
    if (baseClass !== undefined || classBindings.length > 0) {
      const parts: string[] = [];
      if (baseClass) parts.push(JSON.stringify(baseClass));
      for (const cb of classBindings) parts.push(`(${cb.expr}) && ${JSON.stringify(cb.className)}`);
      body.push(`$dom.setAttr(${v}, 'class', [${parts.join(', ')}].filter(Boolean).join(' '));`);
    }
  };

  const walk = (node: HtmlContent, parent: string): void => {
    switch (node.type) {
      case 'element': {
        const v = fresh();
        body.push(`const ${v} = $dom.element('${node.name}');`);
        emitAttrs(node, v);
        for (const child of node.children) walk(child, v);
        body.push(`$dom.append(${parent}, ${v});`);
        return;
      }
      case 'text': {
        const v = fresh();
        body.push(`const ${v} = $dom.text(${JSON.stringify(node.value)});`);
        body.push(`$dom.append(${parent}, ${v});`);
        return;
      }
      default:
        diagnostics.push(
          `<${node.type}> at [${node.span.start},${node.span.end}) is out of the SSR slice ` +
            '(interpolation / control flow / raw). Not emitted.',
        );
    }
  };

  if (doc.template) {
    for (const child of doc.template.children) walk(child, '$shadow');
  } else {
    diagnostics.push('component has no <template shadowrootmode> — nothing to render.');
  }

  const render = assembleRender(props, body);
  return { specifier: doc.name, styleModule, render, diagnostics };
}

/** Wrap the build statements into `function render($dom, $shadow, props) { … }`. */
function assembleRender(props: readonly Prop[], body: readonly string[]): string {
  const w = new CodeWriter();
  w.line('function render($dom, $shadow, props) {');
  w.indent();
  if (props.length > 0) {
    // The object pattern of props<T>() is re-emitted, types stripped, defaults kept.
    const pattern = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name)).join(', ');
    w.line(`const { ${pattern} } = props ?? {};`);
  }
  for (const stmt of body) w.line(stmt);
  w.dedent();
  w.line('}');
  return w.toString();
}

/** Read the `props<T>()` object pattern via Oxc and flatten it to ordered props. */
function extractProps(source: string, doc: ComponentDocument, diagnostics: string[]): Prop[] {
  if (!doc.code) return [];
  const batch = new JsBatch(source);
  const ids: number[] = [];
  for (const part of doc.code.parts) {
    if (part.type === 'neutral-js') ids.push(batch.add('module-statements', part.js));
  }
  if (ids.length === 0) return [];

  const result = batch.parse();
  const props: Prop[] = [];
  for (const id of ids) {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    for (const stmt of stmts) {
      const pattern = propsPattern(stmt);
      if (!pattern) continue;
      readObjectPattern(pattern, source, result.value.mapOffset, diagnostics, props);
    }
  }
  return props;
}

/** If `stmt` is `const { … } = props<T>()`, return its ObjectPattern; else undefined. */
function propsPattern(stmt: OxcNode): OxcNode | undefined {
  if (stmt.type !== 'VariableDeclaration') return undefined;
  const declarations = stmt['declarations'] as OxcNode[] | undefined;
  if (!declarations) return undefined;
  for (const d of declarations) {
    const init = d['init'] as OxcNode | undefined;
    const id = d['id'] as OxcNode | undefined;
    if (!init || !id || init.type !== 'CallExpression' || id.type !== 'ObjectPattern') continue;
    const callee = init['callee'] as OxcNode | undefined;
    if (callee && callee.type === 'Identifier' && callee['name'] === 'props') return id;
  }
  return undefined;
}

/** Flatten `{ a, b = expr }` into ordered props, taking each default's source verbatim. */
function readObjectPattern(
  pattern: OxcNode,
  source: string,
  mapOffset: (bufferOffset: number) => number,
  diagnostics: string[],
  out: Prop[],
): void {
  const properties = pattern['properties'] as OxcNode[] | undefined;
  if (!properties) return;
  for (const p of properties) {
    if (p.type !== 'Property') {
      diagnostics.push('props<T>() with rest/spread — out of the SSR slice.');
      continue;
    }
    const key = p['key'] as OxcNode | undefined;
    if (!key || key.type !== 'Identifier') continue;
    const name = String(key['name']);
    const value = p['value'] as OxcNode | undefined;
    if (value && value.type === 'AssignmentPattern') {
      const right = value['right'] as OxcNode | undefined;
      if (right) {
        out.push({ name, def: source.slice(mapOffset(right.start), mapOffset(right.end)) });
        continue;
      }
    }
    out.push({ name });
  }
}

/** Emit the shared sheet as a page-head CSS module named by the tag (SDD-18 D-1). */
function emitStyleModule(source: string, doc: ComponentDocument): string {
  if (!doc.head) return '';
  const styleEl = doc.head.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  );
  if (!styleEl) return '';
  const start = styleEl.openSpan.end;
  const end = styleEl.closeSpan ? styleEl.closeSpan.start : styleEl.span.end;
  const css = source.slice(start, end);
  return `<style type="module" specifier="${doc.name}">${css}</style>`;
}
