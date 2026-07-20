/**
 * SDD-03 acceptance criteria (§6) for the tokenizer and its mode stack.
 */

import { describe, expect, it } from 'vitest';
import { Lexer, tokenize, type Token, type TokenType } from '../../src/lexer/index.js';
import { span } from '../../src/types/index.js';

/** Token types in order, for shape assertions. */
function types(source: string): TokenType[] {
  return tokenize(source).value.map((t) => t.type);
}

/** All tokens, eof excluded. */
function toks(source: string): readonly Token[] {
  return tokenize(source).value;
}

function text(source: string, t: Token): string {
  return source.slice(t.span.start, t.span.end);
}

function codes(source: string): string[] {
  return tokenize(source).diagnostics.map((d) => d.code);
}

describe('coverage invariant (§4.1)', () => {
  const sources = [
    '<slot></slot>',
    '<h2>@title</h2>',
    '<a b="c">t</a>',
    '<script>const x=@y;</script>',
    '<title>@data.title</title>',
    '<style>:host{}</style>',
    '<!-- x --><!DOCTYPE html>',
    'user@dominio.com @@ @* c *@ @(a) @{b}',
    '<app-card title="@item.title" variant="@(f ? 1 : 2)"/>',
  ];

  it.each(sources)('tokens tile the source with no gaps or overlaps: %s', (source) => {
    let at = 0;
    for (const token of toks(source)) {
      expect(token.span.start).toBe(at);
      at = token.span.end;
    }
    expect(at).toBe(source.length);
  });
});

describe('tags (§6.2)', () => {
  it('tokenizes a simple element', () => {
    const source = '<slot></slot>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual(['tag-open-start', 'tag-open-end', 'tag-close']);
    expect(tokens[0]).toMatchObject({ name: 'slot', span: span(0, 5) });
    expect(tokens[1]?.span).toEqual(span(5, 6));
    expect(tokens[2]).toMatchObject({ name: 'slot', span: span(6, 13) });
  });

  it('tokenizes a self-closing tag (decision 40)', () => {
    expect(types('<br/>')).toEqual(['tag-open-start', 'tag-self-close']);
  });

  it('emits whitespace between attributes', () => {
    expect(types('<a b c>')).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'whitespace',
      'attr-name',
      'tag-open-end',
    ]);
  });

  it('runs an unterminated close tag to the end of source', () => {
    const source = '</div';
    expect(types(source)).toEqual(['tag-close']);
    expect(toks(source)[0]).toMatchObject({ name: 'div', span: span(0, 5) });
  });

  it('ends an attribute name at a self-closing slash', () => {
    expect(types('<a foo/>')).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'tag-self-close',
    ]);
  });

  it('ends an unquoted value at a self-closing slash', () => {
    const source = '<a b=c/>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'text',
      'tag-self-close',
    ]);
    expect(text(source, tokens[4]!)).toBe('c');
  });

  it('degrades a malformed tag to text with FUD0013', () => {
    expect(codes('a < b')).toEqual(['FUD0013']);
    expect(types('a < b')).toEqual(['text', 'text', 'text']);
  });
});

describe('text and the at-trigger (§6.3)', () => {
  it('emits at-trigger spanning only the @', () => {
    const source = '<h2>@title</h2>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'tag-open-end',
      'at-trigger',
      'text',
      'tag-close',
    ]);
    // The tokenizer does NOT consume `title`: that is SDD-04's job.
    expect(tokens[2]?.span).toEqual(span(4, 5));
    expect(text(source, tokens[3]!)).toBe('title');
  });
});

