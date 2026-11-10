/**
 * SDD-80 criterion 36, the unit under the editor's answer: `handlerHover` over `$value` and over a
 * named handler, and `handlerArgumentsAt`, the position both it and the completion of `$value`
 * stand on. The round trip through the server is `test/acceptance/value-and-named-handlers.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { regionAt } from '@fudic/compiler';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { handlerFacts, handlerHover } from '../../src/services/delegate.js';
import { handlerArgumentsAt } from '../../src/services/position.js';
import { memoryFs } from '../_support.js';

const PATH = '/p/src/components/app-table.fud';

/** A component whose template is `body`. */
const component = (body: string): string => `@code {
  const { ps = [] } = props<{ ps?: { id: number }[] }>();
  function f(...a: unknown[]) { void a; }
}
<app-table>
  <template shadowrootmode="open">
    ${body}
  </template>
</app-table>
`;

/** The document and the region at the `|` of `marked`. */
function at(marked: string) {
  const offset = marked.indexOf('|');
  const text = marked.replace('|', '');
  const index = new WorkspaceIndex(memoryFs({ [PATH]: text }));
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, text);
  return { cached, offset, text, region: regionAt(text, cached.html, offset) };
}

const hover = (marked: string): string | undefined => {
  const { cached, offset, region } = at(marked);
  return handlerHover(cached, offset, region)?.value;
};

const TWO_MARKS = '<ul @click.ver=@f(p)>@foreach (const p of ps) key (p.id) { <li delegate:p="click.ver"></li><i delegate:p="click.ver"></i> }</ul>';

describe('handlerHover', () => {
  it('over `$value` of a handler on its own element: the element that carries the event', () => {
    expect(hover(component('<input type="number" @input=@f($va|lue)>'))).toBe(
      '`$value: number | null` — value of the number, null when empty, read from the element that carries the event.',
    );
  });

  it('over `$value` where there is no control: nothing', () => {
    expect(hover(component('<div @click=@f($va|lue)></div>'))).toBeUndefined();
  });

  it('over another word of the arguments, or `$value` outside them: nothing', () => {
    expect(hover(component('<input @input=@f($value, o|k)>'))).toBeUndefined();
    expect(hover(component('<input @input=@f($value) title="$va|lue">'))).toBeUndefined();
  });

  it('over a named handler: the marks that serve it, counted', () => {
    expect(hover(component(TWO_MARKS.replace('@click.ver', '@cl|ick.ver')))).toContain('read by 2 marks');
    // One that no mark serves still names its event and its handler.
    expect(hover(component('<ul @click.n|ada=@f()></ul>'))).toBe('`click`, handler `nada`; read by 0 marks `delegate:…="click.nada"`.');
  });

  it('over the value of a named handler, or a plain one: not the name', () => {
    expect(hover(component(TWO_MARKS.replace('@f(p)', '@f(|p)')))).toBeUndefined();
    expect(hover(component('<ul @cl|ick=@f()></ul>'))).toBeUndefined();
  });

  it('outside any attribute: nothing', () => {
    expect(hover(component('<p>te|xt</p>'))).toBeUndefined();
  });
});

describe('handlerFacts', () => {
  it('a delegated handler: the row and its marks; a plain one, neither', () => {
    const { cached, text } = at(component(TWO_MARKS));
    const start = text.indexOf('@click.ver');
    expect(handlerFacts(cached, { start, end: start + 1 }).served).toEqual({ name: 'p', marks: 2 });
    const plain = at(component('<input @input=@f()>'));
    const own = plain.text.indexOf('@input');
    expect(handlerFacts(plain.cached, { start: own, end: own + 1 })).toEqual({
      value: expect.objectContaining({ type: 'string' }),
    });
  });
});

describe('handlerArgumentsAt', () => {
  const args = (marked: string) => {
    const { offset, text, region } = at(marked);
    return handlerArgumentsAt(text, offset, region);
  };

  it('inside the open call of a handler, with the word being typed', () => {
    expect(args(component('<input @input=@f(a, $v|)>'))?.text).toBe('$v');
    expect(args(component('<input @input="@f(g(1), |)">'))?.text).toBe('');
  });

  it('not once the call is closed, before it opens, nor on what is not a call', () => {
    expect(args(component('<input @input=@f(a)|>'))).toBeUndefined();
    expect(args(component('<input @input=@f(a) title=x|>'))).toBeUndefined();
    expect(args(component('<input @input=@|f(a)>'))).toBeUndefined();
    expect(args(component('<input @input=@(a, |)>'))).toBeUndefined();
  });

  it('not in an attribute that is no event, nor in one with no value', () => {
    expect(args(component('<input .x=@f(|)>'))).toBeUndefined();
    expect(args(component('<input title="f(|)">'))).toBeUndefined();
    expect(args(component('<p>@f(|)</p>'))).toBeUndefined();
    expect(args(component('<input @inp|ut>'))).toBeUndefined();
  });
});
