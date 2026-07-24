/**
 * Module emit (SDD-15 server branch): the compiler turns the AST + the resolved
 * dependency graph (SDD-10 links, see resolve.ts) into ES modules — ONE `.mjs` per
 * component and one `.mjs` for the page. Text only; the compiler imports no runtime.
 *
 * Component module: `export const tag`, `export const css`, and
 * `export function render($dom, $shadow, props)` that builds the shadow subtree via the
 * injected `Dom<N>` adapter. Composition is real ES imports between modules
 * (`app-card.mjs` imports `app-button.mjs`). Signals are emitted INERT in SSR — an
 * un-hydrated `signal` contributes only its initial value, so nothing from `@fudic/core`
 * is needed here. Events are not emitted (no-op on the server).
 *
 * Page module (`home.mjs`): imports the component modules, hoists every component's
 * `<head>` into the page `<head>` (each `<style>` as `<style type="module" specifier>`),
 * composes the body (`@if`/`@foreach`/interpolation/prop passing), and emits the inline,
 * blocking style-adoption `<script>` (SDD-18 §5) at the end of the body so the page shows
 * with styles applied. `page(data, io)` returns the whole HTML string; `io` injects the
 * SSR adapter, so the module itself depends on nothing.
 */

import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import type { HtmlContent, ElementNode, Attribute } from '../html/index.js';
import type { IfNode, ForeachNode } from '../control/index.js';
import type { Span } from '../types/index.js';
import type { PageDocument, ComponentDocument } from '../document/index.js';
import { classifyAttribute } from '../binding/index.js';
import { JsBatch, type OxcNode } from '../oxc/index.js';
import { CodeWriter } from './writer.js';

const renderName = (tag: string): string =>
  'render' + tag.split('-').map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : '')).join('');

/**
 * Inline style-adoption polyfill (SDD-18 §5), streaming-safe. A MutationObserver
 * registers the `<style type="module" specifier>` sheets and adopts each shared sheet
 * into every `[data-adopt]` host's shadow root as it appears; hosts streamed before
 * their sheet wait in `pending`, and a final DOMContentLoaded sweep forces the rest.
 * It reads the specifier from the host's `data-adopt` because the `<template>` (which
 * carries `shadowrootadoptedstylesheets`) is consumed by the parser and gone from the DOM.
 */
const STYLE_POLYFILL = `(function () {
  if ('shadowRootAdoptedStyleSheets' in HTMLTemplateElement.prototype) return;
  if (typeof CSSStyleSheet !== 'function' || !CSSStyleSheet.prototype.replaceSync) return;
  var sheets = new Map(), pending = new Set(), done = new WeakSet();
  var registerStyle = function (el) {
    var s = new CSSStyleSheet();
    s.replaceSync(el.textContent);
    sheets.set(el.getAttribute('specifier'), s);
  };
  var processHost = function (el, force) {
    if (done.has(el)) return;
    var sr = el.shadowRoot;
    if (!sr) { pending.add(el); return; }
    var specs = (el.dataset.adopt || '').trim().split(' ').filter(Boolean), list = [];
    for (var i = 0; i < specs.length; i++) {
      var sheet = sheets.get(specs[i]);
      if (!sheet && !force) { pending.add(el); return; }
      if (sheet) list.push(sheet);
    }
    sr.adoptedStyleSheets = sr.adoptedStyleSheets.concat(list);
    done.add(el); pending.delete(el);
    observer.observe(sr, { childList: true, subtree: true });
    scan(sr, force);
  };
  var scan = function (root, force) {
    root.querySelectorAll('style[type="module"][specifier]').forEach(registerStyle);
    root.querySelectorAll('[data-adopt]').forEach(function (el) { processHost(el, force); });
  };
  var retryPending = function (force) {
    Array.from(pending).forEach(function (el) { processHost(el, force); });
  };
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var nodes = records[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (node.nodeType !== 1) continue;
        if (node.matches('style[type="module"][specifier]')) registerStyle(node);
        else if (node.matches('[data-adopt]')) processHost(node, false);
        scan(node, false);
      }
    }
    retryPending(false);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', function () {
    observer.takeRecords();
    scan(document, true);
    retryPending(true);
    observer.disconnect();
    pending.clear();
  }, { once: true });
})();`;

