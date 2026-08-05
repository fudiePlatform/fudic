/**
 * SDD-28 §3.3 — where a new `<link rel="component">` goes, by role.
 *
 * Parsed with the real pipeline, because the anchor is read off the structured document: an
 * offset taken from a hand-built node would prove nothing about the rule it implements.
 *
 * Asserted over the INSERTED text rather than over the offset. An offset is unreadable in a
 * failure, and it is not the contract either — what both callers do with the anchor is put a
 * line in a file, so that is what these tests look at.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import {
  alreadyLinked,
  componentLinkAnchor,
  componentLinkTag,
  structureDocument,
  type StructuredDocument,
} from '../../src/document/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

function structure(source: string): StructuredDocument {
  const parsed = parseDocument(source, { atConstructs: constructs });
  return structureDocument(source, parsed.value).value;
}

/** The source with the link inserted at its anchor — the same splice both callers do. */
function insert(source: string, href = './x.fud'): string {
  const { offset, indent } = componentLinkAnchor(source, structure(source));
  const tag = componentLinkTag(href);
  if (offset === 0) return `${tag}\n${source}`;
  return `${source.slice(0, offset)}\n${indent}${tag}${source.slice(offset)}`;
}

/** The lines around the one that was added, so a failure shows the neighbourhood. */
function around(text: string): readonly [string, string, string] {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.includes('href="./x.fud"'));
  return [lines[at - 1] ?? '<start of file>', lines[at] as string, lines[at + 1] ?? '<end of file>'];
}

const COMPONENT = `<app-card>
  <template shadowrootmode="open">
  </template>
</app-card>
`;

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Home</title>
</head>

<h1>Home</h1>
`;

const PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Standalone</title>
  </head>
  <body></body>
</html>
`;

const LAYOUT = `<!DOCTYPE html>
<html lang="en">
  <head>
    @RenderHead()
  </head>
  <body>
    <main>@RenderBody()</main>
  </body>
</html>
`;

const LINK = '<link rel="component" href="./x.fud">';

describe('componentLinkTag', () => {
  it('writes the link the CLI and the editor both insert', () => {
    expect(componentLinkTag('../components/app-icon.fud')).toBe(
      '<link rel="component" href="../components/app-icon.fud">',
    );
  });
});

describe('componentLinkAnchor — no link yet', () => {
  it('a component takes offset 0, before everything (decision 53)', () => {
    expect(componentLinkAnchor(COMPONENT, structure(COMPONENT))).toEqual({ offset: 0, indent: '' });
    expect(insert(COMPONENT).startsWith(`${LINK}\n<app-card>`)).toBe(true);
  });

  it('a route takes it after the rel="layout" (decision 83)', () => {
    expect(around(insert(ROUTE))).toEqual([
      '<link rel="layout" href="../layouts/_layout.fud">',
      LINK,
      '',
    ]);
  });

  it('a page takes it inside <head>, indented one level in (decision 59)', () => {
    expect(around(insert(PAGE))).toEqual(['  <head>', `    ${LINK}`, '    <title>Standalone</title>']);
  });

  it('a layout takes it inside <head> too', () => {
    expect(around(insert(LAYOUT))).toEqual(['  <head>', `    ${LINK}`, '    @RenderHead()']);
  });
});

describe('alreadyLinked', () => {
  const linked = (href: string, written = './app-badge.fud'): boolean => {
    const source = `<link rel="component" href="${written}">\n${COMPONENT}`;
    return alreadyLinked(structure(source), href);
  };

  it('is true for the same href', () => {
    expect(linked('./app-badge.fud')).toBe(true);
  });

  it.each([
    ['a missing ./', 'app-badge.fud'],
    ['a backslash separator', '.\\app-badge.fud'],
  ])('is true through %s', (_label, href) => {
    expect(linked(href)).toBe(true);
  });

  it('is false for another file', () => {
    expect(linked('./site-nav.fud')).toBe(false);
  });

  it('is false against an interpolated href: it is not a path anyone can compare', () => {
    expect(linked('./app-badge.fud', './@(name).fud')).toBe(false);
  });

  it('is false when the link has no href at all', () => {
    const source = `<link rel="component">\n${COMPONENT}`;

    expect(alreadyLinked(structure(source), './app-badge.fud')).toBe(false);
  });

  it('is false in a document with no links', () => {
    expect(alreadyLinked(structure(COMPONENT), './app-badge.fud')).toBe(false);
  });
});

describe('componentLinkAnchor — with links already there', () => {
  it('goes after the LAST one, whatever the role', () => {
    const source = `<link rel="component" href="./a.fud">
<link rel="component" href="./b.fud">
${COMPONENT}`;
    expect(around(insert(source))).toEqual([
      '<link rel="component" href="./b.fud">',
      LINK,
      '<app-card>',
    ]);
  });

  it('inherits the indentation of the link it follows, not that of <head>', () => {
    const source = PAGE.replace('    <title>Standalone</title>', '\t\t<link rel="component" href="./a.fud">');
    expect(around(insert(source))).toEqual([
      '\t\t<link rel="component" href="./a.fud">',
      `\t\t${LINK}`,
      '  </head>',
    ]);
  });

  it('reads the indentation from the start of the line, not from the previous newline', () => {
    const source = `<h1>x</h1> <link rel="component" href="./a.fud">\n${COMPONENT}`;
    expect(componentLinkAnchor(source, structure(source)).indent).toBe('');
  });

  it('takes a link on the very first line, with no newline before it', () => {
    const source = `  <link rel="component" href="./a.fud">\n${COMPONENT}`;
    expect(componentLinkAnchor(source, structure(source)).indent).toBe('  ');
  });
});
