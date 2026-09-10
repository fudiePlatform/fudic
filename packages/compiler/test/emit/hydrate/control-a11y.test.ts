// @vitest-environment happy-dom
/**
 * SDD-34 §6.10 — **the accessibility invariant, measured.**
 *
 * The same form with the same errors is rendered by the TWO paths — the server, with
 * `$setErrors` applied before rendering, and a client that hydrates the clean markup and then
 * receives those same errors — and the resulting HTML is identical: the slot's id, the
 * `aria-describedby` that points at it, the `aria-invalid` and the message.
 *
 * It is the criterion the prototype could not pass. `docs/forms/bind.js` fabricated the
 * `<span>` with `insertAdjacentElement` on the first error, so a form served with its errors
 * and the same form once hydrated had DIFFERENT MARKUP — and with it, different
 * accessibility, depending on whether JavaScript had run. Here the slot is written by the
 * emit and the runtime only ever writes its text (decision 113), so the two paths cannot
 * drift.
 *
 * Both branches are evaluated rather than imported, like the rest of this folder: they are
 * bundler input, so the imports are stripped and the bindings injected. What runs is the
 * emitted code, unmodified.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SsrDom, renderToString } from '@fudic/ssr';
import { browserDom } from '@fudic/dom';
import { FudicElement, signal, computed, subscribe, type FudicElementCtor } from '@fudic/core';
import { emit as busEmit } from '@fudic/dom';
import { control, form, errorText, setMessages, type ErrorMap } from '@fudic/forms';
import {
  bindCheckbox,
  bindForm,
  bindGroup,
  bindNumber,
  bindRadio,
  bindSelect,
  bindSelectMultiple,
  bindText,
} from '@fudic/forms/dom';
import {
  emitComponentModule,
  emitComponentClientModule,
  resolveComponents,
  type ComponentGraph,
} from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { mountAsDsd } from './_harness.js';

/** The schema the view imports as a slice — the shape SDD-34 §4.4 is written around. */
const schema = () => form({ title: control(''), body: control('') });
type UserForm = ReturnType<typeof schema>;

const TEMPLATE =
  '<form control="@f">' +
  '<input control="@f.title">' +
  '<textarea control="@f.body"></textarea>' +
  '</form>';

const io = memoryIo({
  '/home.fud':
    '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
  '/m.fud':
    "@code {\n  import { f } from './user.form.js';\n}\n" +
    `<m-el>\n  <template shadowrootmode="open">${TEMPLATE}</template>\n</m-el>\n`,
});
const graph: ComponentGraph = resolveComponents('/home.fud', io);
const comp = graph.components.get('m-el')!;

/** Every binding the two emitted modules reach for, by the name they reach for it under. */
const BINDINGS = {
  FudicElement,
  signal,
  computed,
  $sub: subscribe,
  emit: busEmit,
  bindText,
  bindForm,
  bindGroup,
  bindNumber,
  bindRadio,
  bindSelect,
  bindSelectMultiple,
  bindCheckbox,
  $fudErrorText: errorText,
};

const names = Object.keys(BINDINGS);
const values = Object.values(BINDINGS);

/**
 * The server `render`, with its imports stripped and `f` handed in as a parameter.
 *
 * `f` is a MODULE binding of the emitted module — the neutral zone's import, hoisted — so
 * injecting it as a parameter of the evaluated module is exactly what the bundler does when
 * it resolves that import: one object, shared by everything the module builds.
 */
