/**
 * Criterion 13 of BUG-48: the shell's script on a real DOM, fed with simulated messages. The page
 * is the real `shellPage()`; its WebSocket is replaced before it runs by one the test drives, which
 * records what the shell sends.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BrowserLike, PageLike } from '../../src/browser.js';
import type { BenchMessage, ResultMessage, SessionMessage } from '../../src/protocol.js';
import { shellPage } from '../../src/shell.js';
import { chrome } from '../helpers/bench.js';

/** A 2×1 PNG, so the marks have a natural size to be placed against. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZGBgAJ/YE/E8f0zUAAAAASUVORK5CYII=',
  'base64',
);

const FAKE_SOCKET = `
window.__sent = [];
window.__opened = [];
window.WebSocket = class {
  constructor(url) { window.__socket = this; this.url = url; this.readyState = 0;
    setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
  send(data) { window.__sent.push(JSON.parse(data)); }
  close() {}
};
window.__deliver = (m) => window.__socket.onmessage({ data: JSON.stringify(m) });
window.__drop = () => { window.__socket.readyState = 3; window.__socket.onclose(); };
window.addEventListener('message', (e) => { if (e.data && e.data.type === 'fudic:open') window.__opened.push(e.data); });
`;

let browser: BrowserLike;
let server: Server;
let origin: string;
let page: PageLike | undefined;

beforeAll(async () => {
  browser = await chrome();
  server = createServer((req, res) => {
    if (req.url?.startsWith('/shot')) res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    else if (req.url?.startsWith('/__bench/app-card/')) res.writeHead(200, { 'content-type': 'text/html' }).end(shellPage());
    else res.writeHead(200, { 'content-type': 'text/html' }).end('<p>the page</p>');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

beforeEach(() => {
  page = undefined;
});

afterEach(async () => {
  await page?.close();
});

async function shell(query = ''): Promise<PageLike> {
  page = await browser.newPage();
  await page.addInitScript(FAKE_SOCKET);
  expect(await page.goto(`${origin}/__bench/app-card/${query}`)).toBe(200);
  await page.waitFor('() => document.getElementById("state").textContent === "connected"', null);
  return page;
}

const deliver = (p: PageLike, message: BenchMessage | { v: 1; type: string }) => p.evaluate<void>('(m) => window.__deliver(m)', message);
const sent = (p: PageLike) => p.evaluate<Record<string, unknown>[]>('() => window.__sent');
const key = (p: PageLike, k: string, mods: Record<string, boolean> = {}) =>
  p.evaluate<void>('([k, mods]) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...mods }))', [k, mods]);
const click = (p: PageLike, selector: string) => p.evaluate<void>('(s) => document.querySelector(s).click()', selector);
const text = (p: PageLike, selector: string) => p.evaluate<string>('(s) => document.querySelector(s).textContent', selector);

function session(ids: readonly string[]): SessionMessage {
  return {
    v: 2,
    type: 'session',
    tag: 'app-card',
    spec: 'C:/p/src/app-card.fudspec',
    browser: 'chrome',
    diagnostics: [],
    criteria: ids.map((id, i) => ({
      id,
      route: `/app-card/${id}`,
      line: 3 + i * 5,
      steps: [
        { block: 'when' as const, text: 'click role:link', file: 'C:/p/fudic/terms/when/click.js' },
        { block: 'then' as const, text: `app-card says "${id}"`, file: 'C:/p/fudic/terms/then/text.js' },
      ],
    })),
  };
}

function result(id: string, verdict: ResultMessage['verdict'], extra: Partial<ResultMessage> = {}): ResultMessage {
  const pass = verdict === 'pass';
  return {
    v: 2,
    type: 'result',
    tag: 'app-card',
    id,
    verdict,
    ms: 12,
    steps: [
      { block: 'when', term: 'click', layer: 'workspace', args: [], pass: true, evidence: 'clicked' },
      { block: 'then', term: 'text', layer: 'workspace', args: [], pass, evidence: { expected: 'A title', actual: pass ? 'A title' : 'A tilte' } },
    ],
    shots: {},
    marks: [],
    pageErrors: [],
    ...extra,
  };
}

/** The cards as shown: by their CSS order, then by their place in the DOM. */
const shown = (p: PageLike) =>
  p.evaluate<string[]>(
    '() => [...document.querySelectorAll(".card")].map((c, i) => [Number(c.style.order), i, c.dataset.id]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((c) => c[2])',
  );

