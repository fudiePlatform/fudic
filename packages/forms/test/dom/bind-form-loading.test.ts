/**
 * @vitest-environment happy-dom
 *
 * BUG-62 — a submit that lands while the browser root is still registering the rules waits for
 * them, unheard by anybody else, and is made again once they are in.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { formOf, inTurn, resetRegistry, rule, settled, str } from '../../src/contract/index.js';
import { bindForm } from '../../src/dom/index.js';
import { mount } from './_dom.js';

afterEach(() => {
  resetRegistry();
});

describe('a submit before the rules are in', () => {
  it('is stopped, nobody else hears it, and it is made again once they arrive', async () => {
    const required = rule<string>({ id: '@fudic/forms/rules', name: 'required', fails: [['required', []]] });
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    void inTurn(() => gate);

    const el = mount('<form><input id="a"></form>').querySelector('form') as HTMLFormElement;
    const f = formOf({ name: str('', [required.use()]) });
    const off = bindForm(el, f, null);
    const heard: boolean[] = [];
    // The author's `@submit`, after the binding as the emit wires it: what it sees is the decision.
    el.addEventListener('submit', (e) => heard.push(e.defaultPrevented));

    const first = new Event('submit', { bubbles: true, cancelable: true });
    el.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(heard).toEqual([]);

    required.check((v) => v !== '');
    open();
    await settled();
    await Promise.resolve();

    // Made again with the rule in: the empty field stops it, and the author hears that.
    expect(heard).toEqual([true]);
    expect(f.$errors()).toEqual({ name: { required: true } });
    off();
  });
});
