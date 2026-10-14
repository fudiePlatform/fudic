import { describe, expect, test } from 'vitest';
import { settled, track } from '../src/pending.js';

describe('defining a tag upgrades its instances in place', () => {
  test('the same element, of its class, with its shadow root and its fields', () => {
    class Kept extends HTMLElement {
      #mark = 'stamped';
      mark(): string {
        return this.#mark;
      }
    }
    const holder = document.createElement('div');
    document.body.append(holder);
    holder.innerHTML = '<x-kept></x-kept>';
    const el = holder.firstElementChild!;
    el.attachShadow({ mode: 'open' }).innerHTML = '<p>painted</p>';
    customElements.define('x-kept', Kept);
    expect(holder.firstElementChild).toBe(el);
    expect(el).toBeInstanceOf(Kept);
    expect((el as Kept).mark()).toBe('stamped');
    expect(el.shadowRoot!.innerHTML).toBe('<p>painted</p>');
  });

  test('inside a shadow root as well', () => {
    class Inner extends HTMLElement {}
    const host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<x-inner></x-inner>';
    const el = host.shadowRoot!.firstElementChild!;
    customElements.define('x-inner', Inner);
    expect(host.shadowRoot!.firstElementChild).toBe(el);
    expect(el).toBeInstanceOf(Inner);
  });

  test('a whenDefined still resolves', async () => {
    const defined = customElements.whenDefined('x-awaited');
    customElements.define('x-awaited', class extends HTMLElement {});
    await defined;
    expect(customElements.get('x-awaited')).toBeDefined();
  });
});

describe('settled', () => {
  test('waits for what is tracked, whichever way it ends', async () => {
    const order: string[] = [];
    void track(Promise.resolve().then(() => order.push('resolved')));
    track(Promise.reject(new Error('failed'))).catch(() => order.push('rejected'));
    await settled();
    expect(order.sort()).toEqual(['rejected', 'resolved']);
  });

  test('and for what that work tracks in turn', async () => {
    let done = false;
    void track(
      Promise.resolve().then(() => {
        void track(
          Promise.resolve().then(() => {
            done = true;
          }),
        );
      }),
    );
    await settled();
    expect(done).toBe(true);
  });
});

describe('the guard over happy-dom', () => {
  test('a registry without the internals it was written for fails loudly', async () => {
    const { HAPPY_DOM, upgradeInPlaceOnDefine } = await import('../src/upgrade.js');
    expect(() => upgradeInPlaceOnDefine({} as CustomElementRegistry)).toThrow(
      `through happy-dom ${HAPPY_DOM}'s registry, and this happy-dom keeps no callbacks list there`,
    );
    const odd = { [Symbol('callbacks')]: [] } as unknown as CustomElementRegistry;
    expect(() => upgradeInPlaceOnDefine(odd)).toThrow(`install happy-dom ${HAPPY_DOM}`);
  });
});
