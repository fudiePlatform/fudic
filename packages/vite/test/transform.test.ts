/**
 * SDD-19 §4.6 core: the `.fud` → module transform. A page emits the streaming
 * generator with `.fud` imports; a component emits its render module with `.fud`
 * imports of the children it uses. Exercises the emit-with-`.fud` path end to end
 * over the real fixtures.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformFud } from '../src/transform.js';
import { nodeIo } from '../src/io.js';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../compiler/fixtures/${name}`, import.meta.url));

describe('transformFud', () => {
  it('emits a page as a streaming generator importing components by .fud', () => {
    const result = transformFud(fixture('home.fud'), nodeIo());
    expect(result).not.toBeNull();
    const code = result!.code;
    expect(code).toContain('export function* page(data, io) {');
    expect(code).toContain("from './app-card.fud';");
    expect(code).toContain("from './app-badge.fud';");
    expect(code).not.toContain('.mjs'); // Vite owns the graph, not the standalone .mjs
  });

  it('emits a component as a render module importing its used children by .fud', () => {
    const result = transformFud(fixture('app-card.fud'), nodeIo());
    expect(result).not.toBeNull();
    const code = result!.code;
    expect(code).toContain('export const tag = "app-card";');
    expect(code).toContain('export function render($dom, $shadow, props) {');
    expect(code).toContain("import { render as renderAppButton } from './app-button.fud';");
  });

  it('emits a leaf component with no imports', () => {
    const code = transformFud(fixture('app-badge.fud'), nodeIo())!.code;
    expect(code).toContain('export const tag = "app-badge";');
    expect(code).not.toContain('import ');
  });

  it('returns null for a non-.fud id', () => {
    expect(transformFud('/some/module.ts', nodeIo())).toBeNull();
  });

  it('produces a Source Map v3 anchored to the .fud (SDD-19 §4.6)', () => {
    const id = fixture('home.fud');
    const result = transformFud(id, nodeIo())!;
    expect(result.map.version).toBe(3);
    expect(result.map.sources).toEqual([id.replace(/\\/gu, '/')]);
    expect(result.map.sourcesContent[0]).toContain('<!DOCTYPE html>'); // the real .fud text
    expect(result.map.mappings.length).toBeGreaterThan(0); // Base64 VLQ segments present
  });

  // BUG-23 §4.4, criteria 17–19. Only a caller that resolved the graph can see these, which
  // is why the transform is where they surface: the parser has one file, this has the child.
  describe('the component contract (FUD0197–FUD0199)', () => {
    /** A page linking one `app-circle`, written to a temp dir and transformed. */
    function contractOf(body: string, circle: string): readonly string[] {
      const root = mkdtempSync(join(tmpdir(), 'fudic-contract-'));
      writeFileSync(join(root, 'app-circle.fud'), circle);
      const page =
        '<!DOCTYPE html>\n<html>\n<head><link rel="component" href="./app-circle.fud"></head>\n' +
        `<body>${body}</body>\n</html>\n`;
      writeFileSync(join(root, 'page.fud'), page);
      return transformFud(join(root, 'page.fud'), nodeIo())!.diagnostics.map((d) => d.code);
    }

    const CIRCLE =
      '@code {\n  const { name } = props<{ name: string }>();\n}\n' +
      '<app-circle>\n  <template shadowrootmode="open"><b>@name</b><slot name="PEPITO"></slot></template>\n</app-circle>\n';

    it('reports the required prop, the unknown prop and the unknown slot', () => {
      expect(contractOf('<app-circle></app-circle>', CIRCLE)).toEqual(['FUD0197']);
      expect(contractOf('<app-circle .name="a" .x="1"></app-circle>', CIRCLE)).toEqual(['FUD0198']);
      expect(contractOf('<app-circle .name="a"><i slot="no"></i></app-circle>', CIRCLE)).toEqual([
        'FUD0199',
      ]);
    });

    it('says nothing when the host honours the contract', () => {
      const ok = '<app-circle .name="a"><i slot="PEPITO"></i></app-circle>';
      expect(contractOf(ok, CIRCLE)).toEqual([]);
    });
  });
});
