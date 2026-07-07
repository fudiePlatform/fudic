/**
 * `delegate` — N2 global event delegation (SDD-14 §4.6). One listener per
 * `(root, type)`; on each event it walks up from `event.target` to the first
 * `[data-fud-e]` and calls the handler registered under that id. Zero per-instance
 * constructors. N3 components wire their own listeners in `mount()` instead:
 * shadow retargeting makes global delegation unviable across the shadow boundary.
 */

export interface Delegate {
  /** Register the handler for `data-fud-e="<handlerId>"`. */
  on(handlerId: string, fn: (e: Event, el: Element) => void): void;
  /** Install ONE listener per `type` on `root` (document in light DOM). Idempotent. */
  connect(root: Document | ShadowRoot, type: string): void;
}

class EventDelegate implements Delegate {
  private readonly handlers = new Map<string, (e: Event, el: Element) => void>();
  private readonly connected = new WeakMap<Document | ShadowRoot, Set<string>>();

  on(handlerId: string, fn: (e: Event, el: Element) => void): void {
    this.handlers.set(handlerId, fn);
  }

  connect(root: Document | ShadowRoot, type: string): void {
    let types = this.connected.get(root);
    if (types === undefined) {
      types = new Set();
      this.connected.set(root, types);
    }
    if (types.has(type)) {
      return;
    }
    types.add(type);
    root.addEventListener(type, (e) => {
      this.dispatch(e);
    });
  }

  private dispatch(e: Event): void {
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }
    const el = target.closest('[data-fud-e]');
    if (el === null) {
      return;
    }
    // `closest('[data-fud-e]')` matched, so the attribute is present.
    const handlerId = el.getAttribute('data-fud-e') as string;
    const fn = this.handlers.get(handlerId);
    if (fn !== undefined) {
      fn(e, el);
    }
  }
}

export const delegate: Delegate = new EventDelegate();
