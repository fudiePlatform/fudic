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
import type { ElementNode, DoctypeNode } from '../html/index.js';
import type { CodeBlockNode } from '../code/index.js';

/** The two top-level shapes a `.fud` file can take (decision 51). */
export type StructuredDocument = PageDocument | ComponentDocument;

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
