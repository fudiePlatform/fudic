/**
 * Upgrading an element in place, as a browser does it.
 *
 * In a browser, `customElements.define` upgrades every connected instance of the tag IN
 * PLACE: the same element, now of its class, with the shadow root the parser gave it. happy-dom
 * instead REPLACES each one with a new element and leaves the shadow root behind with the old
 * one — so a host the server painted would come up empty, and the runtime, which snapshots the
 * instances when a gesture starts and defines the tag afterwards, would hand its state to an
 * element that is no longer in the page.
 *
 * While the environment lives, `define` is wrapped: happy-dom's replacements for the tag are
 * withdrawn before it runs, and each connected instance is then upgraded where it stands —
 * its class's constructor run on that very element, as the upgrade algorithm does.
 */

type Callbacks = Map<string, ((...args: never[]) => unknown)[]>;

/** happy-dom's name for the callback that replaces an instance once its tag is defined. */
const REPLACER = /onCustomElementConnected/u;

/** Every element under `root`, shadow roots included. */
function* deep(root: ParentNode): Generator<Element> {
  for (const el of root.querySelectorAll('*')) {
    yield el;
    if (el.shadowRoot !== null) yield* deep(el.shadowRoot);
  }
}

/** The class in `ctor`'s chain that extends `HTMLElement` directly. */
function topOf(ctor: CustomElementConstructor): object {
  let top: object = ctor;
  while (Object.getPrototypeOf(top) !== HTMLElement) top = Object.getPrototypeOf(top) as object;
  return top;
}

/**
 * Run `ctor` on `el`: its `super()` hands back `el` itself, so every field and every
 * constructor of the chain lands on the element that is already in the page.
 */
function upgradeInPlace(el: Element, ctor: CustomElementConstructor): void {
  const top = topOf(ctor);
  Object.setPrototypeOf(top, function (this: unknown) {
    return el;
  });
  try {
    Reflect.construct(ctor, []);
  } finally {
    Object.setPrototypeOf(top, HTMLElement);
  }
  Object.setPrototypeOf(el, ctor.prototype as object);
}

/** The happy-dom whose internals this module was written against. */
export const HAPPY_DOM = '20.10.6';

/** happy-dom's list of what waits for each tag, or an error when it is not where it was. */
function callbacksOf(registry: CustomElementRegistry): Callbacks {
  const key = Object.getOwnPropertySymbols(registry).find((s) => s.description === 'callbacks');
  const callbacks = key === undefined ? undefined : (registry as unknown as Record<symbol, unknown>)[key];
  if (!(callbacks instanceof Map)) {
    throw new Error(
      `@fudic/testing upgrades custom elements in place through happy-dom ${HAPPY_DOM}'s registry, ` +
        'and this happy-dom keeps no callbacks list there: install happy-dom ' + HAPPY_DOM,
    );
  }
  return callbacks as Callbacks;
}

/** Wrap `registry.define` so it upgrades in place. Once per environment. */
export function upgradeInPlaceOnDefine(registry: CustomElementRegistry = customElements): void {
  const callbacks = callbacksOf(registry);
  const define = registry.define.bind(registry);
  registry.define = (name, ctor, options) => {
    const waiting = callbacks.get(name);
    // Only the replacements go: a `whenDefined` waits in the same list and must still resolve.
    if (waiting !== undefined) callbacks.set(name, waiting.filter((cb) => !REPLACER.test(cb.name)));
    define(name, ctor, options);
    for (const el of deep(document)) {
      if (el.localName === name && Object.getPrototypeOf(el) === HTMLElement.prototype) upgradeInPlace(el, ctor);
    }
  };
}
