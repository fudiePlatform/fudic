/**
 * @vitest-environment happy-dom
 *
 * BUG-42 §6.B, criteria 12–14 — the summary as a list, its links, and where a failed submit
 * sends the focus.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { bindForm } from '../../src/dom/bind-form.js';
import { bindGroup } from '../../src/dom/bind-group.js';
import { bindText } from '../../src/dom/bind-text.js';
import { control, form, group, required } from '../../src/index.js';
import { internalsOf } from '../../src/internals.js';
import { issueId, summaryEntriesOf, summaryMarkup } from '../../src/summary-markup.js';
import type { AnyNode } from '../../src/types.js';
import { fire, mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

const NBSP = String.fromCharCode(0xa0);

describe('summaryMarkup', () => {
  it('nothing to say is nothing at all, so :empty still hides the element', () => {
    expect(summaryMarkup([], 's', null)).toBe('');
  });

  it('one entry is still a list', () => {
    expect(summaryMarkup([{ path: '', message: 'Una.' }], 's', null)).toBe('<ul><li>Una.</li></ul>');
  });

  it('escapes as the HTML serialisation does, text and attribute', () => {
    const html = summaryMarkup([{ path: 'a', message: `<b> & "x"${NBSP}` }], 's', { a: `i"d&${NBSP}` });
    expect(html).toBe(
      '<ul><li id="s-a"><a href="#i&quot;d&amp;&nbsp;">&lt;b&gt; &amp; "x"&nbsp;</a></li></ul>',
    );
    // Read back through the DOM: the same bytes. (happy-dom leaves a no-break space in an
    // attribute unescaped, where the standard serialisation escapes it: that half is above.)
    const probe = document.createElement('div');
    const round = summaryMarkup([{ path: 'a', message: `<b> & ${NBSP}` }], 's', { a: 'i&d' });
    probe.innerHTML = round;
    expect(probe.innerHTML).toBe(round);
  });

  it('an entry whose path the map does not know is text, and a path keeps its id once', () => {
    expect(
      summaryMarkup(
        [
          { path: 'g', message: 'uno' },
          { path: 'g', message: 'dos' },
          { path: 'x', message: 'tres' },
        ],
        's',
        { g: 'grupo' },
      ),
    ).toBe('<ul><li id="s-g"><a href="#grupo">uno</a></li><li>dos</li><li>tres</li></ul>');
  });

  it('the entries the server builds its nodes from are the ones the markup writes', () => {
    const f = form({ a: control('', [required]) });
    f.a.touch();
    void f.$validate();
    internalsOf(f as unknown as AnyNode).markSubmitted();
    expect(summaryEntriesOf(f, 's', { a: 'x' })).toEqual([{ text: 'required', id: 's-a', href: '#x' }]);
    expect(summaryEntriesOf(f, 's', null)).toEqual([]);
  });

  it('derives the id of a nested path with dashes', () => {
    expect(issueId('fud-s-1', 'acceso.clave')).toBe('fud-s-1-acceso-clave');
  });
});

/** The markup the emit writes for the form of the tests. */
function page(fields: boolean) {
  const host = mount(
    '<form><div id="sum" tabindex="-1"></div>' +
      '<input id="nom"><input id="ali"></form>',
  );
  const f = form(
    { name: control('', [required]), alias: control('', [required]) },
    { summary: (r) => (r.name() !== '' && r.name() === r.alias() ? { same: true } : null) },
  );
  const el = host.querySelector('form')!;
  const summary = host.querySelector<HTMLElement>('#sum')!;
  const nom = host.querySelector<HTMLInputElement>('#nom')!;
  const ali = host.querySelector<HTMLInputElement>('#ali')!;
  bindText(nom, f.name, null);
  bindText(ali, f.alias, null);
  bindForm(el, f, summary, fields ? { name: 'nom', alias: 'ali' } : null);
  return { f, el, summary, nom, ali };
}

