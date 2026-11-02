import { describe, it, expect } from 'vitest';
import { NS } from '../src/ns.js';
import { browserDom as dom } from '../src/browser.js';

describe('browserDom construction', () => {
  it('builds an HTML element and appends text', () => {
    const div = dom.element('div');
    dom.append(div, dom.text('x'));
    expect((div as HTMLElement).outerHTML).toBe('<div>x</div>');
  });

  it('creates an element in a non-HTML namespace', () => {
    const svg = dom.element('svg', 'svg');
    expect((svg as Element).namespaceURI).toBe(NS.svg);
  });

  it('creates comment nodes', () => {
    const c = dom.comment('fud:if');
    expect(c.nodeType).toBe(8);
    expect((c as Comment).data).toBe('fud:if');
  });
});

describe('browserDom mutation', () => {
  it('sets and removes attributes', () => {
    const el = dom.element('button') as Element;
    dom.setAttr(el, 'type', 'submit');
    expect(el.getAttribute('type')).toBe('submit');
    dom.removeAttr(el, 'type');
    expect(el.hasAttribute('type')).toBe(false);
  });

  it('setLive writes checked as the property, and puts back what the user ticked (SDD-74 §4.4)', () => {
    const box = dom.element('input') as HTMLInputElement;
    box.type = 'checkbox';
    dom.setLive(box, 'checked', false);
    expect(box.checked).toBe(false);
    box.checked = true; // the user ticks it
    dom.setLive(box, 'checked', false); // the same value as before: written anyway
    expect(box.checked).toBe(false);
    dom.setLive(box, 'checked', true);
    expect(box.checked).toBe(true);
    // The attribute is never touched: it is the default, not the state.
    expect(box.hasAttribute('checked')).toBe(false);
  });

  it.each([
    [true, true],
    ['', true],
    [0, true],
    [false, false],
    [null, false],
    [undefined, false],
  ])('setLive checked of %j is %j: false and null write none, the rest one', (value, checked) => {
    const box = dom.element('input') as HTMLInputElement;
    box.type = 'checkbox';
    box.checked = !checked;
    dom.setLive(box, 'checked', value);
    expect(box.checked).toBe(checked);
  });

  it('setLive writes value on an input and a textarea, over what the user typed', () => {
    for (const tag of ['input', 'textarea']) {
      const field = dom.element(tag) as HTMLInputElement | HTMLTextAreaElement;
      dom.setLive(field, 'value', 'Ana');
      expect(field.value).toBe('Ana');
      field.value = 'Anabel'; // typed
      dom.setLive(field, 'value', 'Ana');
      expect(field.value).toBe('Ana');
      expect(field.hasAttribute('value')).toBe(false);
    }
  });

  it.each([
    [42, '42'],
    ['x', 'x'],
    [true, ''],
    [false, ''],
    [null, ''],
    [undefined, ''],
  ])('setLive value of %j is %j', (value, text) => {
    const field = dom.element('input') as HTMLInputElement;
    field.value = 'typed';
    dom.setLive(field, 'value', value);
    expect(field.value).toBe(text);
  });

  it('setLive writes selected on an option, over what the user picked', () => {
    const select = dom.element('select') as HTMLSelectElement;
    const a = dom.element('option') as HTMLOptionElement;
    const b = dom.element('option') as HTMLOptionElement;
    a.value = 'a';
    b.value = 'b';
    dom.append(select, a);
    dom.append(select, b);
    dom.setLive(b, 'selected', true);
    expect(select.value).toBe('b');
    a.selected = true; // the user picks a
    dom.setLive(b, 'selected', true);
    expect(select.value).toBe('b');
    expect(b.hasAttribute('selected')).toBe(false);
  });

  it('setLive does not write when the DOM already holds the value', () => {
    let writes = 0;
    let held: unknown = 'same';
    const fake = {
      get value(): unknown {
        return held;
      },
      set value(v: unknown) {
        writes += 1;
        held = v;
      },
    };
    dom.setLive(fake as unknown as Node, 'value', 'same');
    expect(writes).toBe(0);
    dom.setLive(fake as unknown as Node, 'value', 'other');
    expect(writes).toBe(1);
  });

  it('setText retouches an existing text node', () => {
    const t = dom.text('0');
    dom.setText(t, '1');
    expect((t as Text).data).toBe('1');
  });

  it('setProp assigns a JS property, not an attribute', () => {
    const el = dom.element('div') as Element & { count?: number };
    dom.setProp(el, 'count', 42);
    expect(el.count).toBe(42);
    expect(el.hasAttribute('count')).toBe(false);
  });
});

