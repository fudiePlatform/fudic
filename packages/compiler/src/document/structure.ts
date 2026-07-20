/**
 * Document structuring (SDD-10). Imposes the top-level structure of a parsed
 * `HtmlDocument`: dispatches by `doc.mode`, validates ordering/obligatoriness, and
 * lifts links / `@code` / head / body / the DSD host wrapper into named fields.
 *
 * Whitespace `TextNode`, `CommentNode` and `RazorCommentNode` are transparent when
 * validating order (decision 56): they may appear freely between top-level nodes.
 *
 * It never throws (SDD-10 §5): a bad doctype, a missing `<head>`/`<body>`, a piece out
 * of place all degrade the value and emit a located diagnostic. Pure over the immutable
 * SDD-05 nodes; the relocated nodes keep their original spans.
 */

import { type Span, span, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import type {
  HtmlDocument,
  HtmlContent,
  ElementNode,
  DoctypeNode,
  Attribute,
} from '../html/index.js';
import type { CodeBlockNode } from '../code/index.js';
import type { StructuredDocument, ComponentDocument, PageDocument } from './nodes.js';

/** Doctype other than `<!DOCTYPE html>` (decision 57). */
const FUD_BAD_DOCTYPE = 'FUD0150';
/** Page mode: missing or misordered `<html>`/`<head>`/`<body>` (decision 58). */
const FUD_PAGE_SKELETON = 'FUD0151';
/** `<link rel="component">` outside `<head>` in page mode (decision 59). */
const FUD_LINK_OUT_OF_HEAD = 'FUD0152';
/** `@code` outside `<head>` in page mode (decision 60). */
const FUD_CODE_OUT_OF_HEAD = 'FUD0153';
/** More than one `@code` in the document (decisions 54, 33.d). */
const FUD_DUPLICATE_CODE = 'FUD0154';
/** Invalid top-level order in a component: link/code/head/host out of order (decision 53). */
const FUD_COMPONENT_ORDER = 'FUD0155';
/** Invalid host wrapper: absent, multiple, or a tag without a hyphen (decision 75). */
const FUD_BAD_HOST = 'FUD0156';
/** The wrapper does not hold exactly one `<template>` (decision 75.a). */
const FUD_BAD_TEMPLATE = 'FUD0157';
/** `shadowrootmode` absent or other than `open` — `closed` is out of v1 (decision 75.a). */
const FUD_BAD_SHADOWROOT = 'FUD0158';
/** More than one `<style>` in the component `<head>` fragment (decision 76). */
const FUD_DUPLICATE_STYLE = 'FUD0159';
/** A `host` attribute written in the source — a reserved output marker (decision 76). */
const FUD_RESERVED_HOST_ATTR = 'FUD0160';

const WHITESPACE_ONLY = /^\s*$/u;

/** True for a node that carries no top-level structure (decision 56): blank text, comments. */
function isTransparent(node: HtmlContent): boolean {
  return (
    (node.type === 'text' && WHITESPACE_ONLY.test(node.value)) ||
    node.type === 'comment' ||
    node.type === 'razor-comment'
  );
}

/** The significant children of an element, with whitespace/comments dropped (decision 56). */
function significant(nodes: readonly HtmlContent[]): readonly HtmlContent[] {
  return nodes.filter((n) => !isTransparent(n));
}

function isElement(node: HtmlContent): node is ElementNode {
  return node.type === 'element';
}

function isCodeBlock(node: HtmlContent): node is CodeBlockNode {
  return node.type === 'code';
}

function isElementNamed(node: HtmlContent, name: string): node is ElementNode {
  return node.type === 'element' && node.name === name;
}

/** The first attribute whose name is the literal `name` (a dynamic name never matches). */
function findAttr(el: ElementNode, name: string): Attribute | undefined {
  return el.attributes.find((a) => typeof a.name === 'string' && a.name === name);
}

/**
 * The statically decidable value of an attribute, or `undefined` when any part is a
 * Razor expression (a dynamic value is not statically decidable). A boolean/empty
 * attribute yields `''`.
 */
function staticValue(attr: Attribute): string | undefined {
  let out = '';
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return undefined;
    out += part.value;
  }
  return out;
}

