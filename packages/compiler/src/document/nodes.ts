/**
 * The structured document AST (SDD-10 §3). A validation + classification pass over
 * the flat `HtmlDocument` of SDD-05 lifts the meaningful top-level pieces — the
 * `<link rel="component">`, the `@code`, the `<head>`/`<body>`, the DSD host wrapper —
 * into named fields, so the resolver, the head stylesheet and the emit consume a
 * typed shape instead of re-walking source order.
 *
 * Structure only: it neither re-tokenizes nor parses new content (SDD-05..09 already
 * did), does not extract/lift `@code` or the head (emit, SDD-15), and does not do deep
 * semantic analysis (region uniqueness, unresolved custom elements: SDD-12).
 */

import type { Node } from '../types/index.js';
import type { ElementNode, DoctypeNode, HtmlContent } from '../html/index.js';
import type { CodeBlockNode } from '../code/index.js';
import type { RenderDirectiveNode, RenderSectionNode, SectionNode } from '../layout/index.js';

/**
 * The top-level roles a `.fud` file can take. Two of them come from decision 51 (doctype ⇒
 * page, else component); SDD-21 splits each by whether the file declares a layout:
 *
 *   doctype + `@RenderBody()`   ⇒ LayoutDocument   (owns the shell)
 *   doctype, no `@RenderBody()` ⇒ PageDocument     (a standalone route, as before)
 *   no doctype + `rel="layout"` ⇒ RouteDocument    (a body fragment)
 *   no doctype, no layout link  ⇒ ComponentDocument
 */
export type StructuredDocument =
  | PageDocument
  | ComponentDocument
  | RouteDocument
  | LayoutDocument;

/**
 * Component file: `<link rel="component">`* → `@code`? → `<head>`? → host wrapper
 * (decisions 53, 62, 75). The four phases are strictly ordered; a piece out of phase
 * is a diagnostic, not an exception — the fields are still filled best-effort.
 */
export interface ComponentDocument extends Node {
  readonly type: 'component-document';
  /** All top-level `<link rel="component">`, in order. Any number (decision 55). */
  readonly links: readonly ElementNode[];
  /** The single `@code`, if present (decision 54). */
  readonly code?: CodeBlockNode;
  /** The `<head>` fragment, if present (decision 62; holds the component's single `<style>`). */
  readonly head?: ElementNode;
  /** The host wrapper element — the component's identity (decision 75). Absent only on FUD0156 degradation. */
  readonly host?: ElementNode;
  /** The `<template shadowrootmode>` inside the wrapper (decision 75.a). Absent on FUD0157 degradation. */
  readonly template?: ElementNode;
  /** Component tag name, read from `host.name`. Empty string on degradation. */
  readonly name: string;
}

/** Page file: `<!DOCTYPE html>` + `<html><head>…</head><body>…</body></html>` (decisions 57, 58). */
export interface PageDocument extends Node {
  readonly type: 'page-document';
  readonly doctype: DoctypeNode;
  readonly html: ElementNode;
  readonly head: ElementNode;
  readonly body: ElementNode;
  /** `<link rel="component">` found inside `<head>` (decision 59). */
  readonly links: readonly ElementNode[];
  /** `@code` found inside `<head>` (decision 60). */
  readonly code?: CodeBlockNode;
}

/**
 * Route file (SDD-21, decisions 81, 83): a body fragment that delegates its shell to a
 * layout. Same four-phase order as a component, with two differences that are the whole
 * point of the role — a leading `<link rel="layout">`, and markup with any number of roots
 * and no host wrapper.
 */
export interface RouteDocument extends Node {
  readonly type: 'route-document';
  /** The `<link rel="layout" href>` that makes this file a route (decision 81). */
  readonly layoutLink: ElementNode;
  /** Its static `href`. Empty string when absent or interpolated (FUD0436 degradation). */
  readonly layoutHref: string;
  /** `<link rel="component">`, any number (decision 55). */
  readonly links: readonly ElementNode[];
  /** The single `@code`, if present (decision 54). */
  readonly code?: CodeBlockNode;
  /** The `<head>` fragment: this route's head contributions (decisions 62, 88). */
  readonly head?: ElementNode;
  /** The body fragment, in source order. Multiple roots allowed (decision 83). */
  readonly markup: readonly HtmlContent[];
  /** `@section name { … }` blocks, in source order (decision 84). */
  readonly sections: readonly SectionNode[];
}

/**
 * Layout file (SDD-21, decision 82): a page-shaped document that owns the shell and
 * renders a route into it. Identified by its FORM — doctype plus exactly one
 * `@RenderBody()` — never by its file name.
 */
export interface LayoutDocument extends Node {
  readonly type: 'layout-document';
  readonly doctype: DoctypeNode;
  readonly html: ElementNode;
  readonly head: ElementNode;
  readonly body: ElementNode;
  /** `<link rel="component">` found inside `<head>` (decision 59). */
  readonly links: readonly ElementNode[];
  /** `@code` found inside `<head>` (decision 60). */
  readonly code?: CodeBlockNode;
  /** A nested layout's `<link rel="layout">`, when this layout has a parent (decision 87). */
  readonly layoutLink?: ElementNode;
  readonly layoutHref?: string;
  /** The single `@RenderBody()`. Absent only on FUD0423 degradation. */
  readonly renderBody?: RenderDirectiveNode;
  /** The `@RenderHead()`, at most one (decision 86). Absent ⇒ FUD0425, injected at head end. */
  readonly renderHead?: RenderDirectiveNode;
  /** Every `@RenderSection(name)`, in source order. */
  readonly renderSections: readonly RenderSectionNode[];
}