describe('the shell — criterion 13', () => {
  it('paints one card per criterion, with no iframe; a failing card goes before a passing one', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b', 'c']));
    expect(await p.evaluate<number>('() => document.querySelectorAll(".card").length')).toBe(3);
    await deliver(p, result('a', 'pass'));
    await deliver(p, result('b', 'fail'));
    await deliver(p, result('c', 'error', { error: 'the page answered 500', pageErrors: ['boom'] }));
    expect(await shown(p)).toEqual(['b', 'c', 'a']);
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe[src]").length')).toBe(0);
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe").length')).toBe(1);
    // A green card folds; a red one is open, the failing step with expected against actual.
    expect(await p.evaluate<string[]>('() => [...document.querySelectorAll(".card")].map((c) => c.dataset.open)')).toEqual([
      'false',
      'true',
      'true',
    ]);
    expect(await text(p, '.card[data-id=b] .steps li.bad .diff')).toBe('expected  A titleactual    A tilte');
    // From the first character where they part: "A ti|tle" against "A ti|lte".
    expect(await text(p, '.card[data-id=b] .steps li.bad .diff mark')).toBe('tle');
    expect(await text(p, '.card[data-id=c] .note')).toBe('the page answered 500\nboom');
    expect(await text(p, '#summary')).toBe('1/3 pass · chrome');
    expect(await p.evaluate<string>('() => document.title')).toBe('app-card · workbench');
  }, 60_000);

  it('a new session updates the cards in place: the ones that stay keep their node, new ones come, gone ones go', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b', 'c']));
    await deliver(p, result('a', 'pass'));
    await p.evaluate<void>('() => { document.querySelector(".card[data-id=a]").__kept = true; window.scrollTo(0, 0); }');
    // Unfolded by hand: that outlives the session.
    await click(p, '.card[data-id=a] .toggle');
    await deliver(p, session(['a', 'b', 'd']));
    expect(await p.evaluate<string[]>('() => [...document.querySelectorAll(".card")].map((c) => c.dataset.id)')).toEqual(['a', 'b', 'd']);
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a]").__kept === true')).toBe(true);
    expect(await p.evaluate<string>('() => document.querySelector(".card[data-id=a]").dataset.open')).toBe('true');
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe[src]").length')).toBe(0);
  }, 60_000);

  it('Live opens one iframe for the chosen criterion, reloads it on its result, and closes', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await click(p, '.card[data-id=b] .actions button:nth-child(3)');
    expect(await p.evaluate<boolean>('() => document.getElementById("live").hidden')).toBe(false);
    expect(await p.evaluate<string>('() => new URL(document.getElementById("live-frame").src).pathname')).toBe('/app-card/b');
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe[src]").length')).toBe(1);
    expect(await text(p, '#live-title')).toBe('b');
    await deliver(p, result('b', 'pass'));
    await deliver(p, session(['a', 'b']));
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe").length')).toBe(1);
    // Its card gone, Live closes.
    await deliver(p, session(['a']));
    expect(await p.evaluate<boolean>('() => document.getElementById("live").hidden')).toBe(true);
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe[src]").length')).toBe(0);
    await key(p, 'l');
    expect(await p.evaluate<boolean>('() => document.getElementById("live").hidden')).toBe(true);
    await click(p, '.card[data-id=a] .actions button:nth-child(3)');
    await click(p, '#live-close');
    expect(await p.evaluate<boolean>('() => document.getElementById("live").hidden')).toBe(true);
  }, 60_000);

  it('the buttons and the keys send the commands of the tag', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await click(p, '#run-all');
    await click(p, '#run-failing');
    await click(p, '#pause');
    await click(p, '#cancel');
    await click(p, '.card[data-id=a] .actions button:nth-child(1)');
    await click(p, '.card[data-id=a] .actions button:nth-child(2)');
    await deliver(p, { v: 2, type: 'state', tag: 'app-card', paused: true, pinned: 'a', pending: 2 });
    await click(p, '.card[data-id=a] .actions button:nth-child(2)');
    await key(p, 'r');
    await key(p, 'f');
    await key(p, 'p');
    await key(p, 'Escape');
    await key(p, 'r', { ctrlKey: true });
    await key(p, 'x');
    expect(await sent(p)).toEqual([
      { v: 2, tag: 'app-card', type: 'run' },
      { v: 2, tag: 'app-card', type: 'run', failing: true },
      { v: 2, tag: 'app-card', type: 'pause', paused: true },
      { v: 2, tag: 'app-card', type: 'cancel' },
      { v: 2, tag: 'app-card', type: 'run', ids: ['a'] },
      { v: 2, tag: 'app-card', type: 'pin', id: 'a' },
      { v: 2, tag: 'app-card', type: 'pin', id: null },
      { v: 2, tag: 'app-card', type: 'run' },
      { v: 2, tag: 'app-card', type: 'run', failing: true },
      { v: 2, tag: 'app-card', type: 'pause', paused: false },
      { v: 2, tag: 'app-card', type: 'cancel' },
    ]);
    expect(await text(p, '#pause')).toBe('Resume (2)');
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a]").classList.contains("pinned")')).toBe(true);
    expect(await text(p, '#summary')).toBe('0/2 pass · pinned: a · paused, 2 waiting · chrome');
    // Disconnected, nothing is sent.
    await p.evaluate<void>('() => window.__drop()');
    await click(p, '#run-all');
    expect(await sent(p)).toHaveLength(11);
    expect(await text(p, '#state')).toBe('disconnected — the workbench stopped');
  }, 60_000);

  it('j and k move the focus in the order shown, Enter folds, l opens Live', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b', 'c']));
    await deliver(p, result('a', 'pass'));
    await deliver(p, result('b', 'pass'));
    await deliver(p, result('c', 'fail'));
    const active = () => p.evaluate<string | undefined>('() => document.activeElement.dataset.id');
    await key(p, 'Enter');
    await key(p, 'j');
    expect(await active()).toBe('c');
    await key(p, 'j');
    expect(await active()).toBe('a');
    await key(p, 'k');
    await key(p, 'k');
    await key(p, 'k');
    expect(await active()).toBe('c');
    await key(p, 'Enter');
    expect(await p.evaluate<string>('() => document.querySelector(".card[data-id=c]").dataset.open')).toBe('false');
    await key(p, 'l');
    expect(await text(p, '#live-title')).toBe('c');
  }, 60_000);

  it('running marks the cards until their result or a cancel; was pass shows when a card gets worse', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await deliver(p, { v: 2, type: 'running', tag: 'app-card', ids: ['a', 'b'], trigger: { file: 'C:/p/src/app-card.fud', at: Date.now() } });
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a]").hasAttribute("data-running")')).toBe(true);
    expect(await text(p, '.card[data-id=a] .verdict')).toBe('running…');
    expect(await text(p, '#summary')).toMatch(/^0\/2 pass · after saving app-card\.fud .+ · chrome$/u);
    await deliver(p, result('a', 'fail', { was: 'pass' }));
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a] .was").hidden')).toBe(false);
    expect(await text(p, '.card[data-id=a] .was')).toBe('was pass');
    await deliver(p, { v: 2, type: 'cancelled', tag: 'app-card', ids: ['b'] });
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=b]").hasAttribute("data-running")')).toBe(false);
    expect(await text(p, '#summary')).toMatch(/^0\/2 pass · \d+\.\d s · after saving/u);
    await deliver(p, result('b', 'pass', { was: 'fail' }));
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=b] .was").hidden')).toBe(true);
  }, 60_000);

  it('an ignored step is dimmed and says why; shots carry a box per mark', async () => {
    const p = await shell();
    await deliver(p, session(['a']));
    await deliver(
      p,
      result('a', 'pass', {
        steps: [
          { block: 'when', term: 'route', layer: 'workspace', args: [], pass: true, evidence: null, ignored: true },
          { block: 'then', term: 'text', layer: 'workspace', args: [], error: 'app-card matches 2 elements' },
        ],
        shots: { before: '/shot/before.png', after: '/shot/after.png' },
        marks: [{ step: 1, ref: 'app-card', box: { x: 1, y: 0, width: 1, height: 1 } }],
      }),
    );
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a] .steps li").classList.contains("ignored")')).toBe(true);
    expect(await text(p, '.card[data-id=a] .steps li .evidence')).toBe(' (does not apply in the workbench)');
    expect(await text(p, '.card[data-id=a] .steps li:nth-child(2) .evidence')).toBe(' → app-card matches 2 elements');
    expect(await p.evaluate<number>('() => document.querySelectorAll(".card[data-id=a] .shots img").length')).toBe(2);
    await p.waitFor('() => document.querySelector(".card[data-id=a] .box") !== null', null);
    expect(await p.evaluate<string[]>('() => { const b = document.querySelector(".card[data-id=a] .box").style; return [b.left, b.top, b.width, b.height]; }')).toEqual([
      '50%',
      '0%',
      '50%',
      '100%',
    ]);
    // Hovering a step lights its box.
    await p.evaluate<void>('() => document.querySelector(".card[data-id=a] .steps li:nth-child(2)").dispatchEvent(new MouseEvent("mouseenter"))');
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a] .box").classList.contains("hot")')).toBe(true);
  }, 60_000);

  it('the titles, steps and diagnostics link to their files: vscode:// in a browser', async () => {
    const p = await shell();
    await deliver(p, {
      ...session(['a']),
      diagnostics: [{ code: 'FUD0933', severity: 'error', message: 'no then', file: 'C:/p/src/app-card.fudspec', line: 3, column: 1 }],
    });
    expect(await p.evaluate<string>('() => document.querySelector(".card[data-id=a] .title").getAttribute("href")')).toBe(
      'vscode://file/C:/p/src/app-card.fudspec:3',
    );
    expect(await p.evaluate<string>('() => document.querySelector(".card[data-id=a] .steps a").getAttribute("href")')).toBe(
      'vscode://file/C:/p/fudic/terms/when/click.js:1',
    );
    expect(await text(p, '#diagnostics li')).toBe('FUD0933 no then — app-card.fudspec:3');
  }, 60_000);

  it('inside VS Code a link asks the editor instead, and the theme follows the editor', async () => {
    const p = await shell('?host=vscode&theme=dark');
    expect(await p.evaluate<string>('() => document.documentElement.dataset.theme')).toBe('dark');
    await deliver(p, session(['a']));
    await click(p, '.card[data-id=a] .title');
    await p.waitFor('() => window.__opened.length === 1', null);
    expect(await p.evaluate<unknown[]>('() => window.__opened')).toEqual([{ type: 'fudic:open', file: 'C:/p/src/app-card.fudspec', line: 3 }]);
    await p.evaluate<void>('() => window.postMessage({ type: "fudic:theme", theme: "light" }, "*")');
    await p.waitFor('() => document.documentElement.dataset.theme === "light"', null);
  }, 60_000);

  it('ignores what is not v: 2, and shows a problem', async () => {
    const p = await shell();
    await deliver(p, { v: 1, type: 'session' });
    expect(await p.evaluate<number>('() => document.querySelectorAll(".card").length')).toBe(0);
    await deliver(p, { v: 2, type: 'problem', message: 'Chrome went away' });
    expect(await text(p, '#problem')).toBe('Chrome went away');
  }, 60_000);
});
