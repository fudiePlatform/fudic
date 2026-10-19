/**
 * @vitest-environment happy-dom
 *
 * BUG-51 — a summary the author paints links to its fields. The compiler hands `bindForm` the
 * map path → id of the form's fields; `$issues()` turns it into an `href` per issue, and a click
 * on one of those links — in the form, or in the shadow root of a component inside it — moves
 * the focus as the summary's own links do.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { effect } from '@fudic/core';
import { control, form, required } from '../../src/index.js';
import { bindForm } from '../../src/dom/index.js';
import { internalsOf } from '../../src/internals.js';
import type { AnyForm, AnyNode } from '../../src/types.js';
import { mount } from './_dom.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

const FIELDS = { name: 'nom' } as const;

/** A form with one required field and an error of its own, bound to a `<form>` with `fields`. */
function setup(fields: Readonly<Record<string, string>> | null = FIELDS, extra = '') {
  const host = mount(`<form><input id="nom"><input id="ali">${extra}</form>`);
  const el = host.querySelector('form') as HTMLFormElement;
  const nom = host.querySelector('#nom') as HTMLInputElement;
  const scrolled: unknown[] = [];
  nom.scrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => {
    scrolled.push(arg);
  };
  const f = form(
    { name: control('', [required], { messages: { required: () => 'Escribe tu nombre.' } }), alias: control('') },
    { summary: () => ({ own: true }), messages: { own: () => 'Revisa el formulario.' } },
  );
  const off = bindForm(el, f as unknown as AnyForm, null, null, undefined, fields);
  return { el, nom, f, off, scrolled };
}

/** Submit, so the errors below the form become issues. */
async function submitted(el: HTMLFormElement, f: { $validate(): Promise<boolean> }): Promise<void> {
  await f.$validate();
  el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

const click = (target: Element, composed = false): MouseEvent => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed });
  target.dispatchEvent(event);
  return event;
};

describe('$issues() links to the fields of a bound form', () => {
  it('an issue of a field with an id carries its `#id`; the form’s own error carries none', async () => {
    const { el, f } = setup();
    await submitted(el, f);

    expect(f.$issues()).toEqual([
      { path: '', message: 'Revisa el formulario.' },
      { path: 'name', message: 'Escribe tu nombre.', href: '#nom' },
    ]);
  });

  it('without the map, no issue has an href, as before', async () => {
    const { el, f } = setup(null);
    await submitted(el, f);

    expect(f.$issues().every((issue) => !('href' in issue))).toBe(true);
  });

  it('a field the map does not name has no href', async () => {
    const { el, f } = setup({ alias: 'ali' });
    await submitted(el, f);

    expect(f.$issues().find((issue) => issue.path === 'name')).toEqual({ path: 'name', message: 'Escribe tu nombre.' });
  });

  it('is reactive: what read $issues() reads it again once the form is bound', async () => {
    const host = mount('<form><input id="nom"></form>');
    const f = form({ name: control('', [required]) });
    await f.$validate();
    f.$touch();
    internalsOf(f as unknown as AnyNode).markSubmitted();
    const seen: (string | undefined)[] = [];
    const stop = effect(() => {
      seen.push(f.$issues()[0]?.href);
    });

    bindForm(host.querySelector('form')!, f as unknown as AnyForm, null, null, undefined, FIELDS);

    expect(seen.at(-1)).toBe('#nom');
    expect(seen[0]).toBeUndefined();
    stop();
  });
});

describe('a link of $issues() the author painted', () => {
  it('focuses its field and centres it, and the navigation is prevented', () => {
    const { el, nom, scrolled } = setup(FIELDS, '<a href="#nom">nombre</a>');
    const event = click(el.querySelector('a')!);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nom);
    expect(scrolled).toEqual([{ block: 'center' }]);
  });

  it('works from the shadow root of a component inside the form', () => {
    const { el, nom } = setup(FIELDS, '<app-errores></app-errores>');
    const shadow = el.querySelector('app-errores')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<ul><li><a href="#nom"><span>nombre</span></a></li></ul>';

    const event = click(shadow.querySelector('span')!, true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nom);
  });

  it.each([
    ['an id the map does not name', '<a href="#ali">alias</a>'],
    ['a link that is not to an id', '<a href="/nom">fuera</a>'],
    ['a link with no href', '<a>nada</a>'],
    ['no link at all', '<button type="button">x</button>'],
  ])('leaves alone %s', (_what, markup) => {
    const { el, nom } = setup(FIELDS, markup);
    const event = click(el.lastElementChild!);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(nom);
  });

  it('leaves alone a link whose field is not in the form’s tree', () => {
    const { el } = setup({ name: 'ghost' }, '<a href="#ghost">fantasma</a>');

    expect(click(el.querySelector('a')!).defaultPrevented).toBe(false);
  });

  it('listens only when there is a map', () => {
    const { el, nom } = setup(null, '<a href="#nom">nombre</a>');

    expect(click(el.querySelector('a')!).defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(nom);
  });

  it('stops listening once the binding is cleaned up', () => {
    const { el, off } = setup(FIELDS, '<a href="#nom">nombre</a>');
    off();

    expect(click(el.querySelector('a')!).defaultPrevented).toBe(false);
  });
});