function serverRender(f: UserForm): (dom: unknown, shadow: unknown, props: unknown) => void {
  const body = emitComponentModule(graph, comp)
    .replace(/^import .*$/gmu, '')
    .replace(/^export\s+/gmu, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function(...names, 'f', `${body}\nreturn render;`);
  return make(...values, f) as (dom: unknown, shadow: unknown, props: unknown) => void;
}

/**
 * The client factory, with `f` handed in the same way.
 *
 * `f` is a MODULE binding of the chunk — the neutral zone's import, hoisted — so injecting it
 * as a parameter of the evaluated module is exactly what the bundler does when it resolves
 * that import: one object, shared by whatever the module builds.
 */
function clientFactoryFor(f: UserForm): FudicElementCtor {
  const body = emitComponentClientModule(graph, comp).replace(/^import .*$/gmu, '');
  let captured: FudicElementCtor | undefined;
  const registry = { define: (_n: string, ctor: FudicElementCtor) => void (captured = ctor) };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(...names, 'customElements', 'f', body)(...values, registry, f);
  return captured!;
}

/** The inside of the shadow root the server painted, as HTML. */
function paint(f: UserForm): string {
  const dom = new SsrDom();
  const host = dom.element('m-el');
  const shadow = dom.attachShadow(host);
  serverRender(f)(dom, shadow, {});
  const html = renderToString(host);
  const open = html.indexOf('>', html.indexOf('<template')) + 1;
  return html.slice(open, html.lastIndexOf('</template>'));
}

const ERRORS: ErrorMap = { title: { required: true }, body: { minLength: 10 } };

beforeEach(() => {
  document.body.innerHTML = '';
  setMessages({});
});

describe('§6.10 — the same form, the same errors, by the two paths', () => {
  it('produces the same HTML, node for node', () => {
    // Path A — the server renders a form that ALREADY has the errors on it: a 422 the page
    // was rebuilt with. No JavaScript runs on the client at all.
    const server = schema();
    server.$setErrors(ERRORS);
    const painted = mountAsDsd('m-el', paint(server));

    // Path B — the server renders the same form CLEAN, the client adopts that markup and
    // only then receives the same errors.
    const client = schema();
    const clean = mountAsDsd('m-el', paint(client));
    const factory = clientFactoryFor(client);
    const controller = factory.c([browserDom, clean.shadow]);
    controller.h();
    client.$setErrors(ERRORS);

    expect(clean.shadow.innerHTML).toBe(painted.shadow.innerHTML);
  });

  it('and the four things §6.10 names are the same, read one by one', () => {
    const server = schema();
    server.$setErrors(ERRORS);
    const painted = mountAsDsd('m-el', paint(server));

    const client = schema();
    const clean = mountAsDsd('m-el', paint(client));
    factoryHydrate(client, clean.shadow);
    client.$setErrors(ERRORS);

    for (const selector of ['input', 'textarea']) {
      const a = painted.shadow.querySelector(selector)!;
      const b = clean.shadow.querySelector(selector)!;
      const id = a.getAttribute('aria-describedby')!;
      expect(id).not.toBe(null);
      expect(b.getAttribute('aria-describedby')).toBe(id);
      expect(a.getAttribute('aria-invalid')).toBe('true');
      expect(b.getAttribute('aria-invalid')).toBe('true');
      const slotA = painted.shadow.querySelector(`#${id}`)!;
      const slotB = clean.shadow.querySelector(`#${id}`)!;
      expect(slotA.textContent).toBe(slotB.textContent);
      expect(slotA.textContent).not.toBe('');
    }
  });

  it('a form with no errors is the same by both paths too', () => {
    const painted = mountAsDsd('m-el', paint(schema()));
    const client = schema();
    const clean = mountAsDsd('m-el', paint(client));
    factoryHydrate(client, clean.shadow);
    expect(clean.shadow.innerHTML).toBe(painted.shadow.innerHTML);
    // The reference is there anyway, pointing at an empty slot: adding it only when an error
    // appears is what makes some readers fail to announce it (§4.3).
    expect(clean.shadow.querySelector('input')!.getAttribute('aria-describedby')).toBe(
      'fud-e-f-title',
    );
  });

  it('the author’s messages reach both paths the same way', () => {
    setMessages({ required: () => 'Falta', minLength: (v) => `Mínimo ${String(v)}` });
    const server = schema();
    server.$setErrors(ERRORS);
    const painted = mountAsDsd('m-el', paint(server));

    const client = schema();
    const clean = mountAsDsd('m-el', paint(client));
    factoryHydrate(client, clean.shadow);
    client.$setErrors(ERRORS);

    expect(painted.shadow.querySelector('#fud-e-f-title')!.textContent).toBe('Falta');
    expect(clean.shadow.innerHTML).toBe(painted.shadow.innerHTML);
  });
});

/** Adopt the markup with the emitted factory — the `h` path, the one hydration takes. */
function factoryHydrate(f: UserForm, shadow: ShadowRoot): void {
  clientFactoryFor(f).c([browserDom, shadow]).h();
}
