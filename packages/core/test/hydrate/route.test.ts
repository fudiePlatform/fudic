/**
 * SDD-39 §6.9–§6.13 — the runtime raises a route.
 *
 * Nothing new in the engine, and that is the claim under test: the same capturer, the same
 * three paths, the same cascade. What changes is the root — the `<body>` instead of a shadow
 * root — and the name, which comes out of a JSON block instead of a `localName`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { installHydration, HYDRATED_EVENT, type HydratedDetail } from '../../src/hydrate/install.js';
import { startWarmObserver } from '../../src/hydrate/warm/observer.js';
import { host, publish, TestRegistry } from './_page.js';

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function click(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
}

interface Run {
  readonly trace: string[];
  readonly hydrated: HydratedDetail[];
  /** The props array the route's factory was handed. */
  readonly props: unknown[][];
}

/**
 * Install the runtime with a fake network. A URL that names the route answers with a MODULE
 * whose default export is the factory — which is the whole difference with a tag, whose chunk
 * answers with a `customElements.define` side effect.
 */
function run(routeName: string): Run {
  const trace: string[] = [];
  const hydrated: HydratedDetail[] = [];
  const props: unknown[][] = [];
  document.addEventListener(HYDRATED_EVENT, (e) => {
    hydrated.push((e as CustomEvent<HydratedDetail>).detail);
  });

  const registry = new TestRegistry();
  installHydration({
    root: document,
    document,
    registry,
    resolveChunk: (name) => name,
    importModule: async (url) => {
      trace.push(`fetch:${url}`);
      if (url === routeName) {
        return {
          default: (p: readonly unknown[]) => {
            props.push([...p]);
            return {
              h: (): void => {
                trace.push('h:route');
                // What a real chunk does in `$s()`: hook a listener up. It is the only thing
                // that can prove the replay, since the runtime cancelled the first gesture.
                document.body.addEventListener('click', () => trace.push('handler:route'));
              },
              u: (): void => {},
              r: (): void => {},
            };
          },
        };
      }
      registry.define(
        url,
        class extends HTMLElement {
          h(slice: readonly unknown[]): void {
            trace.push(`h:${url}#${this.getAttribute('data-fud-id')}:${JSON.stringify(slice)}`);
            this.shadowRoot?.addEventListener('click', () => trace.push(`handler:${url}`));
          }
        },
      );
      return undefined;
    },
  });
  return { trace, hydrated, props };
}

describe('the route takes path 2 whole (§6.10)', () => {
  beforeEach(() => {
    publish();
  });

  it('downloads its chunk, raises it and replays the gesture once', async () => {
    publish({ route: 'ruta', bodyId: 0, state: [[0, 0], []] });
    const button = document.createElement('button');
    document.body.appendChild(button);
    const r = run('ruta');

    click(button);
    await settle();

    expect(r.trace).toEqual(['fetch:ruta', 'h:route', 'handler:route']);
    expect(r.hydrated.map((h) => h.tag)).toEqual(['ruta']);
  });

  it('hands the factory `[$dom, $root, $data, …]` with the `<body>` as the root', async () => {
    publish({ route: 'ruta', bodyId: 0, data: { user: 'pedro' }, state: [[0, 1], [7]] });
    const button = document.createElement('button');
    document.body.appendChild(button);
    const r = run('ruta');

    click(button);
    await settle();

    const [dom, root, data, ...slice] = r.props[0]!;
    expect(dom).toBeDefined();
    expect(root).toBe(document.body);
    expect(data).toEqual({ user: 'pedro' });
    expect(slice).toEqual([7]);
  });

  it('raises what it hands values to first, by the LIGHT — the `<body>` has no shadow (§6.9)', async () => {
    publish({
      route: 'ruta',
      bodyId: 1,
      tree: { ruta: ['ins-child'] },
      state: [[0, 1, 1], [{ $: [1, 0] }]],
    });
    host('ins-child', 0);
    const button = document.createElement('button');
    document.body.appendChild(button);
    const r = run('ruta');

    click(button);
    await settle();

    // Post-order: the child the route hands a cell to is alive before the route is.
    expect(r.trace.indexOf('fetch:ins-child')).toBeLessThan(r.trace.indexOf('h:route'));
    expect(r.trace).toContain('h:ins-child#0:[null]');
  });
});

