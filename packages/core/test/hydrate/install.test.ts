import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  installHydration,
  HYDRATED_EVENT,
  READY_EVENT,
  type HydratedDetail,
} from '../../src/hydrate/install.js';
import { host, publish, TestRegistry } from './_page.js';

/** One macrotask turn drains every microtask the runtime chained; two, with room to spare. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function click(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
}

/**
 * The application area of one test. The capturer goes HERE and not on the document, so a
 * capturer left over from an earlier test cannot swallow this one's gesture — which is
 * exactly what `stopImmediatePropagation` would do to a second listener on the same node.
 */
let app: HTMLElement;

interface Run {
  readonly trace: string[];
  readonly hydrated: HydratedDetail[];
  readonly ready: number;
}

/**
 * Install the runtime over the document as it stands, with a fake network that defines the
 * tag it is asked for and records the order.
 *
 * Every fake chunk hooks a `click` listener onto its own shadow root, which is what a real
 * one does through `$s()`. That listener is the only thing that can prove the replay: the
 * runtime cancelled the original gesture, so a handler that runs at all runs on the replay.
 */
function run(): Run {
  const trace: string[] = [];
  const hydrated: HydratedDetail[] = [];
  let ready = 0;
  document.addEventListener(READY_EVENT, () => {
    ready += 1;
  });
  document.addEventListener(HYDRATED_EVENT, (e) => {
    hydrated.push((e as CustomEvent<HydratedDetail>).detail);
  });

  const registry = new TestRegistry();
  installHydration({
    root: app,
    document,
    registry,
    resolveChunk: (tag) => tag,
    importModule: async (tag) => {
      trace.push(`define:${tag}`);
      registry.define(
        tag,
        class extends HTMLElement {
          h(props: readonly unknown[]): void {
            trace.push(`h:${tag}#${this.getAttribute('data-fud-id')}:${JSON.stringify(props)}`);
            this.shadowRoot?.addEventListener('click', () => {
              trace.push(`handler:${tag}#${this.getAttribute('data-fud-id')}`);
            });
          }
        },
      );
    },
  });

  return {
    trace,
    hydrated,
    get ready(): number {
      return ready;
    },
  };
}

