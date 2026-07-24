/**
 * resolveComponents — the dependency graph the emit needs BEFORE it can know what to
 * render, walked from `<link rel="component">` (SDD-10). IO is injected (in-memory here),
 * which also proves the compiler never touches the filesystem itself.
 */
import { describe, expect, it } from 'vitest';
import { resolveComponents, linkHref } from '../../src/emit/index.js';
import { parse, memoryIo, fixtureIo, fixturesDir } from './_support.js';
import { join } from 'node:path';

const comp = (tag: string, links: string): string =>
  `${links}\n<${tag}>\n  <template shadowrootmode="open"><span></span></template>\n</${tag}>\n`;

// A `<!DOCTYPE>` is what marks a document as a PAGE (with links); a component has none.
const page = (body: string): string => `<!DOCTYPE html>\n<html>${body}</html>`;

describe('linkHref', () => {
  const linksOf = (source: string) => parse(source).links;

  it('returns the static href of a <link>', () => {
    const [link] = linksOf(page('<head><link rel="component" href="./a.fud"></head><body></body>'));
    expect(linkHref(link!)).toBe('./a.fud');
  });

  it('returns undefined when there is no href attribute', () => {
    const [link] = linksOf(page('<head><link rel="component"></head><body></body>'));
    expect(linkHref(link!)).toBeUndefined();
  });

  it('treats an interpolated href as empty (only static text contributes)', () => {
    const [link] = linksOf(page('<head><link rel="component" href="@x"></head><body></body>'));
    expect(linkHref(link!)).toBe('');
  });
});

describe('resolveComponents', () => {
  it('walks the transitive graph from a page entry', () => {
    const io = memoryIo({
      '/home.fud': page(
        '<head><link rel="component" href="./a.fud"><link rel="component" href="./b.fud"></head><body></body>',
      ),
      '/a.fud': comp('comp-a', '<link rel="component" href="./b.fud">'),
      '/b.fud': comp('comp-b', ''),
    });
    const graph = resolveComponents('/home.fud', io);

    expect(graph.entryDeps).toEqual(['./a.fud', './b.fud']);
    expect([...graph.components.keys()].sort()).toEqual(['comp-a', 'comp-b']);
    expect(graph.components.get('comp-a')!.deps).toEqual(['./b.fud']);
    expect(graph.components.get('comp-b')!.deps).toEqual([]);
  });

  it('resolves a shared dependency exactly once (reached via two paths)', () => {
    // b is linked directly by home AND by a. It must land as a single entry, no loop.
    let bReads = 0;
    const files: Record<string, string> = {
      '/home.fud': page(
        '<head><link rel="component" href="./a.fud"><link rel="component" href="./b.fud"></head><body></body>',
      ),
      '/a.fud': comp('comp-a', '<link rel="component" href="./b.fud">'),
      '/b.fud': comp('comp-b', ''),
    };
    const io = {
      read: (p: string) => {
        if (p === '/b.fud') bReads++;
        return files[p]!;
      },
      resolve: memoryIo(files).resolve,
    };
    const graph = resolveComponents('/home.fud', io);
    expect(graph.components.size).toBe(2);
    // b is READ each time it is reached, but ADDED to the graph only once.
    expect(bReads).toBeGreaterThanOrEqual(1);
    expect(graph.components.get('comp-b')).toBeDefined();
  });

  it('ignores a linked file that is not a component document', () => {
    const io = memoryIo({
      '/home.fud': page('<head><link rel="component" href="./page2.fud"></head><body></body>'),
      '/page2.fud': page('<head></head><body><p>not a component</p></body>'),
    });
    const graph = resolveComponents('/home.fud', io);
    expect(graph.entryDeps).toEqual(['./page2.fud']);
    expect(graph.components.size).toBe(0);
  });

  it('accepts a component as the entry', () => {
    const io = memoryIo({
      '/a.fud': comp('comp-a', '<link rel="component" href="./b.fud">'),
      '/b.fud': comp('comp-b', ''),
    });
    const graph = resolveComponents('/a.fud', io);
    expect(graph.entry.type).toBe('component-document');
    expect(graph.entryDeps).toEqual(['./b.fud']);
    expect([...graph.components.keys()]).toEqual(['comp-b']);
  });

  it('resolves the real home.fud fixture graph from disk', () => {
    const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
    expect([...graph.components.keys()].sort()).toEqual(['app-badge', 'app-button', 'app-card']);
    expect(graph.components.get('app-card')!.deps).toEqual(['./app-button.fud']);
  });
});
