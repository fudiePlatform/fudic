/**
 * SDD-10 — document structure. Covers every acceptance criterion of §6: both state
 * machines (component / page), the DSD host identity, and every degradation.
 *
 * Inputs are parsed with the real SDD-05 parser wired to the real SDD-08 `@code` parser
 * and a balancer stand-in for the SDD-06 control bodies, so the `StructuredDocument` is
 * built from an authentic `HtmlDocument`, not a hand-forged one.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  type AtConstructParser,
  type HtmlDocument,
} from '../../src/html/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { scanBraces, scanParens } from '../../src/balancer/index.js';
import { ok, span, type Diagnostic } from '../../src/types/index.js';
import {
  structureDocument,
  isComponentLink,
  type ComponentDocument,
  type PageDocument,
} from '../../src/document/index.js';

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/u.test(text[i] ?? '')) i++;
  return i;
}

/** Real SDD-08 for `@code`; a balancer stand-in for the SDD-06 control bodies. */
const constructs: AtConstructParser = {
  parseControl(ctx, keyword, keywordSpan) {
    let at = skipWhitespace(ctx.source, keywordSpan.end);
    if (ctx.source[at] === '(') {
      at = scanParens(ctx.source, at).value.span.end;
      at = skipWhitespace(ctx.source, at);
    }
    const end = ctx.source[at] === '{' ? scanBraces(ctx.source, at).value.span.end : at;
    ctx.lexer.seekTo(end);
    return ok({ type: keyword, span: span(keywordSpan.start, end) });
  },
  parseCodeBlock,
};

function parse(source: string): HtmlDocument {
  return parseDocument(source, { atConstructs: constructs }).value;
}

function codes(diagnostics: readonly Diagnostic[]): readonly string[] {
  return diagnostics.map((d) => d.code);
}

function structure(source: string) {
  const result = structureDocument(source, parse(source));
  return { value: result.value, diagnostics: result.diagnostics, codes: codes(result.diagnostics) };
}

function loadFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), 'utf8');
}

describe('isComponentLink', () => {
  it('recognizes a static rel="component" link', () => {
    const doc = parse('<link rel="component" href="./x.fud"><app-x><template shadowrootmode="open"></template></app-x>');
    const link = doc.children.find((c) => c.type === 'element');
    expect(link && isComponentLink(link)).toBe(true);
  });

  it('rejects a non-link, a plain link, and a dynamic rel', () => {
    const doc = parse('<meta rel="component"><link rel="stylesheet"><link rel="@x"><app-x><template shadowrootmode="open"></template></app-x>');
    const [meta, plain, dynamic] = doc.children.filter((c) => c.type === 'element');
    expect(isComponentLink(meta!)).toBe(false);
    expect(isComponentLink(plain!)).toBe(false);
    expect(isComponentLink(dynamic!)).toBe(false);
  });
});

describe('structureDocument — component mode (§6.2, §6.3)', () => {
  it('structures the app-card fixture into named fields (§6.2)', () => {
    const source = loadFixture('app-card.fud');
    const { value, diagnostics } = structure(source);

    expect(diagnostics).toEqual([]);
    expect(value.type).toBe('component-document');
    const doc = value as ComponentDocument;
    expect(doc.links).toHaveLength(1);
    expect(doc.links[0]!.name).toBe('link');
    expect(doc.code?.type).toBe('code');
    expect(doc.head?.name).toBe('head');
    expect(doc.host?.name).toBe('app-card');
    expect(doc.template?.name).toBe('template');
    expect(doc.name).toBe('app-card');
  });

  it('structures the other component fixtures with no diagnostics', () => {
    for (const name of ['app-button.fud', 'app-badge.fud']) {
      const source = loadFixture(name);
      const { value, diagnostics } = structure(source);
      expect(diagnostics, name).toEqual([]);
      expect((value as ComponentDocument).name, name).toBe(name.replace('.fud', ''));
    }
  });

  it('accepts multiple consecutive component links (§6.3, decision 55)', () => {
    const source =
      '<link rel="component" href="./a.fud"><link rel="component" href="./b.fud"><app-x><template shadowrootmode="open"></template></app-x>';
    const { value, diagnostics } = structure(source);
    expect(diagnostics).toEqual([]);
    expect((value as ComponentDocument).links).toHaveLength(2);
  });
});

