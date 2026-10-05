/**
 * The text a person sees in an element: the flattened tree. It enters each host's shadow root,
 * puts in each `<slot>` its assigned nodes (or its fallback content when nothing is assigned),
 * skips `<style>`, `<script>` and `<template>`, and collapses runs of white space.
 *
 * The DOM's own `textContent` on a host gives its light DOM, nearly always empty — and nobody
 * writing `text app-card "…"` means that.
 */

import type { PageScript } from './browser.js';

export const FLAT_TEXT: PageScript = `(element) => {
  const skip = new Set(['style', 'script', 'template']);
  const all = (nodes) => Array.from(nodes, walk).join('');
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.data;
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return all(node.childNodes);
    if (node.nodeType !== Node.ELEMENT_NODE || skip.has(node.localName)) return '';
    if (node.localName === 'slot') {
      const assigned = node.assignedNodes();
      return all(assigned.length > 0 ? assigned : node.childNodes);
    }
    return node.shadowRoot ? walk(node.shadowRoot) : all(node.childNodes);
  };
  return walk(element).replace(/\\s+/g, ' ').trim();
}`;
