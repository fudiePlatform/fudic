import { describe, expect, it } from 'vitest';
import { type DomClient } from '@fudic/dom';
import { FudicElement, signal, type Render, type Signal } from '../src/index.js';

let seq = 0;
function freshTag(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/**
 * Handwritten render imitating the emit's output: a `<span data-fud-b="count">`
 * bound to a count signal, updated fine-grained on notification.
 */
function counterRender(
  dom: DomClient<Node>,
  root: ShadowRoot,
  count: Signal<number>,
  calls: string[],
): Render<Node> {
  let bound: Node | null = null;
  let off: (() => void) | null = null;
  const render: Render<Node> = {
    create() {
      calls.push('create');
      const span = dom.element('span');
      dom.setAttr(span, 'data-fud-b', 'count');
      dom.append(span, dom.text(String(count.peek())));
      dom.append(root, span);
      bound = span;
    },
    hydrate(cursor) {
      calls.push(cursor.byBinding('count') === null ? 'hydrate:miss' : 'hydrate');
      bound = cursor.byBinding('count');
    },
    mount() {
      calls.push('mount');
      off = count.subscribe(() => {
        render.update();
      });
    },
    update() {
      calls.push('update');
      const text = bound?.firstChild;
      if (text !== null && text !== undefined) {
        dom.setText(text, String(count()));
      }
    },
    remove() {
      calls.push('remove');
      off?.();
      off = null;
    },
  };
  return render;
}

function counterElement(calls: string[], initial: number) {
  return class extends FudicElement {
    readonly count = signal(initial);
    protected override render(dom: DomClient<Node>, root: ShadowRoot): Render<Node> {
      return counterRender(dom, root, this.count, calls);
    }
  };
}

describe('FudicElement', () => {
  it('cold connect: creates the shadow, runs create() + mount(), content visible (§6.7)', () => {
    const calls: string[] = [];
    const tag = freshTag('app-cold');
    customElements.define(tag, counterElement(calls, 3));
    const el = document.createElement(tag);
    document.body.append(el);
    expect(calls).toEqual(['create', 'mount']);
    expect(el.shadowRoot?.querySelector('[data-fud-b="count"]')?.textContent).toBe('3');
  });

  it('DSD connect: hydrates (not create), reacts, and tears down to zero subscribers (§6.8)', () => {
    const calls: string[] = [];
    const tag = freshTag('app-dsd');
    const Ctor = counterElement(calls, 5);
    customElements.define(tag, Ctor);
    // DSD semantics without a parser: the shadow is populated before connection.
    // (happy-dom cannot upgrade in place, so the element is created already defined.)
    const el = document.createElement(tag);
    const root = el.attachShadow({ mode: 'open' });
    const span = document.createElement('span');
    span.setAttribute('data-fud-b', 'count');
    span.textContent = '5';
    root.append(span);
    document.body.append(el); // connectedCallback
    expect(calls).toEqual(['hydrate', 'mount']);

    const instance = el as InstanceType<typeof Ctor>;
    instance.count.set(6);
    expect(span.textContent).toBe('6');

    el.remove(); // disconnectedCallback → remove()
    expect(calls).toContain('remove');
    instance.count.set(7); // zero live subscribers: nothing updates
    expect(span.textContent).toBe('6');
  });

  it('an empty pre-attached shadow root goes down the cold path', () => {
    const calls: string[] = [];
    const tag = freshTag('app-empty');
    const el = document.createElement(tag);
    el.attachShadow({ mode: 'open' });
    document.body.append(el);
    customElements.define(tag, counterElement(calls, 1));
    expect(calls).toEqual(['create', 'mount']);
  });

  it('cold path adopts the head <style host> sheet (hydrated path is the polyfill)', () => {
    const tag = freshTag('app-styled');
    const styleEl = document.createElement('style');
    styleEl.setAttribute('host', tag);
    styleEl.textContent = ':host{display:block}';
    document.head.append(styleEl);
    customElements.define(tag, counterElement([], 0));
    const el = document.createElement(tag);
    document.body.append(el);
    expect(el.shadowRoot?.adoptedStyleSheets).toHaveLength(1);
  });

  it('disconnect without a live view is a no-op', () => {
    const tag = freshTag('app-idle');
    const Ctor = counterElement([], 0);
    customElements.define(tag, Ctor);
    const el = new Ctor();
    expect(() => {
      el.disconnectedCallback();
    }).not.toThrow();
  });
});