describe('structureDocument — component ordering (§6.4, §6.5, §6.10)', () => {
  it('reports FUD0155 for an out-of-order link, keeping it in links (§6.4)', () => {
    const source =
      '<app-x><template shadowrootmode="open"></template></app-x><link rel="component" href="./a.fud">';
    const { value, codes: c } = structure(source);
    expect(c).toContain('FUD0155');
    expect((value as ComponentDocument).links).toHaveLength(1);
  });

  it('reports FUD0154 for a second @code (§6.5, decision 54)', () => {
    const source =
      '@code { const a = 1; } @code { const b = 2; } <app-x><template shadowrootmode="open"></template></app-x>';
    const { value, codes: c } = structure(source);
    expect(c).toContain('FUD0154');
    // The first @code is kept; the duplicate is dropped.
    expect((value as ComponentDocument).code?.type).toBe('code');
  });

  it('reports FUD0155 for a second <head> fragment', () => {
    const source =
      '<head><style>a{}</style></head><head><style>b{}</style></head><app-x><template shadowrootmode="open"></template></app-x>';
    const { value, codes: c } = structure(source);
    expect(c).toContain('FUD0155');
    // The first <head> is kept.
    expect((value as ComponentDocument).head).toBeDefined();
  });

  it('treats whitespace and comments between pieces as transparent (§6.10, decision 56)', () => {
    const source =
      '<link rel="component" href="./a.fud">\n  <!-- a comment -->\n  @code { const a = 1; }\n  <app-x><template shadowrootmode="open"></template></app-x>';
    const { value, diagnostics } = structure(source);
    expect(diagnostics).toEqual([]);
    const doc = value as ComponentDocument;
    expect(doc.links).toHaveLength(1);
    expect(doc.code?.type).toBe('code');
  });
});

describe('structureDocument — host wrapper (§6.11, decision 75)', () => {
  it('reports FUD0156 when the markup is not a custom-element wrapper', () => {
    const { value, codes: c } = structure('<article>hi</article>');
    expect(c).toContain('FUD0156');
    const doc = value as ComponentDocument;
    expect(doc.host).toBeUndefined();
    expect(doc.name).toBe('');
  });

  it('reports FUD0156 for a tag without a hyphen', () => {
    const { codes: c } = structure('<appcard><template shadowrootmode="open"></template></appcard>');
    expect(c).toContain('FUD0156');
  });

  it('reports FUD0156 for two root custom elements, keeping the first as host', () => {
    const source =
      '<app-x><template shadowrootmode="open"></template></app-x><app-y><template shadowrootmode="open"></template></app-y>';
    const { value, codes: c } = structure(source);
    expect(c).toContain('FUD0156');
    expect((value as ComponentDocument).host?.name).toBe('app-x');
  });

  it('reports FUD0156 when the host is absent entirely', () => {
    const { value, codes: c } = structure('<link rel="component" href="./a.fud">');
    expect(c).toContain('FUD0156');
    expect((value as ComponentDocument).name).toBe('');
  });
});

describe('structureDocument — template DSD (§6.12, decision 75.a)', () => {
  it('reports FUD0157 when the wrapper child is not a <template>', () => {
    const { value, codes: c } = structure('<app-x><div>hi</div></app-x>');
    expect(c).toContain('FUD0157');
    expect((value as ComponentDocument).template).toBeUndefined();
  });

  it('reports FUD0158 when shadowrootmode is missing', () => {
    const { codes: c } = structure('<app-x><template></template></app-x>');
    expect(c).toContain('FUD0158');
  });

  it.each(['lazy', 'closed'])('reports FUD0158 for shadowrootmode="%s"', (mode) => {
    const { codes: c } = structure(`<app-x><template shadowrootmode="${mode}"></template></app-x>`);
    expect(c).toContain('FUD0158');
  });

  it('accepts shadowrootmode="open" with no diagnostics', () => {
    const { diagnostics } = structure('<app-x><template shadowrootmode="open"></template></app-x>');
    expect(diagnostics).toEqual([]);
  });
});

describe('structureDocument — head styles (§6.13, decision 76)', () => {
  it('accepts a single unmarked <style> and reads the name from the host', () => {
    const source =
      '<head><style>:host{display:block}</style></head><app-x><template shadowrootmode="open"></template></app-x>';
    const { value, diagnostics } = structure(source);
    expect(diagnostics).toEqual([]);
    expect((value as ComponentDocument).name).toBe('app-x');
  });

  it('reports FUD0159 on the second <style> in the head fragment', () => {
    const source =
      '<head><style>a{}</style><style>b{}</style></head><app-x><template shadowrootmode="open"></template></app-x>';
    const { value, diagnostics } = structure(source);
    expect(codes(diagnostics)).toContain('FUD0159');
    // The diagnostic points at the second <style>.
    const second = source.indexOf('<style>b');
    const dupe = diagnostics.find((d) => d.code === 'FUD0159');
    expect(dupe?.span.start).toBe(second);
    expect((value as ComponentDocument).head).toBeDefined();
  });

  it('reports FUD0160 for a source-written host attribute', () => {
    const source =
      '<head><style host="app-x">a{}</style></head><app-x><template shadowrootmode="open"></template></app-x>';
    const { codes: c } = structure(source);
    expect(c).toContain('FUD0160');
  });
});

