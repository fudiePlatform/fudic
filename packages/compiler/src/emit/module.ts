/**
 * Module emit (SDD-15 server branch): turn the AST + the resolved dependency graph
 * (SDD-10 links, see resolve.ts) into ES modules — ONE `.mjs` per component and one for
 * the page. Text only; the compiler imports no runtime. This file only ORCHESTRATES:
 * the markup codegen lives in `markup.ts`, the `@code` extraction in `oxc-code.ts`, and
 * the inline style-adoption polyfill in `polyfill.ts`.
 *
 * Component module: `export const tag`, `export const css`, and
 * `export function render($dom, $shadow, props)` that builds the shadow subtree via the
 * injected `Dom<N>` adapter. Composition is real ES imports between modules
 * (`app-card.mjs` imports `app-button.mjs`). Signals are emitted INERT in SSR — an
 * un-hydrated `signal` contributes only its initial value.
 *
 * Page module (`home.mjs`): imports the component modules, hoists every component's
 * `<head>` into the page `<head>` (each `<style>` as `<style type="module" specifier>`),
 * composes the body, and emits the inline, blocking style-adoption `<script>` (SDD-18 §5)
 * in `<head>` BEFORE the body streams, so the page shows with styles applied.
 * `page(data, io)` returns the whole HTML string; `io` injects the SSR adapter.
 */

import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import type { ElementNode } from '../html/index.js';
import type { Span } from '../types/index.js';
import type { PageDocument, ComponentDocument } from '../document/index.js';
import { CodeWriter } from './writer.js';
import { MarkupEmitter, renderName, tpl } from './markup.js';
import { extractCode } from './oxc-code.js';
import { STYLE_POLYFILL } from './polyfill.js';

const slice = (source: string, sp: Span): string => source.slice(sp.start, sp.end);

/**
 * Emit options. `importExt` is the extension used for sibling module imports: `.mjs`
 * for the standalone emit (build.ts / goldens), `.fud` for the Vite plugin so Vite
 * owns the module-graph resolution (SDD-19 §4.11.1).
 */
export interface EmitOptions {
  readonly importExt?: string;
}

/** The `<head>` `<style>` CSS of a component (the shared sheet body). */
function componentCss(source: string, doc: ComponentDocument): string {
  const style = doc.head?.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  );
  if (!style) return '';
  return source.slice(style.openSpan.end, style.closeSpan ? style.closeSpan.start : style.span.end);
}

export function emitComponentModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions = {},
): string {
  const ext = options.importExt ?? '.mjs';
  const { props, signals } = extractCode(comp.source, comp.doc);
  const bodyW = new CodeWriter();
  const em = new MarkupEmitter(comp.source, bodyW, (t) => graph.components.has(t));
  for (const child of comp.doc.template!.children) em.emit(child, '$shadow');

  const w = new CodeWriter();
  for (const tag of em.used) w.line(`import { render as ${renderName(tag)} } from './${tag}${ext}';`);
  if (em.used.size > 0) w.line('');
  w.line(`export const tag = ${JSON.stringify(comp.tag)};`);
  w.line(`export const css = ${tpl(componentCss(comp.source, comp.doc))};`);
  w.line('');
  w.line('export function render($dom, $shadow, props) {');
  w.indent();
  if (props.length > 0) {
    const pattern = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name)).join(', ');
    w.line(`const { ${pattern} } = props ?? {};`);
  }
  for (const s of signals) {
    w.line(`const ${s.name} = { value: (${s.init}) }; // inert signal (SSR; hydration is client-side)`);
  }
  for (const line of bodyW.toString().split('\n')) w.line(line);
  w.dedent();
  w.line('}');
  return w.toString();
}

export function emitPageModule(graph: ComponentGraph, options: EmitOptions = {}): string {
  const ext = options.importExt ?? '.mjs';
  const page = graph.entry as PageDocument;
  const source = graph.entrySource;
  const comps = [...graph.components.values()];

  // Body codegen.
  const bodyW = new CodeWriter();
  const em = new MarkupEmitter(source, bodyW, (t) => graph.components.has(t));
  for (const child of page.body.children) em.emit(child, '$body');

  // Head codegen (page's own head elements + hoisted style modules at runtime).
  const headW = new CodeWriter();
  for (const child of page.head.children) {
    if (child.type !== 'element') continue;
    if (child.name === 'title') {
      const inner = child.children
        .map((c) =>
          c.type === 'razor-expression'
            ? `escapeText(String((${slice(source, c.expr)}) ?? ''))`
            : c.type === 'text'
              ? JSON.stringify(c.value)
              : "''",
        )
        .join(' + ');
      headW.line(`head += '<title>' + (${inner || "''"}) + '</title>\\n';`);
    } else if (child.name === 'meta') {
      headW.line(`head += ${JSON.stringify('  ' + source.slice(child.span.start, child.span.end) + '\n')};`);
    }
  }

  const w = new CodeWriter();
  for (const c of comps) {
    w.line(`import { render as ${renderName(c.tag)}, tag as ${renderName(c.tag)}Tag, css as ${renderName(c.tag)}Css } from './${c.tag}${ext}';`);
  }
  w.line('');
  w.line(`const COMPONENTS = [${comps.map((c) => `{ tag: ${renderName(c.tag)}Tag, css: ${renderName(c.tag)}Css }`).join(', ')}];`);
  w.line(`const STYLE_POLYFILL = ${tpl(STYLE_POLYFILL)};`);
  w.line('');
  // Streaming a trozos (SDD-19 §4.3): a generator that yields the <head> FIRST, then the
  // body by pieces via `serialize` (serializeChunks), then the close. `io.serialize` is a
  // generator; joining the pieces is byte-identical to the previous whole-string return.
  w.line('export function* page(data, io) {');
  w.indent();
  w.line('const { createDom, serialize, escapeText } = io;');
  w.line("let head = '';");
  for (const line of headW.toString().split('\n')) w.line(line);
  w.line('// The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,');
  w.line('// so its observer adopts each host sheet as it arrives; the style modules follow it.');
  w.line("head += '  <script>' + STYLE_POLYFILL + '</script>\\n';");
  w.line("head += COMPONENTS.map(function (c) { return '  <style type=\"module\" specifier=\"' + c.tag + '\">' + c.css + '</style>'; }).join('\\n') + '\\n';");
  w.line('yield \'<!DOCTYPE html>\\n<html lang="es">\\n<head>\\n\' + head + \'</head>\\n\';');
  w.line('const $dom = createDom();');
  w.line('const $body = $dom.element(\'body\');');
  for (const line of bodyW.toString().split('\n')) w.line(line);
  w.line('yield* serialize($body);');
  w.line("yield '\\n</html>\\n';");
  w.dedent();
  w.line('}');
  return w.toString();
}
