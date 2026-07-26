/**
 * SDD-19 §4.6 core: the `.fud` → module transform. A page emits the streaming
 * generator with `.fud` imports; a component emits its render module with `.fud`
 * imports of the children it uses. Exercises the emit-with-`.fud` path end to end
 * over the real fixtures.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
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
});
