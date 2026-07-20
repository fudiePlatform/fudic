/**
 * SDD-04 acceptance criteria (§6) for the `@` transition rules.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyKeyword,
  expressionFromToken,
  resolutionEnd,
  resolveTrigger,
  scanImplicitExpression,
  type TriggerResolution,
} from '../../src/at/index.js';
import { tokenize, type JsRegionToken } from '../../src/lexer/index.js';
import { span } from '../../src/types/index.js';

/** The implicit expression `expr` text for a source that is a single trigger. */
function implicitExpr(source: string): string {
  const { value } = scanImplicitExpression(source, 0);
  return source.slice(value.expr.start, value.expr.end);
}

/** Resolve the trigger at offset 0 and return the resolution. */
function resolve(source: string): TriggerResolution {
  return resolveTrigger(source, 0).value;
}

/** Pull the single explicit-expr token out of a source. */
function exprToken(source: string): JsRegionToken {
  const token = tokenize(source).value.find(
    (t) => t.type === 'explicit-expr' || t.type === 'inline-code',
  );
  if (token === undefined) throw new Error('no JS region token');
  return token as JsRegionToken;
}

describe('classifyKeyword (§4.2)', () => {
  it('recognizes the closed control set', () => {
    for (const kw of ['if', 'else', 'for', 'foreach', 'while', 'switch']) {
      expect(classifyKeyword(kw)).toBe(kw);
    }
  });

  it('recognizes code', () => {
    expect(classifyKeyword('code')).toBe('code');
  });

  it('returns null for anything else, including JS keywords', () => {
    for (const id of ['raw', 'title', 'data', 'return', 'await', 'iffy', 'If']) {
      expect(classifyKeyword(id)).toBeNull();
    }
  });
});

describe('implicit expressions (§6.2, §6.3)', () => {
  it('resolves a bare identifier', () => {
    const { value } = scanImplicitExpression('@title', 0);
    expect(value.kind).toBe('implicit');
    expect(value.span).toEqual(span(0, 6));
    expect(value.expr).toEqual(span(1, 6));
    expect(value.type).toBe('razor-expression');
  });

  it('resolves a member chain', () => {
    expect(implicitExpr('@data.title')).toBe('data.title');
    expect(implicitExpr('@data.items.length')).toBe('data.items.length');
  });

  it('leaves regions empty (§6.5)', () => {
    expect(scanImplicitExpression('@data.items.length', 0).value.regions).toEqual([]);
  });

  it('accepts $ and _ in identifiers', () => {
    expect(implicitExpr('@_private.$value')).toBe('_private.$value');
  });

  it('never emits a diagnostic (§4.5.2)', () => {
    for (const source of ['@foo.', '@name!', '@count<10', '@a.b(c)', '@user?.name']) {
      expect(scanImplicitExpression(source, 0).diagnostics).toEqual([]);
    }
  });
});

describe('boundary stops (§6.4, §6.6, §6.7, §6.8, §6.9)', () => {
  it('stops before a trailing dot (decision 2)', () => {
    expect(implicitExpr('@foo.')).toBe('foo');
    expect(implicitExpr('@data.title.')).toBe('data.title');
  });

  it('stops before ?. so optional chaining needs the explicit form', () => {
    expect(implicitExpr('@user?.name')).toBe('user');
  });

  it('stops before a call (§6.6)', () => {
    expect(implicitExpr('@a.b(c)')).toBe('a.b');
  });

  it('stops before an index (§6.6)', () => {
    expect(implicitExpr('@items[0]')).toBe('items');
  });

  it('stops before ! (decision 4)', () => {
    expect(implicitExpr('@name!')).toBe('name');
  });

  it('stops before < so the HTML resumes (decision 5)', () => {
    expect(implicitExpr('@count<10')).toBe('count');
  });

  it('stops at whitespace and at operators', () => {
    expect(implicitExpr('@name and more')).toBe('name');
    expect(implicitExpr('@a+b')).toBe('a');
    expect(implicitExpr('@a,b')).toBe('a');
    expect(implicitExpr('@a;')).toBe('a');
  });

  it('stops at end of source', () => {
    expect(implicitExpr('@name')).toBe('name');
  });

  it('keeps the punctuation out of the span, so it stays literal text', () => {
    const source = 'Hola @name.';
    const { value } = scanImplicitExpression(source, 5);
    expect(value.span).toEqual(span(5, 10));
    expect(source.slice(value.span.end)).toBe('.');
  });
});

describe('explicit expressions (§6.10)', () => {
  it('wraps an explicit-expr token reusing its BalancedGroup', () => {
    const source = "@(variant === 'highlight')";
    const token = exprToken(source);
    const expression = expressionFromToken(token);
    expect(expression.kind).toBe('explicit');
    expect(expression.span).toEqual(span(0, source.length));
    expect(source.slice(expression.expr.start, expression.expr.end)).toBe(
      "variant === 'highlight'",
    );
    expect(expression.regions).toBe(token.group.regions);
  });

  it('carries the lexical regions of the group', () => {
    const source = "@('a' /* c */)";
    const expression = expressionFromToken(exprToken(source));
    expect(expression.regions.map((r) => r.kind)).toEqual(['string', 'block-comment']);
  });

  it('accepts the forms that an implicit expression refuses', () => {
    for (const source of ['@(user?.name)', '@(items.filter(p => p.active))', '@(items[0].title)']) {
      const expression = expressionFromToken(exprToken(source));
      expect(expression.kind).toBe('explicit');
      expect(expression.span).toEqual(span(0, source.length));
    }
  });
});