/** True if `el` is `<link>` with a static `rel="component"` (a framework component import). */
export function isComponentLink(el: ElementNode): boolean {
  if (el.name !== 'link') return false;
  const rel = findAttr(el, 'rel');
  return rel !== undefined && staticValue(rel) === 'component';
}

/** A minimal placeholder element for a degraded page skeleton (SDD-10 §5). */
function placeholder(name: string, at: Span): ElementNode {
  return {
    type: 'element',
    name,
    namespace: 'html',
    kind: 'normal',
    attributes: [],
    children: [],
    openSpan: at,
    span: at,
  };
}

/**
 * Impose document structure on a parsed `HtmlDocument`. Dispatches by `doc.mode`,
 * validates ordering/obligatoriness, and lifts links/`@code`/head/body into named
 * fields. Never throws; violations are diagnostics and the result is still filled
 * best-effort.
 */
export function structureDocument(
  source: string,
  doc: HtmlDocument,
): ParseResult<StructuredDocument> {
  return doc.mode === 'page' ? structurePage(source, doc) : structureComponent(doc);
}

// --- Component mode (decisions 53–55, 62, 75–76) -----------------------------------

/** The ordered phase a significant top-level node belongs to (decision 53). */
function componentSlot(node: HtmlContent): 1 | 2 | 3 | 4 {
  if (isElement(node) && isComponentLink(node)) return 1;
  if (isCodeBlock(node)) return 2;
  if (isElementNamed(node, 'head')) return 3;
  return 4;
}

function structureComponent(doc: HtmlDocument): ParseResult<StructuredDocument> {
  const diagnostics: Diagnostic[] = [];
  const links: ElementNode[] = [];
  const rootNodes: HtmlContent[] = [];
  let code: CodeBlockNode | undefined;
  let head: ElementNode | undefined;

  // Four-phase state machine in strict order (decisions 53, 75). A node arriving with a
  // slot below the highest seen is out of phase (FUD0155) but still placed (recovery).
  let maxSlot = 0;
  for (const node of significant(doc.children)) {
    const slot = componentSlot(node);
    if (slot < maxSlot) {
      diagnostics.push(
        errorDiag(FUD_COMPONENT_ORDER, 'Top-level order must be link → @code → head → host', node.span),
      );
    } else {
      maxSlot = slot;
    }
    switch (slot) {
      case 1:
        links.push(node as ElementNode);
        break;
      case 2:
        if (code !== undefined) {
          diagnostics.push(errorDiag(FUD_DUPLICATE_CODE, 'A component has at most one @code block', node.span));
        } else {
          code = node as CodeBlockNode;
        }
        break;
      case 3:
        if (head !== undefined) {
          diagnostics.push(errorDiag(FUD_COMPONENT_ORDER, 'A component has at most one <head> fragment', node.span));
        } else {
          head = node as ElementNode;
        }
        break;
      default:
        rootNodes.push(node);
        break;
    }
  }

  const host = validateHost(rootNodes, doc.span, diagnostics);
  const template = host !== undefined ? validateTemplate(host, diagnostics) : undefined;
  if (head !== undefined) validateHeadStyles(head, diagnostics);

  const node: ComponentDocument = {
    type: 'component-document',
    span: doc.span,
    links,
    name: host?.name ?? '',
    ...(code !== undefined ? { code } : {}),
    ...(head !== undefined ? { head } : {}),
    ...(host !== undefined ? { host } : {}),
    ...(template !== undefined ? { template } : {}),
  };
  return diagnostics.length === 0 ? ok(node) : withDiagnostics(node, diagnostics);
}