describe('the summary in the DOM (criterion 12)', () => {
  it('is empty with nothing to say, and a list of its own texts otherwise', () => {
    const { f, summary } = page(false);
    expect(summary.childNodes.length).toBe(0);
    f.name.set('pedro');
    f.alias.set('pedro');
    void f.$validate();
    expect(summary.innerHTML).toBe('<ul><li>same</li></ul>');
  });

  it('with fields, after a submit, a link per field error with the id of the map', () => {
    const { el, summary } = page(true);
    fire(el, 'submit');
    expect(summary.innerHTML).toBe(
      '<ul><li id="sum-name"><a href="#nom">required</a></li>' +
        '<li id="sum-alias"><a href="#ali">required</a></li></ul>',
    );
  });

  it('takes the children the server wrote instead of writing them again', () => {
    const host = mount('<div id="sum"><ul><li>same</li></ul></div>');
    const summary = host.querySelector<HTMLElement>('#sum')!;
    const list = summary.firstChild;
    const g = form({ a: control('x') });
    g.$setErrors({}, { same: true });
    bindGroup(mount('<fieldset></fieldset>').firstElementChild as HTMLElement, g, summary);
    expect(summary.firstChild).toBe(list);
  });

  it('a group paints its own summary, and none when it has no marker', () => {
    const g = form({ acceso: group({ a: control('') }, [() => ({ mismatch: true })]) });
    const set = mount('<fieldset><p id="gs"></p></fieldset>');
    bindGroup(set.firstElementChild as HTMLElement, g.acceso, set.querySelector<HTMLElement>('#gs'));
    void g.$validate();
    expect(set.querySelector('#gs')!.innerHTML).toBe('<ul><li>mismatch</li></ul>');
    expect(() => bindGroup(document.createElement('div'), g.acceso)).not.toThrow();
  });
});

describe('where a failed submit sends the focus (criterion 13)', () => {
  it('to the summary, when it lists the fields', () => {
    const { el, summary } = page(true);
    fire(el, 'submit');
    expect(document.activeElement).toBe(summary);
  });

  it('to the first invalid field, without fields', () => {
    const { el, nom } = page(false);
    fire(el, 'submit');
    expect(document.activeElement).toBe(nom);
  });

  it('marks the form submitted at every attempt', () => {
    const { f, el } = page(false);
    fire(el, 'submit');
    expect(f.$submitted()).toBe(true);
  });
});

describe('the links (criterion 14)', () => {
  it('focus their field and centre it', () => {
    const { el, summary, ali } = page(true);
    fire(el, 'submit');
    const scrolled: unknown[] = [];
    ali.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
      scrolled.push(arg);
    };
    const link = summary.querySelector<HTMLAnchorElement>('a[href="#ali"]')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(document.activeElement).toBe(ali);
    expect(scrolled).toEqual([{ block: 'center' }]);
    expect(click.defaultPrevented).toBe(true);
  });

  it('focus the host of a control-component, which delegates it', () => {
    // The host stands in for a control-component: it is what the map names, and what the
    // browser then delegates into. Here it is focusable by itself.
    const host = mount('<div id="sum"></div><app-thing id="ali" tabindex="0"></app-thing>');
    const summary = host.querySelector<HTMLElement>('#sum')!;
    bindGroup(document.createElement('div'), form({ alias: control('') }), summary, { alias: 'ali' });
    const target = host.querySelector<HTMLElement>('#ali')!;
    target.scrollIntoView = () => {};
    summary.innerHTML = '<ul><li><a href="#ali">x</a></li></ul>';
    summary.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(target);
  });

  it('a click elsewhere in the summary, or on a link with no field, is left alone', () => {
    const host = mount('<div id="sum"></div>');
    const summary = host.querySelector<HTMLElement>('#sum')!;
    bindGroup(document.createElement('div'), form({ a: control('') }), summary, {});
    summary.innerHTML = '<ul><li><a href="#nobody">x</a></li><li><a href="/away">y</a></li><li>z</li></ul>';
    for (const node of [...summary.querySelectorAll('a'), summary.querySelector('li:last-child')!]) {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      node.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
    }
  });
});