describe('the runtime installed', () => {
  beforeEach(() => {
    publish();
    app = document.createElement('div');
    document.body.appendChild(app);
  });

  it('announces itself with zero component JavaScript evaluated', () => {
    const r = run();
    expect(r.ready).toBe(1);
    expect(r.trace).toEqual([]);
  });

  it('path 2 in full: bus, then the subtree, then the host, then the replay', async () => {
    publish({
      bus: { 'ins-emitter': ['ins-cart'] },
      tree: { 'ins-emitter': ['ins-item'] },
      state: [[0, 1, 2, 3], ['E', 'I', 'C']],
    });
    app = document.createElement('div');
    document.body.appendChild(app);
    const emitter = host('ins-emitter', 0, app);
    host('ins-item', 1, emitter.shadowRoot!);
    host('ins-cart', 2, app);
    const button = document.createElement('button');
    emitter.shadowRoot!.appendChild(button);

    const r = run();
    click(button);
    await settle();

    expect(r.trace).toEqual([
      'define:ins-cart',
      'h:ins-cart#2:["C"]',
      'define:ins-item',
      'h:ins-item#1:["I"]',
      'define:ins-emitter',
      'h:ins-emitter#0:["E"]',
      'handler:ins-emitter#0',
    ]);
    expect(r.hydrated.map((d) => `${d.from}:${d.tag}#${d.id}`)).toEqual([
      'bus:ins-cart#2',
      'subtree:ins-item#1',
      'downloaded:ins-emitter#0',
    ]);
  });

  it('the eager list comes up with no gesture, and nothing else does (SDD-34 §6.16)', async () => {
    // The one hydration in the framework the user does not conduct. A form-associated element
    // that is not defined is not labelable, adds nothing to a `FormData` and has no validity,
    // so a `<label for>` aimed at it is aimed at an element that participates in nothing.
    publish({ eager: ['ins-input'], state: [[0, 1, 2], ['A', 'B']] });
    app = document.createElement('div');
    document.body.appendChild(app);
    host('ins-input', 0, app);
    const plain = host('ins-plain', 1, app);

    const r = run();
    await settle();

    // Defined and hydrated before anything was touched — and only it.
    expect(r.trace).toEqual(['define:ins-input', 'h:ins-input#0:["A"]']);

    // The plain component of the same page still has no JavaScript until it is touched.
    click(plain);
    await settle();
    expect(r.trace).toContain('define:ins-plain');
  });

  it('an eager tag drags its subtree up with it, in the same order a gesture would', async () => {
    publish({
      eager: ['ins-form'],
      tree: { 'ins-form': ['ins-field'] },
      state: [[0, 1, 2], ['F', 'I']],
    });
    app = document.createElement('div');
    document.body.appendChild(app);
    const form = host('ins-form', 0, app);
    host('ins-field', 1, form.shadowRoot!);

    const r = run();
    await settle();

    // Post-order, exactly as path 2 does it: the subtree before the host.
    expect(r.trace).toEqual([
      'define:ins-field',
      'h:ins-field#1:["I"]',
      'define:ins-form',
      'h:ins-form#0:["F"]',
    ]);
    // No replay: there was no gesture to replay.
    expect(r.trace.some((t) => t.startsWith('handler:'))).toBe(false);
  });

  it('a page with no eager list brings nothing up on its own', async () => {
    const only = host('ins-quiet', 0, app);
    const r = run();
    await settle();
    expect(r.trace).toEqual([]);
    click(only);
    await settle();
    expect(r.trace).toContain('define:ins-quiet');
  });

  it('a second instance of the same tag shares the chunk and reports it, without a replay', async () => {
    const first = host('ins-twin', 0, app);
    const second = host('ins-twin', 1, app);

    const r = run();
    click(first);
    await settle();
    click(second);
    await settle();

    expect(r.trace.filter((t) => t.startsWith('define:'))).toEqual(['define:ins-twin']);
    const shared = r.hydrated.at(-1);
    expect(shared?.from).toBe('shared-chunk');
    expect(shared?.ms).toBe('0.0');
    expect(shared?.id).toBe(1);
  });

  it('one interaction, one execution: further clicks belong to the component alone', async () => {
    const el = host('ins-solo', 0, app);
    const button = document.createElement('button');
    el.shadowRoot!.appendChild(button);

    const r = run();
    for (let i = 0; i < 3; i += 1) {
      click(button);
      await settle();
    }

    // Three clicks, three handler runs: the first through the replay, the next two straight
    // to the component's own listener. And exactly one `fud:hydrated`.
    expect(r.trace.filter((t) => t.startsWith('handler:'))).toHaveLength(3);
    expect(r.hydrated).toHaveLength(1);
  });

  it('a page with no warm channel orders no network, and hydrates the same', () => {
    // The observer is a separate axis: with no channel there is nothing to observe FOR,
    // and warm is an optimization, never a requirement (§4.7).
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {
        throw new Error('a page with no channel must not observe anything');
      }
    });
    try {
      host('ins-quiet', 0, app);
      expect(() => run()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with a channel it warms what is visible, closure included, out of the gesture', () => {
    publish({ tree: { 'ins-warm': ['ins-warm-kid'] } });
    app = document.createElement('div');
    document.body.appendChild(app);
    host('ins-warm', 0, app);

    const orders: string[][] = [];
    const scrollIntoView: (() => void)[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly #callback: (entries: unknown[]) => void;
        constructor(callback: (entries: unknown[]) => void) {
          this.#callback = callback;
        }
        observe(target: Element): void {
          scrollIntoView.push(() => this.#callback([{ isIntersecting: true, target }]));
        }
        unobserve(): void {
          // one entry, one order
        }
      },
    );
    const idle: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (task: () => void) => idle.push(task));
    try {
      installHydration({
        root: app,
        document,
        registry: new TestRegistry(),
        resolveChunk: (tag) => `/h/${tag}.js`,
        warm: { warm: (_urls, tags) => orders.push([...tags]) },
      });

      scrollIntoView.forEach((show) => show());
      expect(orders).toEqual([]); // idle, not now
      idle.forEach((task) => task());

      expect(orders).toEqual([['ins-warm', 'ins-warm-kid']]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with no ports named it uses the page: its document and its element registry', async () => {
    // The tag is already in the PLATFORM registry, so this is path 3 end to end over the
    // defaults — the document that publishes the blocks and receives the events, and the
    // registry that answers "is this defined?". Nothing is downloaded, so the default
    // `import()` is never reached, which is the only piece a unit test cannot exercise.
    customElements.define('ins-default', class extends HTMLElement {});
    const el = host('ins-default', 0, app);

    const seen: HydratedDetail[] = [];
    document.addEventListener(HYDRATED_EVENT, (e) => {
      seen.push((e as CustomEvent<HydratedDetail>).detail);
    });
    installHydration({ root: app, resolveChunk: (tag) => tag });

    click(el);
    await settle();

    expect(seen.at(-1)).toEqual({ id: 0, tag: 'ins-default', ms: '0.0', from: 'shared-chunk' });
  });
});