describe('explicit expressions and opaque JS (§6.4)', () => {
  it('tokenizes a binding value as an opaque explicit-expr', () => {
    const source = `class:highlight="@(variant === 'highlight')"`;
    const tokens = toks(`<a ${source}>`);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'attr-quote-open',
      'explicit-expr',
      'attr-quote-close',
      'tag-open-end',
    ]);
    expect(tokens[2]).toMatchObject({ name: 'class:highlight' });
    const expr = tokens[5]!;
    expect(expr.type).toBe('explicit-expr');
    if (expr.type !== 'explicit-expr') throw new Error('unreachable');
    expect(`<a ${source}>`.slice(expr.group.inner.start, expr.group.inner.end)).toBe(
      "variant === 'highlight'",
    );
    expect(expr.group.closed).toBe(true);
  });

  it('tokenizes @{ ... } as inline-code', () => {
    const tokens = toks('@{ const a = 1; }');
    expect(tokens.map((t) => t.type)).toEqual(['inline-code']);
    const code = tokens[0]!;
    if (code.type !== 'inline-code') throw new Error('unreachable');
    expect(code.group.closed).toBe(true);
  });
});

describe('@ in attribute-name position (§6.5)', () => {
  it('keeps a leading @ inside the attribute name (decision 29)', () => {
    const tokens = toks('<a @click="@onClick">');
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'attr-quote-open',
      'at-trigger',
      'text',
      'attr-quote-close',
      'tag-open-end',
    ]);
    expect(tokens[2]).toMatchObject({ name: '@click' });
  });
});

describe('bus: subscriber (§6.5.b, decision 28.a/b)', () => {
  it('treats the literal form as a plain reserved-prefix name', () => {
    const tokens = toks('<a bus:carrito="@onCarrito(ev)">');
    expect(tokens[2]).toMatchObject({ type: 'attr-name', name: 'bus:carrito' });
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'attr-quote-open',
      'at-trigger',
      'text',
      'attr-quote-close',
      'tag-open-end',
    ]);
  });

  it('surfaces balancer diagnostics from a bus: expression name', () => {
    const result = tokenize('<a bus:(a + b>');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0002']);
  });

  it('fires the balancer on a ( right after the bus: prefix', () => {
    const source = '<a bus:(EVENTOS.carrito)="@h">';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'explicit-expr',
      'attr-eq',
      'attr-quote-open',
      'at-trigger',
      'text',
      'attr-quote-close',
      'tag-open-end',
    ]);
    expect(tokens[2]).toMatchObject({ name: 'bus:' });
    const expr = tokens[3]!;
    if (expr.type !== 'explicit-expr') throw new Error('unreachable');
    expect(source.slice(expr.group.inner.start, expr.group.inner.end)).toBe('EVENTOS.carrito');
  });
});

describe('email lookbehind (§6.6, decision 7)', () => {
  it('absorbs an @ that forms a word with what precedes it', () => {
    const source = 'user@dominio.com';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual(['text']);
    expect(text(source, tokens[0]!)).toBe(source);
  });

  it('still fires when the @ does not follow an identifier character', () => {
    expect(types(' @foo')).toEqual(['text', 'at-trigger', 'text']);
  });

  it('lets the @@ escape outrank the lookbehind (decision 1 over decision 7)', () => {
    // Normative consequence in the grammar doc: `a@@b` is the literal `a@b`,
    // never `a@` followed by an interpolation of `b`.
    const source = 'a@@b';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual(['text', 'at-escape', 'text']);
    expect(text(source, tokens[0]!)).toBe('a');
    expect(text(source, tokens[2]!)).toBe('b');
  });

  it('keeps the lookbehind when there is no escape pair', () => {
    expect(types('user@dominio.com')).toEqual(['text']);
  });
});

describe('escape and Razor comment (§6.7)', () => {
  it('tokenizes @@ as at-escape', () => {
    expect(types('@@')).toEqual(['at-escape']);
  });

  it('tokenizes a complete Razor comment', () => {
    const source = '@* hola *@';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual(['razor-comment']);
    expect(tokens[0]?.span).toEqual(span(0, source.length));
  });

  it('degrades an unterminated Razor comment with FUD0011', () => {
    const source = '@* sin cierre';
    expect(types(source)).toEqual(['razor-comment']);
    expect(codes(source)).toEqual(['FUD0011']);
    expect(toks(source)[0]?.span).toEqual(span(0, source.length));
  });

  it('reports FUD0010 for a character that starts no Razor construct', () => {
    expect(codes('@ ')).toEqual(['FUD0010']);
    expect(types('@ ')).toEqual(['text', 'text']);
  });
});