describe('control keywords (§6.11)', () => {
  it('classifies @if without parsing the header', () => {
    const source = '@if (data.items.length === 0)';
    const resolution = resolve(source);
    expect(resolution).toMatchObject({ kind: 'control', keyword: 'if' });
    if (resolution.kind !== 'control') throw new Error('unreachable');
    expect(resolution.keywordSpan).toEqual(span(1, 3));
    // The header is NOT consumed: that is SDD-06's job.
    expect(resolutionEnd(resolution)).toBe(3);
  });

  it('classifies @foreach', () => {
    expect(resolve('@foreach (const item of data.items)')).toMatchObject({
      kind: 'control',
      keyword: 'foreach',
    });
  });

  it('classifies every control keyword', () => {
    for (const kw of ['if', 'else', 'for', 'foreach', 'while', 'switch']) {
      expect(resolve(`@${kw} rest`)).toMatchObject({ kind: 'control', keyword: kw });
    }
  });

  it('classifies @code as a code block', () => {
    const resolution = resolve('@code { const a = 1; }');
    expect(resolution.kind).toBe('code-block');
    if (resolution.kind !== 'code-block') throw new Error('unreachable');
    expect(resolution.keywordSpan).toEqual(span(1, 5));
  });

  it('does not treat a keyword prefix as a keyword', () => {
    expect(resolve('@iffy')).toMatchObject({ kind: 'implicit' });
    expect(resolve('@codes')).toMatchObject({ kind: 'implicit' });
  });
});

describe('the @raw directive (§6.13, decision 18 option A)', () => {
  it('recognizes @raw( ... ) and reuses the BalancedGroup', () => {
    const source = '@raw(post.body)';
    const resolution = resolve(source);
    expect(resolution.kind).toBe('raw');
    if (resolution.kind !== 'raw') throw new Error('unreachable');
    expect(source.slice(resolution.expression.expr.start, resolution.expression.expr.end)).toBe(
      'post.body',
    );
    expect(resolution.keywordSpan).toEqual(span(1, 4));
    // The atom covers the whole directive so SDD-07 can replace it wholesale.
    expect(resolution.expression.span).toEqual(span(0, source.length));
    expect(resolution.expression.kind).toBe('explicit');
  });

  it('treats @raw without a ( as an ordinary implicit expression', () => {
    const resolution = resolve('@raw.x');
    expect(resolution.kind).toBe('implicit');
    if (resolution.kind !== 'implicit') throw new Error('unreachable');
    expect('@raw.x'.slice(resolution.expression.expr.start, resolution.expression.expr.end)).toBe(
      'raw.x',
    );
  });

  it('requires the ( to be adjacent', () => {
    expect(resolve('@raw (x)')).toMatchObject({ kind: 'implicit' });
  });

  it('surfaces the balancer diagnostic on an unterminated (', () => {
    const result = resolveTrigger('@raw(post.body', 0);
    expect(result.value.kind).toBe('raw');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0002']);
  });
});

describe('resolutionEnd (§3.3 convenience)', () => {
  it('points past the keyword for control and code', () => {
    expect(resolutionEnd(resolve('@if (x)'))).toBe(3);
    expect(resolutionEnd(resolve('@code {}'))).toBe(5);
  });

  it('points past the atom for implicit and raw', () => {
    expect(resolutionEnd(resolve('@data.title rest'))).toBe(11);
    expect(resolutionEnd(resolve('@raw(post.body) rest'))).toBe(15);
  });
});

describe('degradation (§5)', () => {
  it('does not throw when the offset does not point at an identifier', () => {
    const resolution = resolve('@ ');
    expect(resolution.kind).toBe('implicit');
    if (resolution.kind !== 'implicit') throw new Error('unreachable');
    expect(resolution.expression.expr).toEqual(span(1, 1));
    expect(resolution.expression.span).toEqual(span(0, 1));
  });

  it('does not throw at end of source', () => {
    expect(resolve('@').kind).toBe('implicit');
    expect(scanImplicitExpression('@', 0).diagnostics).toEqual([]);
  });
});

describe('the tokenizer seam (SDD-03 -> SDD-04)', () => {
  it('resolves every at-trigger the tokenizer emits over a real construct', () => {
    const source = '<h2>@data.title</h2>';
    const trigger = tokenize(source).value.find((t) => t.type === 'at-trigger');
    expect(trigger).toBeDefined();
    const resolution = resolveTrigger(source, trigger!.span.start).value;
    expect(resolution.kind).toBe('implicit');
    if (resolution.kind !== 'implicit') throw new Error('unreachable');
    expect(source.slice(resolution.expression.expr.start, resolution.expression.expr.end)).toBe(
      'data.title',
    );
    // The caller resumes right at the closing tag.
    expect(source.slice(resolutionEnd(resolution))).toBe('</h2>');
  });

  it('never sees an at-trigger for an email (§6.12, decision 7)', () => {
    const tokens = tokenize('escribe a soporte@fudic.dev hoy').value;
    expect(tokens.some((t) => t.type === 'at-trigger')).toBe(false);
  });
});