/**
 * The host wrapper (decisions 75, 76): exactly one root element whose tag is a custom
 * element (contains `-`). Missing, extra, or hyphen-less tag → FUD0156; with more than
 * one, the first valid custom element becomes the host (recovery).
 */
function validateHost(
  rootNodes: readonly HtmlContent[],
  docSpan: Span,
  diagnostics: Diagnostic[],
): ElementNode | undefined {
  const rootElements = rootNodes.filter(isElement);
  const host = rootElements.find((el) => el.name.includes('-'));

  if (rootElements.length === 0) {
    diagnostics.push(errorDiag(FUD_BAD_HOST, 'A component must have exactly one custom-element host wrapper', docSpan));
  } else if (rootElements.length > 1) {
    diagnostics.push(errorDiag(FUD_BAD_HOST, 'A component must have exactly one root host wrapper', rootElements[1]!.span));
  } else if (host === undefined) {
    diagnostics.push(errorDiag(FUD_BAD_HOST, 'The host wrapper tag must be a custom element (contain a hyphen)', rootElements[0]!.span));
  }
  return host;
}

/**
 * The DSD identity inside the host (decision 75.a): exactly one significant child, a
 * `<template>` with a static `shadowrootmode="open"`. Anything else → FUD0157/FUD0158.
 */
function validateTemplate(host: ElementNode, diagnostics: Diagnostic[]): ElementNode | undefined {
  const children = significant(host.children);
  const only = children.length === 1 ? children[0] : undefined;
  if (only === undefined || !isElementNamed(only, 'template')) {
    const at = children[0]?.span ?? host.span;
    diagnostics.push(errorDiag(FUD_BAD_TEMPLATE, 'The host wrapper must contain exactly one <template>', at));
    return undefined;
  }

  const mode = findAttr(only, 'shadowrootmode');
  if (mode === undefined) {
    diagnostics.push(errorDiag(FUD_BAD_SHADOWROOT, 'The <template> requires shadowrootmode="open"', only.openSpan));
  } else if (staticValue(mode) !== 'open') {
    diagnostics.push(errorDiag(FUD_BAD_SHADOWROOT, 'shadowrootmode must be "open" (closed is out of v1)', mode.span));
  }
  return only;
}

/**
 * The `<head>` fragment holds at most one `<style>`, with no `host` attribute (decision
 * 76). A second `<style>` → FUD0159; a source-written `host` attribute (a reserved output
 * marker) → FUD0160. Shallow: direct children of the fragment only.
 */
function validateHeadStyles(head: ElementNode, diagnostics: Diagnostic[]): void {
  let seen = false;
  for (const child of head.children) {
    if (!isElementNamed(child, 'style')) continue;
    if (seen) {
      diagnostics.push(errorDiag(FUD_DUPLICATE_STYLE, 'A component <head> fragment holds at most one <style>', child.span));
    }
    seen = true;
    const hostAttr = findAttr(child, 'host');
    if (hostAttr !== undefined) {
      diagnostics.push(errorDiag(FUD_RESERVED_HOST_ATTR, 'The host attribute is a reserved output marker and cannot be written in source', hostAttr.span));
    }
  }
}

// --- Page mode (decisions 57–60) ---------------------------------------------------

function structurePage(source: string, doc: HtmlDocument): ParseResult<StructuredDocument> {
  const diagnostics: Diagnostic[] = [];
  const top = significant(doc.children);

  const doctype = validateDoctype(source, doc, top, diagnostics);
  const { html, head, body } = validateSkeleton(doc, top, diagnostics);

  // Links and @code are collected from <head> (decisions 59, 60); their order there is
  // not strict (61). Anywhere else in the tree they are out of place (FUD0152/FUD0153).
  const links: ElementNode[] = [];
  let code: CodeBlockNode | undefined;
  for (const child of head.children) {
    if (isElement(child) && isComponentLink(child)) {
      links.push(child);
    } else if (isCodeBlock(child)) {
      if (code !== undefined) {
        diagnostics.push(errorDiag(FUD_DUPLICATE_CODE, 'A document has at most one @code block', child.span));
      } else {
        code = child;
      }
    }
  }
  collectOutOfPlace(doc.children, head, diagnostics);

  const node: PageDocument = {
    type: 'page-document',
    span: doc.span,
    doctype,
    html,
    head,
    body,
    links,
    ...(code !== undefined ? { code } : {}),
  };
  return diagnostics.length === 0 ? ok(node) : withDiagnostics(node, diagnostics);
}