describe('doctype, comments and CDATA (§6.8)', () => {
  it('tokenizes a doctype (decision 57)', () => {
    expect(types('<!DOCTYPE html>')).toEqual(['doctype']);
  });

  it('tokenizes an HTML comment (decision 48)', () => {
    const source = '<!-- x -->';
    expect(types(source)).toEqual(['html-comment']);
    expect(toks(source)[0]?.span).toEqual(span(0, source.length));
  });

  it('degrades an unterminated HTML comment with FUD0012', () => {
    expect(codes('<!-- x')).toEqual(['FUD0012']);
    expect(types('<!-- x')).toEqual(['html-comment']);
  });

  it('degrades a bogus <! declaration with FUD0013', () => {
    expect(codes('<!x>')).toEqual(['FUD0013']);
  });

  it('runs an unterminated doctype to the end of source', () => {
    const source = '<!DOCTYPE html';
    expect(types(source)).toEqual(['doctype']);
    expect(toks(source)[0]?.span).toEqual(span(0, source.length));
  });

  it('tokenizes a CDATA section', () => {
    expect(types('<![CDATA[ x ]]>')).toEqual(['cdata']);
  });

  it('degrades an unterminated CDATA section with FUD0016', () => {
    expect(codes('<![CDATA[ x')).toEqual(['FUD0016']);
  });
});

describe('<script> is opaque (§6.9, decision 43)', () => {
  it('emits one raw-text and fires no Razor inside', () => {
    const source = '<script>const x=@y;</script>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'tag-open-end',
      'raw-text',
      'tag-close',
    ]);
    const raw = tokens[2]!;
    if (raw.type !== 'raw-text') throw new Error('unreachable');
    expect(raw.element).toBe('script');
    expect(text(source, raw)).toBe('const x=@y;');
  });

  it('pushes and pops the raw mode around the body', () => {
    const lexer = new Lexer('<script>a</script>');
    expect(lexer.mode).toBe('html');
    lexer.next(); // tag-open-start
    lexer.next(); // tag-open-end -> push raw
    expect(lexer.mode).toBe('raw');
    lexer.next(); // raw-text
    expect(lexer.mode).toBe('raw');
    lexer.next(); // tag-close -> pop
    expect(lexer.mode).toBe('html');
  });

  it('handles an empty script body', () => {
    expect(types('<script></script>')).toEqual([
      'tag-open-start',
      'tag-open-end',
      'tag-close',
    ]);
  });

  it('closes on a close tag with trailing whitespace', () => {
    expect(types('<script>a</script >')).toEqual([
      'tag-open-start',
      'tag-open-end',
      'raw-text',
      'tag-close',
    ]);
  });

  it('reports FUD0014 for an unterminated raw element', () => {
    expect(codes('<script>a')).toEqual(['FUD0014']);
  });
});

describe('<title> keeps Razor live (§6.10, §4.6)', () => {
  it('tokenizes text plus @ atoms, no raw-text', () => {
    const source = '<title>@data.title</title>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'tag-open-end',
      'at-trigger',
      'text',
      'tag-close',
    ]);
    expect(text(source, tokens[3]!)).toBe('data.title');
  });

  it('applies the email lookbehind inside RCDATA', () => {
    const source = '<title>a@b.com</title>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'tag-open-end',
      'text',
      'tag-close',
    ]);
    expect(text(source, tokens[2]!)).toBe('a@b.com');
  });

  it('cuts an RCDATA text run at a significant @', () => {
    const source = '<title>Hola @name</title>';
    expect(types(source)).toEqual([
      'tag-open-start',
      'tag-open-end',
      'text',
      'at-trigger',
      'text',
      'tag-close',
    ]);
  });

  it('reports FUD0014 for an unterminated RCDATA element', () => {
    expect(codes('<title>abc')).toEqual(['FUD0014']);
    expect(types('<title>abc')).toEqual(['tag-open-start', 'tag-open-end', 'text']);
  });

  it('does not open nested tags inside a textarea', () => {
    const source = '<textarea><b>x</textarea>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'tag-open-end',
      'text',
      'tag-close',
    ]);
    expect(text(source, tokens[2]!)).toBe('<b>x');
  });
});