describe('browserDom structure', () => {
  it('before inserts a node ahead of the anchor', () => {
    const parent = dom.element('div');
    const anchor = dom.comment('anchor');
    dom.append(parent, anchor);
    const span = dom.element('span');
    dom.before(anchor, span);
    expect((parent as HTMLElement).innerHTML).toBe('<span></span><!--anchor-->');
  });

  it('remove detaches a node', () => {
    const parent = dom.element('div');
    const child = dom.element('span');
    dom.append(parent, child);
    dom.remove(child);
    expect((parent as HTMLElement).innerHTML).toBe('');
  });
});

describe('browserDom shadow', () => {
  it('attachShadow opens a shadow root and is idempotent', () => {
    const host = dom.element('app-x');
    const root = dom.attachShadow(host);
    expect((root as ShadowRoot).mode).toBe('open');
    expect(dom.attachShadow(host)).toBe(root);
  });

  it('attachShadow passes `delegatesFocus` through (SDD-34 §4.5)', () => {
    // The one option that has to cross: a control-component is not labelable without it.
    // What the emulator reflects is not the point — the INIT is, and a browser reads it.
    const host = dom.element('app-input') as Element;
    const seen: ShadowRootInit[] = [];
    host.attachShadow = ((init: ShadowRootInit) => {
      seen.push(init);
      return { mode: init.mode } as ShadowRoot;
    }) as Element['attachShadow'];
    dom.attachShadow(host, true);
    expect(seen).toEqual([{ mode: 'open', delegatesFocus: true }]);
  });

  it('attachShadow passes the bridge of a control-component through (decision 132)', () => {
    const host = dom.element('app-input') as Element;
    const seen: ShadowRootInit[] = [];
    host.attachShadow = ((init: ShadowRootInit) => {
      seen.push(init);
      return { mode: init.mode } as ShadowRoot;
    }) as Element['attachShadow'];
    dom.attachShadow(host, true, 'campo');
    expect(seen).toEqual([{ mode: 'open', delegatesFocus: true, referenceTarget: 'campo' }]);
  });

  it('attachShadow passes what the author wrote on the template, only when asked (SDD-57 §6.9)', () => {
    const host = dom.element('app-x') as Element;
    const seen: ShadowRootInit[] = [];
    host.attachShadow = ((init: ShadowRootInit) => {
      seen.push(init);
      return { mode: init.mode } as ShadowRoot;
    }) as Element['attachShadow'];
    dom.attachShadow(host, false, undefined, true, true);
    dom.attachShadow(host, false, undefined, false, false);
    expect(seen).toEqual([
      { mode: 'open', delegatesFocus: false, clonable: true, serializable: true },
      { mode: 'open', delegatesFocus: false },
    ]);
  });

  it('host gives the shadow root back its host (SDD-15 §4.4)', () => {
    const host = dom.element('app-x');
    expect(dom.host(dom.attachShadow(host))).toBe(host);
  });
});

describe('browserDom hookup (SDD-15 §3.8)', () => {
  it('event subscribes, and the disposer takes the SAME listener off again', () => {
    const node = dom.element('button');
    let hits = 0;
    const off = dom.event(node, 'click', () => {
      hits += 1;
    });
    (node as HTMLElement).dispatchEvent(new Event('click'));
    off();
    (node as HTMLElement).dispatchEvent(new Event('click'));
    expect(hits).toBe(1);
  });

  it('two subscriptions to the same type give two independent disposers', () => {
    const node = dom.element('button');
    const seen: string[] = [];
    const offA = dom.event(node, 'click', () => seen.push('a'));
    dom.event(node, 'click', () => seen.push('b'));
    offA();
    (node as HTMLElement).dispatchEvent(new Event('click'));
    expect(seen).toEqual(['b']); // taking one off must not take the other with it
  });

  it('bus listens on the host DOCUMENT, not on the host', () => {
    // Emitter and subscriber are siblings: an event bubbling out of the emitter climbs ITS
    // ancestors, so a listener on the subscriber's host would never fire.
    const host = dom.element('shopping-cart');
    document.body.append(host as ChildNode);
    let hits = 0;
    const off = dom.bus(host, 'carrito', () => {
      hits += 1;
    });
    (host as HTMLElement).dispatchEvent(new Event('carrito')); // no bubbling: nothing
    document.dispatchEvent(new Event('carrito'));
    expect(hits).toBe(1);
    off();
    document.dispatchEvent(new Event('carrito'));
    expect(hits).toBe(1);
    (host as ChildNode).remove();
  });

  it('falls back to the global document for a host that IS one', () => {
    // `ownerDocument` is null exactly for a document node; the page still has one ancestor
    // everything shares, and that is the one the bus uses.
    let hits = 0;
    const off = dom.bus(document, 'carrito', () => {
      hits += 1;
    });
    document.dispatchEvent(new Event('carrito'));
    off();
    expect(hits).toBe(1);
  });
});