/** The doctype must read exactly `<!DOCTYPE html>`, case-insensitively (decision 57). */
function validateDoctype(
  source: string,
  doc: HtmlDocument,
  top: readonly HtmlContent[],
  diagnostics: Diagnostic[],
): DoctypeNode {
  const found = top.find((n): n is DoctypeNode => n.type === 'doctype');
  // Page mode is detected by a leading `<!DOCTYPE` (decision 51), so a doctype is always
  // present; the synthetic fallback only keeps the non-optional field total if it is not.
  const doctype: DoctypeNode = found ?? { type: 'doctype', span: emptySpan(doc.span.start) };
  const text = source.slice(doctype.span.start, doctype.span.end).trim().toLowerCase();
  if (text !== '<!doctype html>') {
    diagnostics.push(errorDiag(FUD_BAD_DOCTYPE, 'The doctype must be <!DOCTYPE html>', doctype.span));
  }
  return doctype;
}

/**
 * The `<html>` root wraps `<head>` first and `<body>` after, both mandatory (decision
 * 58). A missing piece or wrong order → FUD0151; missing elements degrade to
 * placeholders so the non-optional fields stay filled (SDD-10 §5).
 */
function validateSkeleton(
  doc: HtmlDocument,
  top: readonly HtmlContent[],
  diagnostics: Diagnostic[],
): { html: ElementNode; head: ElementNode; body: ElementNode } {
  const html = top.find((n): n is ElementNode => isElementNamed(n, 'html'));
  if (html === undefined) {
    diagnostics.push(errorDiag(FUD_PAGE_SKELETON, 'A page must have an <html> root', doc.span));
    const at = emptySpan(doc.span.start);
    return { html: placeholder('html', at), head: placeholder('head', at), body: placeholder('body', at) };
  }

  const inner = significant(html.children);
  const headIdx = inner.findIndex((n) => isElementNamed(n, 'head'));
  const bodyIdx = inner.findIndex((n) => isElementNamed(n, 'body'));
  if (headIdx === -1 || bodyIdx === -1 || headIdx > bodyIdx) {
    diagnostics.push(errorDiag(FUD_PAGE_SKELETON, 'A page must have <head> then <body> inside <html>', html.span));
  }

  const at = emptySpan(html.span.start);
  const head = headIdx === -1 ? placeholder('head', at) : (inner[headIdx] as ElementNode);
  const body = bodyIdx === -1 ? placeholder('body', at) : (inner[bodyIdx] as ElementNode);
  return { html, head, body };
}

/**
 * Walk the whole tree (skipping the `<head>` subtree, whose links/`@code` are the valid
 * ones) reporting every component link (FUD0152) and `@code` (FUD0153) found elsewhere.
 */
function collectOutOfPlace(
  nodes: readonly HtmlContent[],
  head: ElementNode,
  diagnostics: Diagnostic[],
): void {
  for (const node of nodes) {
    if (node === head) continue;
    if (isElement(node)) {
      if (isComponentLink(node)) {
        diagnostics.push(errorDiag(FUD_LINK_OUT_OF_HEAD, '<link rel="component"> must live inside <head>', node.span));
      }
      collectOutOfPlace(node.children, head, diagnostics);
    } else if (isCodeBlock(node)) {
      diagnostics.push(errorDiag(FUD_CODE_OUT_OF_HEAD, '@code must live inside <head>', node.span));
    }
  }
}