describe('<style> pushes css (§6.11, §4.7 placeholder)', () => {
  it('pushes css, treats the body as opaque, and pops', () => {
    const source = '<style>:host{}</style>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'tag-open-end',
      'raw-text',
      'tag-close',
    ]);
    const raw = tokens[2]!;
    if (raw.type !== 'raw-text') throw new Error('unreachable');
    expect(raw.element).toBe('style');
    expect(text(source, raw)).toBe(':host{}');
  });

  it('reports the css mode while inside the body', () => {
    const lexer = new Lexer('<style>a</style>');
    lexer.next();
    lexer.next();
    expect(lexer.mode).toBe('css');
  });
});

describe('svg / math modes (§4.8)', () => {
  it('pushes svg on the root element and pops on its close', () => {
    const lexer = new Lexer('<svg><rect/></svg>');
    lexer.next();
    lexer.next();
    expect(lexer.mode).toBe('svg');
    lexer.next(); // <rect
    lexer.next(); // />
    expect(lexer.mode).toBe('svg');
    lexer.next(); // </svg>
    expect(lexer.mode).toBe('html');
  });

  it('does not push again for a nested svg', () => {
    const lexer = new Lexer('<svg><svg></svg></svg>');
    lexer.next();
    lexer.next();
    lexer.next();
    lexer.next();
    expect(lexer.mode).toBe('svg');
    lexer.next(); // inner close: not the owner, no pop
    expect(lexer.mode).toBe('svg');
  });
});

describe('balancer diagnostics surface through next() (§6.12)', () => {
  it('degrades an unterminated explicit expression with FUD0002', () => {
    const source = '@(a + b';
    const result = tokenize(source);
    expect(result.value.map((t) => t.type)).toEqual(['explicit-expr']);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0002']);
    const expr = result.value[0]!;
    if (expr.type !== 'explicit-expr') throw new Error('unreachable');
    expect(expr.group.closed).toBe(false);
  });
});

describe('block boundaries (§4.3)', () => {
  it('cuts the text run at a raw } and emits block-end (decision 79)', () => {
    const source = 'a } b';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual(['text', 'block-end', 'text']);
    expect(tokens[1]?.span).toEqual(span(2, 3));
  });

  it('does not emit switch-label outside a switch body', () => {
    expect(types('case 1:')).toEqual(['text']);
  });

  it('emits switch-label at token start under a switch body', () => {
    const lexer = new Lexer('case 1:');
    lexer.pushSwitchBody();
    expect(lexer.next().value.type).toBe('switch-label');
  });

  it('cuts a text run before a case keyword under a switch body', () => {
    const lexer = new Lexer('  case 2:');
    lexer.pushSwitchBody();
    expect(lexer.next().value.type).toBe('text');
    expect(lexer.next().value.type).toBe('switch-label');
  });

  it('does not cut on the word case in prose', () => {
    const lexer = new Lexer('in any casement');
    lexer.pushSwitchBody();
    expect(lexer.next().value.type).toBe('text');
    expect(lexer.atEnd).toBe(true);
  });

  it('stops cutting once the switch body is popped', () => {
    const lexer = new Lexer('case');
    lexer.pushSwitchBody();
    lexer.popSwitchBody();
    expect(lexer.next().value.type).toBe('text');
  });

  it('ignores popping a switch body that was never opened', () => {
    const lexer = new Lexer('case');
    lexer.popSwitchBody();
    expect(lexer.switchDepth).toBe(0);
  });
});