// ── Markup codegen (shared by component template and page body) ───────────────
interface Ctx {
  readonly source: string;
  readonly isComponent: (tag: string) => boolean;
  readonly used: Set<string>;
  readonly w: CodeWriter;
  id: { n: number };
}

const slice = (source: string, sp: Span): string => source.slice(sp.start, sp.end);
const fresh = (ctx: Ctx): string => `$n${ctx.id.n++}`;

/** JS expression for an attribute's value (string literal, lone `@expr`, or template). */
function attrExpr(source: string, attr: Attribute): string {
  const parts = attr.value as ReadonlyArray<{ type: string; value?: string; expr?: Span }>;
  if (parts.every((p) => p.type === 'attribute-text')) {
    return JSON.stringify(parts.map((p) => p.value ?? '').join(''));
  }
  if (parts.length === 1 && parts[0]!.type === 'razor-expression') {
    return `(${slice(source, parts[0]!.expr!)})`;
  }
  const tpl = parts
    .map((p) => (p.type === 'attribute-text' ? (p.value ?? '').replace(/[`\\$]/gu, '\\$&') : '${' + slice(source, p.expr!) + '}'))
    .join('');
  return '`' + tpl + '`';
}

function emitElementAttrs(ctx: Ctx, el: ElementNode, v: string): void {
  let baseClass: string | undefined;
  const classExprs: string[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, ctx.source).value;
    if (b.type === 'class') {
      classExprs.push(`(${slice(ctx.source, b.value.expr)}) && ${JSON.stringify(b.className)}`);
    } else if (b.type === 'attr') {
      const isStatic = b.value.every((p) => p.type === 'attribute-text');
      if (isStatic) {
        const literal = b.value.map((p) => (p as { value: string }).value).join('');
        if (b.name === 'class') baseClass = literal;
        else ctx.w.line(`$dom.setAttr(${v}, ${JSON.stringify(b.name)}, ${JSON.stringify(literal)});`);
      } else {
        // interpolated: omit when falsy (boolean attributes, decision 21), else set.
        const name = JSON.stringify(b.name);
        ctx.w.line(
          `{ const $a = ${attrExpr(ctx.source, attr)}; if ($a === true) $dom.setAttr(${v}, ${name}, ''); ` +
            `else if ($a !== false && $a != null) $dom.setAttr(${v}, ${name}, String($a)); }`,
        );
      }
    } // event / property / bus / ref: not emitted for SSR
  }
  if (baseClass !== undefined || classExprs.length > 0) {
    const arr = [baseClass !== undefined ? JSON.stringify(baseClass) : null, ...classExprs].filter((x) => x !== null);
    ctx.w.line(`$dom.setAttr(${v}, 'class', [${arr.join(', ')}].filter(Boolean).join(' '));`);
  }
}

function componentProps(ctx: Ctx, el: ElementNode): string {
  const entries: string[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, ctx.source).value;
    if (b.type === 'attr') entries.push(`${JSON.stringify(b.name)}: ${attrExpr(ctx.source, attr)}`);
  }
  return `{ ${entries.join(', ')} }`;
}

function emitNode(ctx: Ctx, node: HtmlContent, parent: string): void {
  switch (node.type) {
    case 'text': {
      const v = fresh(ctx);
      ctx.w.line(`const ${v} = $dom.text(${JSON.stringify(node.value)}); $dom.append(${parent}, ${v});`);
      return;
    }
    case 'razor-expression': {
      const v = fresh(ctx);
      ctx.w.line(`const ${v} = $dom.text(String((${slice(ctx.source, node.expr)}) ?? '')); $dom.append(${parent}, ${v});`);
      return;
    }
    case 'element': {
      const v = fresh(ctx);
      if (ctx.isComponent(node.name)) {
        ctx.used.add(node.name);
        const s = fresh(ctx);
        ctx.w.line(`const ${v} = $dom.element(${JSON.stringify(node.name)});`);
        // The <template>'s shadowrootadoptedstylesheets is consumed by the parser and gone from
        // the DOM; project the specifier onto the host as data-adopt so the style polyfill reads
        // it (SDD-18 D-6). The native adopt attribute still rides on the template (serializer).
        ctx.w.line(`$dom.setAttr(${v}, 'data-adopt', ${JSON.stringify(node.name)});`);
        ctx.w.line(`const ${s} = $dom.attachShadow(${v});`);
        ctx.w.line(`${renderName(node.name)}($dom, ${s}, ${componentProps(ctx, node)});`);
        for (const child of node.children) emitNode(ctx, child, v); // light DOM (projected by <slot>)
      } else {
        ctx.w.line(`const ${v} = $dom.element(${JSON.stringify(node.name)});`);
        emitElementAttrs(ctx, node, v);
        for (const child of node.children) emitNode(ctx, child, v);
      }
      ctx.w.line(`$dom.append(${parent}, ${v});`);
      return;
    }
    case 'if':
      emitIf(ctx, node as unknown as IfNode, parent);
      return;
    case 'foreach': {
      const loop = node as unknown as ForeachNode;
      ctx.w.line(`for (${slice(ctx.source, loop.header.inner)}) {`);
      ctx.w.indent();
      for (const child of loop.body) emitNode(ctx, child, parent);
      ctx.w.dedent();
      ctx.w.line('}');
      return;
    }
    default:
      return; // comments, @code, etc.
  }
}

function emitIf(ctx: Ctx, node: IfNode, parent: string): void {
  node.branches.forEach((branch, i) => {
    const head = i === 0 ? 'if' : '} else if';
    ctx.w.line(`${head} (${slice(ctx.source, branch.header.inner)}) {`);
    ctx.w.indent();
    for (const child of branch.body) emitNode(ctx, child, parent);
    ctx.w.dedent();
  });
  if (node.elseBody) {
    ctx.w.line('} else {');
    ctx.w.indent();
    for (const child of node.elseBody) emitNode(ctx, child, parent);
    ctx.w.dedent();
  }
  ctx.w.line('}');
}

// ── Oxc extraction: prop defaults and inert signal initials ───────────────────
interface Prop { readonly name: string; readonly def?: string; }
interface Sig { readonly name: string; readonly init: string; }

function extractCode(source: string, doc: ComponentDocument): { props: Prop[]; signals: Sig[] } {
  const props: Prop[] = [];
  const signals: Sig[] = [];
  if (!doc.code) return { props, signals };
  const batch = new JsBatch(source);
  const ids = doc.code.parts.map((p) => ({ kind: p.type, id: batch.add('module-statements', p.js) }));
  const result = batch.parse();
  const map = result.value.mapOffset;
  for (const { id } of ids) {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    for (const stmt of stmts) {
      if (stmt.type !== 'VariableDeclaration') continue;
      for (const d of (stmt['declarations'] as OxcNode[] | undefined) ?? []) {
        const init = d['init'] as OxcNode | undefined;
        const id2 = d['id'] as OxcNode | undefined;
        if (!init || init.type !== 'CallExpression') continue;
        const callee = init['callee'] as OxcNode | undefined;
        const name = callee && callee.type === 'Identifier' ? String(callee['name']) : '';
        if (name === 'props' && id2 && id2.type === 'ObjectPattern') {
          for (const p of (id2['properties'] as OxcNode[] | undefined) ?? []) {
            const key = p['key'] as OxcNode | undefined;
            if (p.type !== 'Property' || !key || key.type !== 'Identifier') continue;
            const val = p['value'] as OxcNode | undefined;
            if (val && val.type === 'AssignmentPattern') {
              const right = val['right'] as OxcNode;
              props.push({ name: String(key['name']), def: source.slice(map(right.start), map(right.end)) });
            } else props.push({ name: String(key['name']) });
          }
        } else if (name === 'signal' && id2 && id2.type === 'Identifier') {
          const arg = (init['arguments'] as OxcNode[] | undefined)?.[0];
          signals.push({ name: String(id2['name']), init: arg ? source.slice(map(arg.start), map(arg.end)) : 'undefined' });
        }
      }
    }
  }
  return { props, signals };
}

/** Extract the `<head>` `<style>` CSS of a component (the shared sheet body). */
function componentCss(source: string, doc: ComponentDocument): string {
  const style = doc.head?.children.find((c): c is ElementNode => c.type === 'element' && c.name === 'style');
  if (!style) return '';
  return source.slice(style.openSpan.end, style.closeSpan ? style.closeSpan.start : style.span.end);
}

/** Escape a CSS/text body for embedding in a template literal. */
const tpl = (s: string): string => '`' + s.replace(/[`\\$]/gu, '\\$&') + '`';

// ── Module emitters ───────────────────────────────────────────────────────────
export function emitComponentModule(graph: ComponentGraph, comp: ResolvedComponent): string {
  const { props, signals } = extractCode(comp.source, comp.doc);
  const bodyW = new CodeWriter();
  const ctx: Ctx = {
    source: comp.source,
    isComponent: (t) => graph.components.has(t),
    used: new Set<string>(),
    w: bodyW,
    id: { n: 0 },
  };
  for (const child of comp.doc.template!.children) emitNode(ctx, child, '$shadow');

  const w = new CodeWriter();
  for (const tag of ctx.used) w.line(`import { render as ${renderName(tag)} } from './${tag}.mjs';`);
  if (ctx.used.size > 0) w.line('');
  w.line(`export const tag = ${JSON.stringify(comp.tag)};`);
  w.line(`export const css = ${tpl(componentCss(comp.source, comp.doc))};`);
  w.line('');
  w.line('export function render($dom, $shadow, props) {');
  w.indent();
  if (props.length > 0) {
    const pattern = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name)).join(', ');
    w.line(`const { ${pattern} } = props ?? {};`);
  }
  for (const s of signals) w.line(`const ${s.name} = { value: (${s.init}) }; // inert signal (SSR; hydration is client-side)`);
  for (const line of bodyW.toString().split('\n')) w.line(line);
  w.dedent();
  w.line('}');
  return w.toString();
}

export function emitPageModule(graph: ComponentGraph): string {
  const page = graph.entry as PageDocument;
  const source = graph.entrySource;
  const comps = [...graph.components.values()];

  // Body codegen.
  const bodyW = new CodeWriter();
  const ctx: Ctx = { source, isComponent: (t) => graph.components.has(t), used: new Set<string>(), w: bodyW, id: { n: 0 } };
  for (const child of page.body.children) emitNode(ctx, child, '$body');

  // Head codegen (page's own head elements + hoisted style modules at runtime).
  const headW = new CodeWriter();
  for (const child of page.head.children) {
    if (child.type !== 'element') continue;
    if (child.name === 'title') {
      const inner = child.children
        .map((c) => (c.type === 'razor-expression' ? `escapeText(String((${slice(source, c.expr)}) ?? ''))` : c.type === 'text' ? JSON.stringify(c.value) : "''"))
        .join(' + ');
      headW.line(`head += '<title>' + (${inner || "''"}) + '</title>\\n';`);
    } else if (child.name === 'meta') {
      headW.line(`head += ${JSON.stringify('  ' + source.slice(child.span.start, child.span.end) + '\n')};`);
    }
  }

  const w = new CodeWriter();
  for (const c of comps) {
    w.line(`import { render as ${renderName(c.tag)}, tag as ${renderName(c.tag)}Tag, css as ${renderName(c.tag)}Css } from './${c.tag}.mjs';`);
  }
  w.line('');
  w.line(`const COMPONENTS = [${comps.map((c) => `{ tag: ${renderName(c.tag)}Tag, css: ${renderName(c.tag)}Css }`).join(', ')}];`);
  w.line(`const STYLE_POLYFILL = ${tpl(STYLE_POLYFILL)};`);
  w.line('');
  w.line('export function page(data, io) {');
  w.indent();
  w.line('const { createDom, serialize, escapeText } = io;');
  w.line('const $dom = createDom();');
  w.line('const $body = $dom.element(\'body\');');
  for (const line of bodyW.toString().split('\n')) w.line(line);
  w.line('const bodyHtml = serialize($body);');
  w.line("let head = '';");
  for (const line of headW.toString().split('\n')) w.line(line);
  w.line('// The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,');
  w.line('// so its observer adopts each host sheet as it arrives; the style modules follow it.');
  w.line("head += '  <script>' + STYLE_POLYFILL + '</script>\\n';");
  w.line("head += COMPONENTS.map(function (c) { return '  <style type=\"module\" specifier=\"' + c.tag + '\">' + c.css + '</style>'; }).join('\\n') + '\\n';");
  w.line('return \'<!DOCTYPE html>\\n<html lang="es">\\n<head>\\n\' + head + \'</head>\\n\' + bodyHtml + \'\\n</html>\\n\';');
  w.dedent();
  w.line('}');
  return w.toString();
}
