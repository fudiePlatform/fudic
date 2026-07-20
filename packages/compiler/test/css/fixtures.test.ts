/**
 * SDD-09 over the `<style>` bodies of the canonical `.fud` fixtures. Now that the
 * parser wires `parseStyle` in (SDD-05 §4.4), a `<style>` element carries a
 * `StyleNode` child directly, so reading it straight off the tree doubles as the
 * end-to-end proof that the CSS pass runs inside `parseDocument`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { StyleNode } from '../../src/css/index.js';
import type { HtmlContent } from '../../src/html/index.js';
import { parseDocument } from '../../src/html/index.js';

const FIXTURES = ['app-card.fud', 'app-button.fud', 'app-badge.fud'] as const;

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
}

/** Depth-first hunt for the `StyleNode` the parser builds under a `<style>`. */
function styleNode(children: readonly HtmlContent[]): StyleNode | null {
  for (const child of children) {
    if (child.type === 'element') {
      if (child.name.toLowerCase() === 'style') {
        const body = child.children[0];
        return body?.type === 'style-content' ? body : null;
      }
      const found = styleNode(child.children);
      if (found !== null) return found;
    }
  }
  return null;
}

/** The single literal run of a static-CSS body. */
function onlyText(node: StyleNode): string {
  const part = node.parts[0];
  return part?.type === 'css-text' ? part.value : '';
}

describe('the fixtures’ <style> bodies', () => {
  for (const name of FIXTURES) {
    it(`${name}: parses clean, balanced and fully tiled through parseDocument`, () => {
      const source = read(name);
      const result = parseDocument(source);
      // The wired CSS pass contributes no diagnostics on the fixtures' valid CSS.
      // (FUD0055 for @code/@if is expected here: this suite injects no SDD-06/08
      // sub-parsers, so those constructs degrade — that is not a CSS concern.)
      const cssCodes = result.diagnostics.filter((d) => d.code === 'FUD0130' || d.code === 'FUD0131');
      expect(cssCodes).toEqual([]);

      const node = styleNode(result.value.children);
      expect(node).not.toBeNull();
      if (node === null) return;

      // Static CSS only: one literal run, verbatim, covering the whole body.
      expect(node.parts.map((p) => p.type)).toEqual(['css-text']);
      expect(source.slice(node.span.start, node.span.end)).toBe(onlyText(node));
    });
  }

  it('app-card keeps its nested rule balanced', () => {
    const node = styleNode(parseDocument(read('app-card.fud')).value.children);
    expect(node).not.toBeNull();
    expect(onlyText(node!)).toContain('.body { margin-top: 0.5rem; }');
  });
});