describe('cursor mechanics (§3.2, §5)', () => {
  it('peek does not consume and reports a stable offset', () => {
    const lexer = new Lexer('<slot>');
    expect(lexer.offset).toBe(0);
    const peeked = lexer.peek();
    expect(lexer.offset).toBe(0);
    expect(lexer.peek()).toEqual(peeked);
    expect(lexer.next().value).toEqual(peeked);
    expect(lexer.offset).toBe(5);
  });

  it('does not apply a peeked token mode transition until it is consumed', () => {
    const lexer = new Lexer('<script>a</script>');
    lexer.next(); // tag-open-start
    lexer.peek(); // tag-open-end, buffered but not consumed
    expect(lexer.mode).toBe('html');
    lexer.next();
    expect(lexer.mode).toBe('raw');
  });

  it('rewinds the lookahead when the caller changes the mode', () => {
    const lexer = new Lexer('<a>');
    lexer.peek();
    lexer.pushMode('js');
    expect(lexer.offset).toBe(0);
    expect(lexer.mode).toBe('js');
  });

  it('surfaces FUD0001 when popping the background mode', () => {
    const lexer = new Lexer('a');
    expect(lexer.popMode(0).diagnostics.map((d) => d.code)).toEqual(['FUD0001']);
  });

  it('seekTo moves forward and clears the lookahead', () => {
    const lexer = new Lexer('<a><b>');
    lexer.peek();
    lexer.seekTo(3);
    expect(lexer.offset).toBe(3);
    expect(lexer.peek()).toMatchObject({ type: 'tag-open-start', name: 'b' });
  });

  it('seekTo never moves backwards', () => {
    const lexer = new Lexer('<a><b>');
    lexer.next();
    lexer.next();
    expect(lexer.offset).toBe(3);
    lexer.seekTo(0);
    expect(lexer.offset).toBe(3);
  });

  it('seekTo clamps past the end of source', () => {
    const lexer = new Lexer('<a>');
    lexer.seekTo(999);
    expect(lexer.offset).toBe(3);
    expect(lexer.atEnd).toBe(true);
  });
});

describe('EOF is idempotent (§6.13)', () => {
  it('keeps returning eof once the source is consumed', () => {
    const lexer = new Lexer('a');
    lexer.next();
    for (let i = 0; i < 3; i++) {
      expect(lexer.next().value.type).toBe('eof');
      expect(lexer.peek().type).toBe('eof');
    }
    expect(lexer.atEnd).toBe(true);
  });

  it('returns eof for empty source', () => {
    expect(new Lexer('').next().value.type).toBe('eof');
  });
});

describe('attribute values', () => {
  it('reports FUD0015 for an unterminated attribute value', () => {
    expect(codes('<a b="c')).toEqual(['FUD0015']);
  });

  it('accepts single-quoted values', () => {
    expect(types("<a b='c'>")).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'attr-quote-open',
      'text',
      'attr-quote-close',
      'tag-open-end',
    ]);
  });

  it('applies the email lookbehind inside a value too', () => {
    const source = '<a b="write user@dominio.com now">';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'attr-quote-open',
      'text',
      'attr-quote-close',
      'tag-open-end',
    ]);
    expect(text(source, tokens[5]!)).toBe('write user@dominio.com now');
  });

  it('cuts a value text run at a significant @', () => {
    expect(types('<a b="x @foo">')).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'attr-quote-open',
      'text',
      'at-trigger',
      'text',
      'attr-quote-close',
      'tag-open-end',
    ]);
  });

  it('emits an unquoted value as text, leaving FUD0056 to SDD-05', () => {
    const source = '<a b=c>';
    const tokens = toks(source);
    expect(tokens.map((t) => t.type)).toEqual([
      'tag-open-start',
      'whitespace',
      'attr-name',
      'attr-eq',
      'text',
      'tag-open-end',
    ]);
    expect(text(source, tokens[4]!)).toBe('c');
  });
});

describe('the js mode placeholder (§4.7 parallel)', () => {
  it('emits the remainder as one opaque text token', () => {
    const lexer = new Lexer('const a = 1;', 'js');
    const token = lexer.next().value;
    expect(token.type).toBe('text');
    expect(token.span).toEqual(span(0, 12));
  });
});