describe('browserDom traversal', () => {
  it('walks first/next/previous/childAt', () => {
    const parent = dom.element('div');
    const a = dom.element('a');
    const b = dom.element('b');
    const c = dom.element('i');
    dom.append(parent, a);
    dom.append(parent, b);
    dom.append(parent, c);

    expect(dom.firstChild(parent)).toBe(a);
    expect(dom.nextSibling(a)).toBe(b);
    expect(dom.previousSibling(b)).toBe(a);
    expect(dom.childAt(parent, 2)).toBe(c);
    expect(dom.childAt(parent, 3)).toBeNull();
    expect(dom.nextSibling(c)).toBeNull();
  });

  it('walks elements only, stepping over the text between them', () => {
    // The shape hydration actually meets: a tree that went through HTML and back, where
    // the whitespace between the elements is text the parser may have merged into one node
    // or split differently. The element cursor is blind to all of it.
    const parent = dom.element('div');
    const a = dom.element('a');
    const b = dom.element('b');
    dom.append(parent, dom.text(' '));
    dom.append(parent, a);
    dom.append(parent, dom.text(' '));
    dom.append(parent, dom.text(' ')); // two adjacent text nodes: HTML cannot tell them apart
    dom.append(parent, b);
    dom.append(parent, dom.text(' '));

    expect(dom.firstElementChild(parent)).toBe(a);
    expect(dom.nextElementSibling(a)).toBe(b);
    expect(dom.nextElementSibling(b)).toBeNull();
    expect(dom.firstElementChild(a)).toBeNull();
  });

  it('lastChild reaches the trailing text no element follows', () => {
    const parent = dom.element('div');
    const a = dom.element('a');
    const tail = dom.text('x');
    dom.append(parent, a);
    dom.append(parent, tail);

    expect(dom.lastChild(parent)).toBe(tail);
    expect(dom.lastChild(a)).toBeNull();
  });
});

describe('browserDom textAt: the run the server painted as nothing', () => {
  it('hands back the text node it was given, untouched', () => {
    const parent = dom.element('span');
    const run = dom.text('hola');
    dom.append(parent, run);

    expect(dom.textAt(parent, run, null)).toBe(run);
    expect(parent.childNodes).toHaveLength(1);
  });

  it('with nothing found, appends an empty text node at the end', () => {
    // `<span>@s()</span>` with `s() === ''`: the HTML carries `<span></span>`.
    const parent = dom.element('span');

    const run = dom.textAt(parent, null, null);
    expect(run.nodeType).toBe(3);
    expect(run.textContent).toBe('');
    expect(parent.lastChild).toBe(run);
  });

  it('with an element found in its place, inserts the empty run before `before`', () => {
    // `<p>@s()<b></b></p>`: walking back from the cursor meets the `<b>`, not the run.
    const parent = dom.element('p');
    const b = dom.element('b');
    dom.append(parent, b);

    const run = dom.textAt(parent, b, b);
    expect(run).not.toBe(b);
    expect(run.nodeType).toBe(3);
    expect([...parent.childNodes]).toEqual([run, b]);
  });

  it('with an element found and no `before`, appends it after everything', () => {
    const parent = dom.element('p');
    const b = dom.element('b');
    dom.append(parent, b);

    const run = dom.textAt(parent, b, null);
    expect([...parent.childNodes]).toEqual([b, run]);
  });

  it('builds the node in the global document when the parent has no owner', () => {
    // `ownerDocument` is null only for a document itself, which takes no text child: a stand-in
    // records the insertion instead.
    const inserted: [Node, Node | null][] = [];
    const parent = {
      ownerDocument: null,
      insertBefore: (node: Node, ref: Node | null) => inserted.push([node, ref]),
    } as unknown as Node;

    const run = dom.textAt(parent, null, null);
    expect(run.ownerDocument).toBe(document);
    expect(inserted).toEqual([[run, null]]);
  });
});
