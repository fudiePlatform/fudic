/**
 * The fixtures the `./dom` tests share: markup built the way the EMIT builds it.
 *
 * The error slot is written here rather than fabricated by a binding, and that is the point of
 * decision 111 restated as a test helper: the slot exists in the markup before any JavaScript
 * runs, with its stable id and the `aria-describedby` that points at it. A helper that created
 * it on demand would be testing the prototype's design instead of this one.
 */

/** One control's markup: the element, and the slot the emit left behind it. */
export function field(html: string, id = 'e1'): { el: HTMLElement; slot: HTMLElement } {
  const host = document.createElement('div');
  host.innerHTML = `${html.replace('>', ` aria-describedby="${id}">`)}<span id="${id}" data-fud-err></span>`;
  const el = host.firstElementChild as HTMLElement;
  const slot = host.querySelector(`#${id}`) as HTMLElement;
  document.body.append(host);
  return { el, slot };
}

/** A container built from raw markup, attached so focus and `querySelector` behave. */
export function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

/** Fire the event a browser fires, so the listeners under test see a real one. */
export function fire(el: EventTarget, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

/**
 * Count the writes to a property of ONE element, without changing what it does.
 *
 * It is how "does not move the cursor" is measured: assigning `value` on a focused input moves
 * the caret, so the assertion that matters is that the assignment does not HAPPEN when the
 * element already holds the value. Reading `selectionStart` back would measure the emulator's
 * behaviour instead of ours.
 */
export function countWrites(el: object, property: string): () => number {
  let proto = Object.getPrototypeOf(el) as object | null;
  let descriptor: PropertyDescriptor | undefined;
  while (proto !== null && descriptor === undefined) {
    descriptor = Object.getOwnPropertyDescriptor(proto, property);
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  if (descriptor?.get === undefined || descriptor.set === undefined) {
    throw new Error(`\`${property}\` is not an accessor on this element`);
  }
  const { get, set } = descriptor;
  let writes = 0;
  Object.defineProperty(el, property, {
    configurable: true,
    get: () => get.call(el),
    set: (v: unknown) => {
      writes += 1;
      set.call(el, v);
    },
  });
  return () => writes;
}
