/**
 * The view a chat that speaks MCP Apps draws (criterion 1): one resource, `ui://fudic/view.html`,
 * of type `text/html;profile=mcp-app`, a single HTML page that asks for nothing over the network,
 * and that draws a render in a sandboxed iframe and a look side by side.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { VIEW_META_KEY, VIEW_TOOL_META, VIEW_URI, viewHtml } from '../src/apps.js';
import { createServer } from '../src/server.js';
import { viewPage } from '../src/view/page.js';
import { connect, fakeProject } from './helpers.js';

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

async function client(entry: 'stdio' | 'http'): Promise<Client> {
  const c = await connect(createServer({ project: fakeProject(), entry }));
  clients.push(c);
  return c;
}

/** The code of the page's one inline module. */
function scriptOf(page: string): string {
  const match = /<script type="module">([\s\S]*)<\/script>/u.exec(page);
  expect(match).not.toBeNull();
  return match![1]!;
}

describe('the resource (criterion 1)', () => {
  it('both entries declare ui://fudic/view.html as an MCP App', async () => {
    expect(VIEW_URI).toBe('ui://fudic/view.html');
    expect(VIEW_TOOL_META).toEqual({ ui: { resourceUri: 'ui://fudic/view.html' } });
    for (const entry of ['stdio', 'http'] as const) {
      const { resources } = await (await client(entry)).listResources();
      expect(resources).toEqual([
        expect.objectContaining({ uri: VIEW_URI, name: 'fudic view', mimeType: 'text/html;profile=mcp-app' }),
      ]);
    }
  });

  it('reads as one HTML page of type text/html;profile=mcp-app', async () => {
    const { contents } = await (await client('stdio')).readResource({ uri: VIEW_URI });
    expect(contents).toHaveLength(1);
    const [content] = contents as { uri: string; mimeType: string; text: string }[];
    expect(content).toEqual({ uri: VIEW_URI, mimeType: 'text/html;profile=mcp-app', text: viewHtml() });
    expect(content!.text.startsWith('<!doctype html>')).toBe(true);
  });

  it('asks for nothing over the network: no external script, stylesheet, image, fetch or import', () => {
    const page = viewHtml();
    expect(page).not.toMatch(/<script[^>]*\bsrc=/iu);
    expect(page).not.toMatch(/<link\b/iu);
    expect(page).not.toMatch(/\bsrc=["']?https?:/iu);
    expect(page).not.toMatch(/\bfetch\s*\(/u);
    expect(page).not.toMatch(/\bimport\s*\(/u);
    expect(page).not.toMatch(/XMLHttpRequest|new WebSocket|EventSource|sendBeacon/u);
    expect(page).not.toMatch(/@import/u);
    // The only module is inline, and the bundle's export became a binding of App.
    expect(page.match(/<script/giu)).toHaveLength(1);
    expect(scriptOf(page)).not.toMatch(/\bexport\s*\{/u);
    expect(scriptOf(page)).toMatch(/\nconst App = [\w$]+;\n/u);
  });

  it('is built once', () => {
    expect(viewHtml()).toBe(viewHtml());
  });
});

describe('the page around the bundle', () => {
  it('turns the export of App into a binding, whatever else the bundle exports', () => {
    const page = viewPage('class Q {}\nconst z = 1;\nexport{z as Other, Q as App};\n');
    const code = scriptOf(page);
    expect(code.startsWith('class Q {}\nconst z = 1;\n\nconst App = Q;\n')).toBe(true);
    expect(code).not.toMatch(/export/u);
  });

  it('throws when the bundle exports nothing, or not App', () => {
    expect(() => viewPage('class Q {}')).toThrow('the MCP Apps bundle does not export App');
    expect(() => viewPage('class Q {}\nexport{Q as Other}')).toThrow('the MCP Apps bundle does not export App');
  });

  it('cannot be closed early by a </script inside the bundle', () => {
    const page = viewPage('const s = "</script><b>";\nclass Q {}\nexport{Q as App};');
    expect(page.match(/<\/script/giu)).toHaveLength(1);
    expect(page).toContain('"<\\/script><b>"');
  });
});

/** Just enough of a DOM to run the view's code outside a browser. */
class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly style: Record<string, string> = {};
  textContent = '';
  className = '';
  title = '';
  srcdoc = '';
  src = '';
  alt = '';
  contentDocument: { documentElement: { scrollHeight: number } } | null = null;

  constructor(readonly tag: string) {}

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(): void {
    this.children.length = 0;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  /** Every element under this one, depth first. */
  all(): FakeElement[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
}

interface FakeApp {
  readonly info: unknown;
  connected: boolean;
  ontoolresult: (result: unknown) => void;
}

/** Runs the page with a stand-in for App, and returns its root and the app it created. */
async function run(): Promise<{ root: FakeElement; app: FakeApp }> {
  const bundle = [
    'class StandIn {',
    '  constructor(info) { this.info = info; this.connected = false; register(this); }',
    '  async connect() { this.connected = true; }',
    '}',
    'export{StandIn as App};',
  ].join('\n');
  const root = new FakeElement('div');
  const document = {
    getElementById: (id: string) => (id === 'root' ? root : null),
    createElement: (tag: string) => new FakeElement(tag),
  };
  let app: FakeApp | undefined;
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<void>;
  await new AsyncFunction('document', 'register', scriptOf(viewPage(bundle)))(document, (a: FakeApp) => {
    app = a;
  });
  return { root, app: app! };
}

describe('what the view draws (criterion 1)', () => {
  it('connects as the fudic view and draws nothing until a result comes', async () => {
    const { root, app } = await run();
    expect(app.info).toEqual({ name: 'fudic view', version: '1' });
    expect(app.connected).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it('a render: the piece in a sandboxed iframe, as tall as its content', async () => {
    const { root, app } = await run();
    const html = '<acme-button><template shadowrootmode="open"><button>Save</button></template></acme-button>';
    app.ontoolresult({ _meta: { [VIEW_META_KEY]: { kind: 'render', html } } });
    expect(root.children).toHaveLength(1);
    const frame = root.children[0]!;
    expect(frame.tag).toBe('iframe');
    expect(frame.srcdoc).toBe(html);
    expect(frame.attributes.get('sandbox')).toBe('allow-same-origin');
    // Scripts stay off in the frame: the sandbox does not allow them.
    expect(frame.attributes.get('sandbox')).not.toMatch(/allow-scripts/u);
    frame.contentDocument = { documentElement: { scrollHeight: 120 } };
    frame.listeners.get('load')!();
    expect(frame.style['height']).toBe('120px');
    // A frame whose document is out of reach keeps its height.
    frame.contentDocument = null;
    frame.style['height'] = '';
    frame.listeners.get('load')!();
    expect(frame.style['height']).toBe('');
  });

  it('a look: each case with its verdict and its before and after side by side', async () => {
    const { root, app } = await run();
    app.ontoolresult({
      _meta: {
        [VIEW_META_KEY]: {
          kind: 'look',
          cases: [
            { case: 'primary', verdict: 'changed', before: 'data:image/png;base64,AA', after: 'data:image/png;base64,BB' },
            { case: 'big', verdict: 'new', after: 'data:image/png;base64,CC' },
          ],
        },
      },
    });
    const sections = root.all().filter((e) => e.tag === 'section');
    expect(sections).toHaveLength(2);

    const [primary, big] = sections;
    const heading = (s: FakeElement) => s.children.find((e) => e.tag === 'h2')!;
    expect(heading(primary!).textContent).toBe('primary — changed');
    expect(heading(primary!).className).toBe('changed');
    const pair = primary!.children.find((e) => e.className === 'pair')!;
    expect(pair.children.map((f) => f.tag)).toEqual(['figure', 'figure']);
    const imgs = pair.all().filter((e) => e.tag === 'img');
    expect(imgs.map((i) => [i.src, i.alt])).toEqual([
      ['data:image/png;base64,AA', 'before'],
      ['data:image/png;base64,BB', 'after'],
    ]);

    // A case with no before shows an empty place where it would be.
    expect(heading(big!).textContent).toBe('big — new');
    const figures = big!.all().filter((e) => e.tag === 'figure');
    expect(figures[0]!.children.map((e) => [e.tag, e.textContent, e.className])).toEqual([
      ['div', 'none', 'empty'],
      ['figcaption', 'before', ''],
    ]);
    expect(figures[1]!.children[0]!.tag).toBe('img');
  });

  it('anything else: says there is nothing to show, and replaces what was there', async () => {
    const { root, app } = await run();
    app.ontoolresult({ _meta: { [VIEW_META_KEY]: { kind: 'render', html: '<p>x</p>' } } });
    for (const result of [null, {}, { _meta: {} }, { _meta: { [VIEW_META_KEY]: { kind: 'other' } } }]) {
      app.ontoolresult(result);
      expect(root.children).toHaveLength(1);
      expect(root.children[0]!.textContent).toBe('Nothing to show.');
    }
  });
});