describe('structureDocument — page mode (§6.6)', () => {
  it('structures the home fixture into named fields', () => {
    const source = loadFixture('home.fud');
    const { value, diagnostics } = structure(source);

    expect(diagnostics).toEqual([]);
    expect(value.type).toBe('page-document');
    const doc = value as PageDocument;
    expect(doc.doctype.type).toBe('doctype');
    expect(doc.html.name).toBe('html');
    expect(doc.head.name).toBe('head');
    expect(doc.body.name).toBe('body');
    expect(doc.links).toHaveLength(5);
    expect(doc.code?.type).toBe('code');
  });
});

describe('structureDocument — page validation (§6.7, §6.8, §6.9)', () => {
  it('reports FUD0150 for a doctype other than html (§6.7)', () => {
    const { codes: c } = structure('<!DOCTYPE HTML5><html><head></head><body></body></html>');
    expect(c).toContain('FUD0150');
  });

  it('accepts <!DOCTYPE html> in any case (§6.7)', () => {
    const { diagnostics } = structure('<!dOcTyPe HTML><html><head></head><body></body></html>');
    expect(diagnostics).toEqual([]);
  });

  it('reports FUD0151 for a page without <body> (§6.8)', () => {
    const { value, codes: c } = structure('<!DOCTYPE html><html><head></head></html>');
    expect(c).toContain('FUD0151');
    expect((value as PageDocument).body.name).toBe('body'); // degraded placeholder
  });

  it('reports FUD0151 for <body> before <head> (§6.8)', () => {
    const { codes: c } = structure('<!DOCTYPE html><html><body></body><head></head></html>');
    expect(c).toContain('FUD0151');
  });

  it('reports FUD0151 when <html> is missing', () => {
    const { codes: c } = structure('<!DOCTYPE html><head></head><body></body>');
    expect(c).toContain('FUD0151');
  });

  it('reports FUD0152 for a component link inside <body> (§6.9)', () => {
    const source =
      '<!DOCTYPE html><html><head></head><body><link rel="component" href="./a.fud"></body></html>';
    const { codes: c } = structure(source);
    expect(c).toContain('FUD0152');
  });

  it('reports FUD0153 for a @code inside <body> (§6.9)', () => {
    const source =
      '<!DOCTYPE html><html><head></head><body>@code { const a = 1; }</body></html>';
    const { codes: c } = structure(source);
    expect(c).toContain('FUD0153');
  });

  it('reports FUD0154 for two @code blocks in the head', () => {
    const source =
      '<!DOCTYPE html><html><head>@code { const a = 1; }@code { const b = 2; }</head><body></body></html>';
    const { codes: c } = structure(source);
    expect(c).toContain('FUD0154');
  });
});

describe('structureDocument — defensive doctype fallback', () => {
  it('synthesizes a doctype and reports FUD0150 for a page tree with none', () => {
    // Unreachable through the real parser (page mode is detected by a leading
    // `<!DOCTYPE`, decision 51); forged to exercise the non-optional-field fallback.
    const at = span(0, 0);
    const el = (name: string): ReturnType<typeof parse>['children'][number] => ({
      type: 'element',
      name,
      namespace: 'html',
      kind: 'normal',
      attributes: [],
      children: [],
      openSpan: at,
      span: at,
    });
    const doc = {
      type: 'document',
      mode: 'page',
      span: at,
      children: [{ type: 'element', name: 'html', namespace: 'html', kind: 'normal', attributes: [], children: [el('head'), el('body')], openSpan: at, span: at }],
    } as unknown as HtmlDocument;

    const result = structureDocument('', doc);
    expect(codes(result.diagnostics)).toContain('FUD0150');
    expect((result.value as PageDocument).doctype.type).toBe('doctype');
  });
});

describe('structureDocument — never throws (SDD-10 §5)', () => {
  it('degrades on truncated component and page input without throwing', () => {
    const sources = [
      '<link rel="component" href="./a.fud"><app-x><template shadowrootmode="open">',
      '<!DOCTYPE html><html><head><link rel="component"',
      loadFixture('app-card.fud'),
      loadFixture('home.fud'),
    ];
    for (const source of sources) {
      for (let cut = 0; cut <= source.length; cut++) {
        const sliced = source.slice(0, cut);
        expect(() => structureDocument(sliced, parse(sliced))).not.toThrow();
      }
    }
  });
});