describe('a chunk that answers with something else', () => {
  beforeEach(() => {
    publish();
  });

  it('leaves the page as the server painted it, and still replays the gesture', async () => {
    publish({ route: 'ruta', bodyId: 0, state: [[0, 0], []] });
    const button = document.createElement('button');
    document.body.appendChild(button);
    const trace: string[] = [];
    document.body.addEventListener('click', () => trace.push('handler'));
    installHydration({
      root: document,
      document,
      registry: new TestRegistry(),
      resolveChunk: (name) => name,
      // A module with no default export: a stale URL, a redirect, an HTML error page.
      importModule: async () => ({}),
    });

    click(button);
    await settle();

    // Nothing threw, nothing came up, and the click the runtime cancelled happened anyway.
    expect(trace).toEqual(['handler']);
  });
});

describe('the `<body>` is a backstop, never a competitor (§6.11)', () => {
  beforeEach(() => {
    publish();
  });

  it('a click inside a hydratable component raises the component and not the route', async () => {
    publish({ route: 'ruta', bodyId: 1, state: [[0, 1, 1], ['C']] });
    const component = host('ins-card', 0);
    const inner = document.createElement('button');
    component.shadowRoot!.appendChild(inner);
    const r = run('ruta');

    click(inner);
    await settle();

    // The capturer keeps the FIRST `[data-fud-id]` of the composed path, and the component is
    // below the `<body>`: the route is never asked for.
    expect(r.trace).not.toContain('fetch:ruta');
    expect(r.hydrated.map((h) => h.tag)).toEqual(['ins-card']);
  });
});

describe('a page with no route asks for none (§6.12)', () => {
  beforeEach(() => {
    publish();
  });

  it('a click anywhere downloads nothing', async () => {
    publish({});
    const button = document.createElement('button');
    document.body.appendChild(button);
    const r = run('ruta');

    click(button);
    await settle();

    expect(r.trace).toEqual([]);
  });

  it('and a `<body>` carrying an id with no block published is not a route either', async () => {
    // The page says nothing about a route, so there is nothing to resolve a chunk from: the
    // gesture falls through as it does on any element the runtime does not own.
    publish({ bodyId: 0, state: [[0, 0], []] });
    const button = document.createElement('button');
    document.body.appendChild(button);
    const r = run('ruta');

    click(button);
    await settle();

    // It is treated as the tag it claims to be, and `body` is a tag no chunk ever defines.
    expect(r.trace).not.toContain('fetch:ruta');
    expect(r.trace).not.toContain('h:route');
  });
});

describe('the warm observer does not look at the `<body>` (§6.13)', () => {
  beforeEach(() => {
    publish();
  });

  it('orders a component in view and never the route', () => {
    publish({ route: 'ruta', bodyId: 1, state: [[0, 1, 1], ['C']] });
    host('ins-card', 0);
    const ordered: string[][] = [];
    startWarmObserver({
      maps: {
        tree: {},
        bus: {},
        eager: [],
        route: 'ruta',
        data: {},
        count: 2,
        slice: () => [],
      },
      resolveChunk: (tag) => tag,
      channel: { warm: (_urls, tags) => ordered.push([...tags]) },
      root: document,
      // Everything the observer was handed is «visible», which is what isolates the FILTER:
      // if the `<body>` reached the observer at all it would be warmed here.
      observe: (targets, onVisible) => {
        for (const target of targets) onVisible(target);
      },
      schedule: (task) => {
        task();
      },
    });

    expect(ordered).toEqual([['ins-card']]);
  });
});

describe('a route that comes up without a gesture (§4.6)', () => {
  beforeEach(() => {
    publish();
  });

  it('is raised at install when its name is in `fud-eager`', async () => {
    publish({ route: 'ruta', bodyId: 0, eager: ['ruta'], state: [[0, 0], []] });
    const r = run('ruta');

    await settle();

    expect(r.trace).toEqual(['fetch:ruta', 'h:route']);
  });

  it('and is not raised twice when a gesture follows', async () => {
    publish({ route: 'ruta', bodyId: 0, eager: ['ruta'], state: [[0, 0], []] });
    const button = document.createElement('button');
    document.body.appendChild(button);
    const r = run('ruta');
    await settle();

    click(button);
    await settle();

    expect(r.trace.filter((t) => t === 'h:route')).toHaveLength(1);
  });
});
