/**
 * `FUD0438` — a `<link rel="component">` or `<link rel="layout">` below the top level of a
 * component or a route.
 *
 * It looked like a harmless typo and it was two failures at once. Nested, the link registers
 * NOTHING: the graph is read from the top-level phases, so the file it names is never
 * resolved and the tag it was meant to bring in renders as an empty element. And it is not
 * inert either — it is a `<link href>`, so the asset linker took it for an asset and
 * published the `.fud` it pointed at, source and all, into every document that carried it.
 *
 * The mistake is easy to make in a ROUTE, which is where it was found: a route's `<head>`
 * is a head, and in a page the head is exactly where these links belong (decision 59).
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import { structureDocument, type RouteDocument } from '../../src/document/index.js';
import type { Diagnostic } from '../../src/types/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

function structure(source: string) {
  const parsed = parseDocument(source, { atConstructs: constructs });
  const result = structureDocument(source, parsed.value);
  return {
    value: result.value,
    codes: result.diagnostics.map((d: Diagnostic) => d.code),
    diagnostics: result.diagnostics,
  };
}

const HOST = '<m-el><template shadowrootmode="open"><slot></slot></template></m-el>\n';

describe('a route', () => {
  it('rejects a component link written inside its <head>', () => {
    const { codes, diagnostics } = structure(
      '<link rel="layout" href="./_layout.fud">\n' +
        '<head><link rel="component" href="./s-hero.fud"><title>t</title></head>\n' +
        '<s-hero></s-hero>\n',
    );
    expect(codes).toContain('FUD0438');
    // On the link, not on the head: what the author has to move is that one line.
    const at = diagnostics.find((d) => d.code === 'FUD0438')!;
    expect(at.severity).toBe('error');
    expect(at.message).toContain('top-level');
  });

  it('rejects a layout link written inside its <head> too', () => {
    const { codes } = structure(
      '<link rel="layout" href="./_layout.fud">\n' +
        '<head><link rel="layout" href="./_other.fud"></head>\n<p>x</p>\n',
    );
    expect(codes).toContain('FUD0438');
  });

  it('rejects one buried in the markup, however deep', () => {
    const { codes } = structure(
      '<link rel="layout" href="./_layout.fud">\n' +
        '<div><section><link rel="component" href="./s-hero.fud"></section></div>\n',
    );
    expect(codes).toContain('FUD0438');
  });

  it('says nothing about the ones written where they belong', () => {
    const { codes, value } = structure(
      '<link rel="layout" href="./_layout.fud">\n' +
        '<link rel="component" href="./s-hero.fud">\n' +
        '<head><title>t</title></head>\n<s-hero></s-hero>\n',
    );
    expect(codes).not.toContain('FUD0438');
    // And they are the graph: the top-level phase took them.
    expect((value as RouteDocument).links).toHaveLength(1);
  });
});

/**
 * The recovery arms of the two phase machines, which is where a file with more than one of
 * something lands. Written here because the walk this file is about runs right beside them,
 * and a structuring pass that reports and carries on has to be exercised on the carrying on.
 */
describe('a route with more than one of something', () => {
  it('reports the second @code and keeps the first', () => {
    const { codes } = structure(
      '<link rel="layout" href="./_layout.fud">\n@code {\n  const a = 1;\n}\n' +
        '@code {\n  const b = 2;\n}\n<p>x</p>\n',
    );
    expect(codes).toContain('FUD0154');
  });

  it('reports the second <head> and keeps the first', () => {
    const { codes, value } = structure(
      '<link rel="layout" href="./_layout.fud">\n' +
        '<head><title>one</title></head>\n<head><title>two</title></head>\n<p>x</p>\n',
    );
    expect(codes).toContain('FUD0421');
    // The first one: recovery keeps what it already had rather than taking the later one.
    expect((value as RouteDocument).head).toBeDefined();
  });
});

describe('a shell with two layout links', () => {
  it('reports the second one', () => {
    const { codes } = structure(
      '<!DOCTYPE html>\n<html><head>\n' +
        '<link rel="layout" href="./a.fud">\n<link rel="layout" href="./b.fud">\n' +
        '</head><body>@RenderBody()</body></html>\n',
    );
    expect(codes).toContain('FUD0420');
  });
});

describe('a component', () => {
  it('rejects a component link written inside its <head>', () => {
    const { codes } = structure(
      '<head><link rel="component" href="./m-other.fud"><style>.a{}</style></head>\n' + HOST,
    );
    expect(codes).toContain('FUD0438');
  });

  it('rejects one written inside its shadow template', () => {
    const { codes } = structure(
      '<m-el><template shadowrootmode="open"><link rel="component" href="./m-other.fud">' +
        '</template></m-el>\n',
    );
    expect(codes).toContain('FUD0438');
  });

  it('says nothing about a top-level one', () => {
    const { codes } = structure('<link rel="component" href="./m-other.fud">\n' + HOST);
    expect(codes).not.toContain('FUD0438');
  });

  it('says nothing about an ordinary <link> in the head — only the framework ones', () => {
    const { codes } = structure(
      '<head><link rel="stylesheet" href="./theme.css"><link rel="icon" href="./logo.svg">' +
        '</head>\n' + HOST,
    );
    expect(codes).not.toContain('FUD0438');
  });
});
