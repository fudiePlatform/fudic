/**
 * SDD-09 over the `<style>` bodies of the canonical `.fud` fixtures. The bodies
 * are located the way the pipeline will locate them — the `RawTextNode` SDD-05
 * already stores under a `<style>` element — so this doubles as the wiring proof
 * that SDD-09 lands over SDD-03/05 without changing them.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseStyle, type StyleNode } from '../../src/css/index.js';
import type { HtmlContent, RawTextNode } from '../../src/html/index.js';
import { parseDocument } from '../../src/html/index.js';

const FIXTURES = ['app-card.fud', 'app-button.fud', 'app-badge.fud'] as const;

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
}

/** Depth-first hunt for the `raw-text` body of the `<style>` element. */
function styleBody(children: readonly HtmlContent[]): RawTextNode | null {
  for (const child of children) {
    if (child.type === 'element') {
      if (child.name.toLowerCase() === 'style') {
        const body = child.children[0];
        if (body?.type === 'raw-text') return body;
        return null;
      }
      const found = styleBody(child.children);
      if (found !== null) return found;
    }
  }
  return null;
}

describe('the fixtures’ <style> bodies', () => {
  for (const name of FIXTURES) {
    it(`${name}: parses clean, balanced and fully tiled`, () => {
      const source = read(name);
      const body = styleBody(parseDocument(source).value.children);
      expect(body).not.toBeNull();
      if (body === null) return;

      const { value, diagnostics } = parseStyle(source, body.span);
      expect(diagnostics).toEqual([]);

      // Static CSS only: one literal run, verbatim, covering the whole body.
      expect(value.parts.map((p) => p.type)).toEqual(['css-text']);
      const [only] = value.parts as readonly StyleNode['parts'][number][];
      expect(only?.type === 'css-text' ? only.value : '').toBe(body.value);
      expect(value.span).toEqual(body.span);
    });
  }

  it('app-card keeps its nested rule balanced', () => {
    const source = read('app-card.fud');
    const body = styleBody(parseDocument(source).value.children);
    expect(body?.value).toContain('.body { margin-top: 0.5rem; }');
  });
});
