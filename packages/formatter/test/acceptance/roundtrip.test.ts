/**
 * Acceptance criterion 2: `parse(fmt(x)) ≡ parse(x)`, modulo positions.
 */

import { describe, expect, it } from 'vitest';
import { astSignature } from './_ast.js';
import { corpus, formatted } from './_corpus.js';

describe('criterion 2 — the formatter does not change the program', () => {
  it.each(corpus)('$name keeps its tree, its tags, its words and its atoms', async (fixture) => {
    expect(astSignature(await formatted(fixture))).toEqual(astSignature(fixture.source));
  });

  it('the signature is not vacuous: it notices when a node goes missing', () => {
    const source = '<div><p>a</p><p>b</p></div>';
    expect(astSignature(source)).not.toEqual(astSignature('<div><p>a</p></div>'));
    expect(astSignature('<p>hello world</p>')).not.toEqual(astSignature('<p>hello</p>'));
    expect(astSignature('<p>@(a)</p>')).not.toEqual(astSignature('<p>@a</p>'));
  });

  it('but it does ignore what the formatter is allowed to move', () => {
    expect(astSignature('<div>\n  <p>a b</p>\n</div>')).toEqual(
      astSignature('<div>   <p>a   b</p>   </div>'),
    );
  });
});
