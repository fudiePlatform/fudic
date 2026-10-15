/**
 * Criterion 13 of BUG-48: the shell's script on a real DOM, fed with simulated messages. The page
 * is the real `shellPage()`; its WebSocket is replaced before it runs by one the test drives, which
 * records what the shell sends, and what it posts to its parent (the editor) is recorded too.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BrowserLike, PageLike } from '../../src/browser.js';
import type { BenchMessage, ResultMessage, SessionMessage } from '../../src/protocol.js';
import { shellPage } from '../../src/shell.js';
import { chrome } from '../helpers/bench.js';

/** A 2×1 PNG: the shell sizes a shot by what the result announces, not by the image. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZGBgAJ/YE/E8f0zUAAAAASUVORK5CYII=',
  'base64',
);

const FAKE_SOCKET = `
window.__sent = [];
window.__posted = [];
window.WebSocket = class {
  constructor(url) { window.__socket = this; this.url = url; this.readyState = 0;
    setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
  send(data) { window.__sent.push(JSON.parse(data)); }
  close() {}
};
window.__deliver = (m) => window.__socket.onmessage({ data: JSON.stringify(m) });
window.__drop = () => { window.__socket.readyState = 3; window.__socket.onclose(); };
window.addEventListener('message', (e) => { if (e.data && typeof e.data.type === 'string' && e.data.type !== 'fudic:theme') window.__posted.push(e.data); });
`;

const SPEC = 'C:/p/src/app-card.fudspec';

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

async function load(p: PageLike, query: string): Promise<void> {
  expect(await p.goto(`${origin}/__bench/app-card/${query}`)).toBe(200);
  await p.waitFor('() => document.getElementById("state").textContent === "connected"', null);
}

async function shell(query = ''): Promise<PageLike> {
  page = await browser.newPage();
  await page.addInitScript(FAKE_SOCKET);
  await load(page, query);
  return page;
}

const deliver = (p: PageLike, message: BenchMessage | { v: 1; type: string }) => p.evaluate<void>('(m) => window.__deliver(m)', message);
const sent = (p: PageLike) => p.evaluate<Record<string, unknown>[]>('() => window.__sent');
const posted = (p: PageLike) => p.evaluate<Record<string, unknown>[]>('() => window.__posted');
const key = (p: PageLike, k: string, mods: Record<string, boolean> = {}) =>
  p.evaluate<void>('([k, mods]) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...mods }))', [k, mods]);
const click = (p: PageLike, selector: string) => p.evaluate<void>('(s) => document.querySelector(s).click()', selector);
const text = (p: PageLike, selector: string) => p.evaluate<string>('(s) => document.querySelector(s).textContent', selector);
const attr = (p: PageLike, selector: string, name: string) =>
  p.evaluate<string | null>('([s, n]) => document.querySelector(s).getAttribute(n)', [selector, name]);
const has = (p: PageLike, selector: string) => p.evaluate<boolean>('(s) => document.querySelector(s) !== null', selector);
const all = (p: PageLike, selector: string, script: string) =>
  p.evaluate<unknown[]>(`(s) => [...document.querySelectorAll(s)].map(${script})`, selector);
const opens = (p: PageLike) => all(p, '.card', '(c) => c.dataset.open');

function session(ids: readonly string[], extra: Partial<SessionMessage> = {}): SessionMessage {
  return {
    v: 2,
    type: 'session',
    tag: 'app-card',
    spec: SPEC,
    browser: 'chrome',
    diagnostics: [],
    criteria: ids.map((id, i) => ({
      id,
      route: `/app-card/${id}`,
      line: 3 + i * 5,
      props: null,
      steps: [
        { block: 'when' as const, text: 'click role:link', file: 'C:/p/fudic/terms/when/click.js', line: 5 + i * 5 },
        { block: 'then' as const, text: `app-card says "${id}"`, file: 'C:/p/fudic/terms/then/text.js', line: 7 + i * 5 },
      ],
    })),
    ...extra,
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

const running = (ids: readonly string[], file: string | null = null): BenchMessage => ({
  v: 2,
  type: 'running',
  tag: 'app-card',
  ids,
  trigger: { file, at: Date.now() },
});

const SHOTS = {
  before: { url: '/shot/before.png', width: 10, height: 20 },
  after: { url: '/shot/after.png', width: 10, height: 20 },
};

/** The cards as shown: by their CSS order, then by their place in the DOM. */
const shown = (p: PageLike) =>
  p.evaluate<string[]>(
    '() => [...document.querySelectorAll(".card")].map((c, i) => [Number(c.style.order), i, c.dataset.id]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((c) => c[2])',
  );

describe('the header — criterion 13', () => {
  it('says the count, coloured; the browser and the viewport; whether the socket is up', async () => {
    const p = await shell();
    expect(await attr(p, '#state', 'data-up')).toBe('true');
    await deliver(p, session(['a', 'b'], { viewport: { width: 1280, height: 720, scale: 1 } }));
    expect(await text(p, '#title')).toBe('app-card');
    expect(await p.evaluate<string>('() => document.title')).toBe('app-card · workbench');
    expect([await text(p, '#count'), await attr(p, '#count', 'class')]).toEqual(['0/2 pass', '']);
    expect(await text(p, '#summary')).toBe('chrome · viewport 1280×720');
    await deliver(p, result('a', 'pass'));
    expect([await text(p, '#count'), await attr(p, '#count', 'class')]).toEqual(['1/2 pass', '']);
    await deliver(p, result('b', 'pass'));
    expect([await text(p, '#count'), await attr(p, '#count', 'class')]).toEqual(['2/2 pass', 'pass']);
    await deliver(p, result('b', 'error'));
    expect([await text(p, '#count'), await attr(p, '#count', 'class')]).toEqual(['1/2 pass', 'fail']);
    await p.evaluate<void>('() => window.__drop()');
    expect(await attr(p, '#state', 'data-up')).toBe('false');
    expect(await text(p, '#state')).toBe('disconnected — the workbench stopped');
  }, 60_000);

  it('says what ran, after saving what, and how long once it ended', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await deliver(p, running(['a', 'b'], 'C:/p/src/app-card.fud'));
    expect(await text(p, '#summary')).toMatch(/^after saving app-card\.fud \S.* · chrome$/u);
    await deliver(p, result('a', 'pass'));
    expect(await text(p, '#summary')).toMatch(/^after saving/u);
    await deliver(p, result('b', 'pass'));
    expect(await text(p, '#summary')).toMatch(/^\d+\.\d s · after saving app-card\.fud .+ · chrome$/u);
    // A run from a button has no file: only its time.
    await deliver(p, running(['a']));
    expect(await text(p, '#summary')).not.toContain('after saving');
  }, 60_000);

  it('the buttons and the keys send the commands of the tag; Pause turns Resume with what waits', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await click(p, '#run-all');
    await click(p, '#run-failing');
    await click(p, '#pause');
    await click(p, '#cancel');
    await click(p, '.card[data-id=a] .actions button:nth-child(1)');
    await click(p, '.card[data-id=a] .actions button:nth-child(2)');
    expect(await attr(p, '#pause', 'aria-pressed')).not.toBe('true');
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
    expect([await text(p, '#pause'), await attr(p, '#pause', 'aria-pressed')]).toEqual(['Resume (2)', 'true']);
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a]").classList.contains("pinned")')).toBe(true);
    expect(await attr(p, '.card[data-id=a] .actions button:nth-child(2)', 'aria-pressed')).toBe('true');
    expect(await attr(p, '.card[data-id=b] .actions button:nth-child(2)', 'aria-pressed')).toBe('false');
    expect(await text(p, '#summary')).toBe('chrome · pinned: a · paused, 2 waiting');
    await deliver(p, { v: 2, type: 'state', tag: 'app-card', paused: true, pinned: null, pending: 0 });
    expect([await text(p, '#pause'), await text(p, '#summary')]).toEqual(['Resume', 'chrome · paused']);
    await deliver(p, { v: 2, type: 'state', tag: 'app-card', paused: false, pinned: null, pending: 0 });
    expect([await text(p, '#pause'), await attr(p, '#pause', 'aria-pressed')]).toEqual(['Pause', 'false']);
    // Disconnected, nothing is sent.
    await p.evaluate<void>('() => window.__drop()');
    await click(p, '#run-all');
    expect(await sent(p)).toHaveLength(11);
  }, 60_000);

  it('the open-in-browser icon is there only inside VS Code, and asks the editor', async () => {
    const outside = await shell();
    expect(await p_hidden(outside, '#open-browser')).toBe(true);
    await outside.close();
    const p = await shell('?host=vscode');
    expect(await p_hidden(p, '#open-browser')).toBe(false);
    await click(p, '#open-browser');
    await p.waitFor('() => window.__posted.length === 1', null);
    expect(await posted(p)).toEqual([{ type: 'fudic:openInBrowser' }]);
  }, 60_000);
});

const p_hidden = (p: PageLike, selector: string) => p.evaluate<boolean>('(s) => document.querySelector(s).hidden', selector);

describe('the cards — criterion 13', () => {
  it('one per criterion, open whatever their verdict, with no iframe; the failing ones first', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b', 'c']));
    expect(await all(p, '.card', '(c) => c.dataset.id')).toEqual(['a', 'b', 'c']);
    expect(await all(p, '.card[data-id=a] .head > *', '(e) => e.className')).toEqual(['status', 'title', 'verdict', 'was', 'line', 'actions']);
    expect(await all(p, '.card[data-id=a] .actions button', '(b) => b.textContent')).toEqual(['▶ Run', '⊤ Pin', '◉ Live']);
    expect(await text(p, '.card[data-id=b] .line')).toBe('L8');
    expect(await attr(p, '.card[data-id=b] .line', 'href')).toBe(`vscode://file/${SPEC}:8`);
    await deliver(p, result('a', 'pass'));
    await deliver(p, result('b', 'fail'));
    await deliver(p, result('c', 'error', { error: 'the page answered 500', pageErrors: ['boom'] }));
    expect(await shown(p)).toEqual(['b', 'c', 'a']);
    expect(await opens(p)).toEqual(['true', 'true', 'true']);
    expect(await text(p, '.card[data-id=a] .verdict')).toBe('pass · 12 ms');
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe[src]").length')).toBe(0);
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe").length')).toBe(1);
    expect(await text(p, '.card[data-id=c] .note')).toBe('the page answered 500\nboom');
    expect(await p_hidden(p, '.card[data-id=a] .note')).toBe(true);
  }, 60_000);

  it('the head folds the card, but not from its links or buttons; Enter folds the focused one', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await click(p, '.card[data-id=a] .head');
    expect(await opens(p)).toEqual(['false', 'true']);
    // In a browser the title is a vscode:// link: kept from leaving the page, it still does not fold.
    await p.evaluate<void>('() => document.addEventListener("click", (e) => e.preventDefault())');
    await click(p, '.card[data-id=a] .head .title');
    await click(p, '.card[data-id=a] .actions button:nth-child(1)');
    expect(await opens(p)).toEqual(['false', 'true']);
    await click(p, '.card[data-id=a] .status');
    expect(await opens(p)).toEqual(['true', 'true']);
    // Enter or Space on a button is the button's, not a fold.
    await p.evaluate<void>('() => document.querySelector(".card[data-id=b]").focus()');
    await p.evaluate<void>('() => document.querySelector(".card[data-id=b] .actions button").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))');
    await p.evaluate<void>('() => document.querySelector(".card[data-id=b] .actions button").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))');
    expect(await opens(p)).toEqual(['true', 'true']);
    await key(p, 'Enter');
    expect(await opens(p)).toEqual(['true', 'false']);
  }, 60_000);

  it('a new session updates the cards in place, and what was folded by hand stays folded', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b', 'c']));
    await deliver(p, result('a', 'pass'));
    await p.evaluate<void>('() => { document.querySelector(".card[data-id=a]").__kept = true; }');
    await click(p, '.card[data-id=a] .head');
    await deliver(p, session(['a', 'b', 'd']));
    expect(await all(p, '.card', '(c) => c.dataset.id')).toEqual(['a', 'b', 'd']);
    expect(await p.evaluate<boolean>('() => document.querySelector(".card[data-id=a]").__kept === true')).toBe(true);
    expect(await opens(p)).toEqual(['false', 'true', 'true']);
    // Its last result is painted again on the new steps.
    expect(await text(p, '.card[data-id=a] .verdict')).toBe('pass · 12 ms');
    expect(await text(p, '.card[data-id=a] .steps li.then .mark')).toBe('✓');
  }, 60_000);

  it('a running card spins until its result or a cancel; was pass shows when it gets worse', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await deliver(p, running(['a', 'b']));
    expect(await has(p, '.card[data-id=a][data-running]')).toBe(true);
    expect(await text(p, '.card[data-id=a] .verdict')).toBe('running…');
    await deliver(p, result('a', 'fail', { was: 'pass' }));
    expect(await has(p, '.card[data-id=a][data-running]')).toBe(false);
    expect(await p_hidden(p, '.card[data-id=a] .was')).toBe(false);
    expect(await text(p, '.card[data-id=a] .was')).toBe('was pass');
    await deliver(p, { v: 2, type: 'cancelled', tag: 'app-card', ids: ['b', 'gone'] });
    expect(await has(p, '.card[data-id=b][data-running]')).toBe(false);
    expect(await text(p, '.card[data-id=b] .verdict')).toBe('waiting');
    await deliver(p, result('b', 'pass', { was: 'fail' }));
    expect(await p_hidden(p, '.card[data-id=b] .was')).toBe(true);
  }, 60_000);

  it('no card moves while a run comes in: the failing ones go first when it ends', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await deliver(p, result('a', 'pass'));
    await deliver(p, result('b', 'pass'));
    await deliver(p, running(['a', 'b']));
    await deliver(p, result('b', 'fail'));
    expect(await shown(p)).toEqual(['a', 'b']);
    // A result for a criterion the shell does not show changes nothing.
    await deliver(p, result('gone', 'fail'));
    expect(await shown(p)).toEqual(['a', 'b']);
    await deliver(p, result('a', 'pass'));
    expect(await shown(p)).toEqual(['b', 'a']);
  }, 60_000);

  it('a cancel ends the run: the order catches up', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await deliver(p, running(['a', 'b']));
    await deliver(p, result('b', 'fail'));
    expect(await shown(p)).toEqual(['a', 'b']);
    await deliver(p, { v: 2, type: 'cancelled', tag: 'app-card', ids: ['a'] });
    expect(await shown(p)).toEqual(['b', 'a']);
    expect(await text(p, '#summary')).toMatch(/^\d+\.\d s · /u);
  }, 60_000);

  it('Live opens one iframe for the chosen criterion, reloads it on its result, and closes', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await click(p, '.card[data-id=b] .actions button:nth-child(3)');
    expect(await p_hidden(p, '#live')).toBe(false);
    expect(await attr(p, '.card[data-id=b] .actions button:nth-child(3)', 'aria-pressed')).toBe('true');
    expect(await p.evaluate<string>('() => new URL(document.getElementById("live-frame").src).pathname')).toBe('/app-card/b');
    expect(await text(p, '#live-title')).toBe('b');
    await deliver(p, result('b', 'pass'));
    await deliver(p, session(['a', 'b']));
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe").length')).toBe(1);
    // Live again on its own card closes it.
    await click(p, '.card[data-id=b] .actions button:nth-child(3)');
    expect(await p_hidden(p, '#live')).toBe(true);
    expect(await attr(p, '.card[data-id=b] .actions button:nth-child(3)', 'aria-pressed')).toBe('false');
    await click(p, '.card[data-id=b] .actions button:nth-child(3)');
    // Its card gone, Live closes.
    await deliver(p, session(['a']));
    expect(await p_hidden(p, '#live')).toBe(true);
    expect(await p.evaluate<number>('() => document.querySelectorAll("iframe[src]").length')).toBe(0);
    await key(p, 'l');
    expect(await p_hidden(p, '#live')).toBe(true);
    await click(p, '.card[data-id=a] .actions button:nth-child(3)');
    await click(p, '#live-close');
    expect(await p_hidden(p, '#live')).toBe(true);
  }, 60_000);

  it('j and k move the focus in the order shown, l opens Live', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b', 'c']));
    await deliver(p, result('a', 'pass'));
    await deliver(p, result('b', 'pass'));
    await deliver(p, result('c', 'fail'));
    const active = () => p.evaluate<string | undefined>('() => document.activeElement.dataset.id');
    // Enter with no card focused does nothing.
    await key(p, 'Enter');
    expect(await opens(p)).toEqual(['true', 'true', 'true']);
    await key(p, 'j');
    expect(await active()).toBe('c');
    await key(p, 'j');
    expect(await active()).toBe('a');
    await key(p, 'k');
    await key(p, 'k');
    await key(p, 'k');
    expect(await active()).toBe('c');
    await key(p, 'l');
    expect(await text(p, '#live-title')).toBe('c');
  }, 60_000);

  it('j and k do nothing without cards', async () => {
    const p = await shell();
    await key(p, 'j');
    await key(p, 'l');
    expect(await p.evaluate<string>('() => document.activeElement.tagName')).toBe('BODY');
  }, 60_000);
});

describe('the steps — criterion 13', () => {
  it('the props first, then each step with its block, its term link and its line', async () => {
    const p = await shell();
    const base = session(['a']);
    await deliver(p, { ...base, criteria: [{ ...base.criteria[0]!, props: { name: 'destacada', line: 4 } }] });
    expect(await all(p, '.card[data-id=a] .steps li', '(li) => [li.className, li.querySelector(".block").textContent, li.querySelector(".says").textContent, li.querySelector(".at").textContent]')).toEqual([
      ['given', 'given', 'props destacada', 'L4'],
      ['when', 'when', 'click role:link', 'L5'],
      ['then', 'then', 'app-card says "a"', 'L7'],
    ]);
    expect(await text(p, '.card[data-id=a] .steps li.given .says b')).toBe('destacada');
    expect(await attr(p, '.card[data-id=a] .steps li.then .at', 'href')).toBe(`vscode://file/${SPEC}:7`);
    expect(await attr(p, '.card[data-id=a] .steps li.then .says', 'href')).toBe('vscode://file/C:/p/fudic/terms/then/text.js:1');
  }, 60_000);

  it('a passing then gets ✓; a failing pair ✗ and expected against actual, never as text', async () => {
    const p = await shell();
    await deliver(p, session(['a', 'b']));
    await deliver(p, result('a', 'pass'));
    await deliver(p, result('b', 'fail'));
    expect(await all(p, '.card[data-id=a] .steps li.then', '(li) => [li.className, li.querySelector(".mark").className, li.querySelector(".mark").textContent, li.querySelector(".evidence").textContent]')).toEqual([
      ['then passed', 'mark ok', '✓', ''],
    ]);
    expect(await has(p, '.card[data-id=a] .diff')).toBe(false);
    expect(await all(p, '.card[data-id=b] .steps li.then', '(li) => [li.className, li.querySelector(".mark").className, li.querySelector(".mark").textContent, li.querySelector(".evidence").textContent]')).toEqual([
      ['then bad has-diff', 'mark ko', '✗', ''],
    ]);
    expect(await text(p, '.card[data-id=b] .steps li.bad .diff')).toBe('expected  A titleactual    A tilte');
    // From the first character where they part: "A ti|tle" against "A ti|lte".
    expect(await text(p, '.card[data-id=b] .steps li.bad .diff mark')).toBe('tle');
    // A new result paints over the last: no diff left behind.
    await deliver(p, result('b', 'pass'));
    expect(await has(p, '.card[data-id=b] .diff')).toBe(false);
    expect(await text(p, '.card[data-id=b] .steps li.then .mark')).toBe('✓');
  }, 60_000);

  it('evidence the step already says is not repeated; what it adds is', async () => {
    const p = await shell();
    await deliver(p, session(['a']));
    const steps = (when: unknown, then: unknown, pass = true) =>
      result('a', pass ? 'pass' : 'fail', {
        steps: [
          { block: 'when', term: 'click', layer: 'workspace', args: [], pass: true, evidence: when },
          { block: 'then', term: 'text', layer: 'workspace', args: [], pass, evidence: then },
        ],
      });
    const evidence = () => all(p, '.card[data-id=a] .steps li .evidence', '(e) => e.textContent');
    await deliver(p, steps('role:link', '"a"'));
    expect(await evidence()).toEqual(['', '']);
    await deliver(p, steps('clicked at 3,4', 44));
    expect(await evidence()).toEqual(['(clicked at 3,4)', '→ 44']);
    await deliver(p, steps(null, { px: 20 }, false));
    expect(await evidence()).toEqual(['', '→ {"px":20}']);
    expect(await has(p, '.card[data-id=a] .diff')).toBe(false);
  }, 60_000);

  it('a step in error is ✗ with why; an ignored one is dimmed and badged; a step without result is blank', async () => {
    const p = await shell();
    await deliver(p, session(['a']));
    await deliver(
      p,
      result('a', 'error', {
        steps: [{ block: 'when', term: 'route', layer: 'workspace', args: [], pass: true, evidence: null, ignored: true }],
      }),
    );
    expect(await all(p, '.card[data-id=a] .steps li', '(li) => [li.className, li.querySelector(".mark").textContent, li.querySelector(".evidence").textContent]')).toEqual([
      ['when ignored', '', ''],
      ['then', '', ''],
    ]);
    expect(await text(p, '.card[data-id=a] .steps li.ignored .badge')).toBe('skipped here');
    await deliver(
      p,
      result('a', 'error', {
        steps: [
          { block: 'when', term: 'click', layer: 'workspace', args: [], error: 'role:link matches 2 elements' },
          { block: 'then', term: 'text', layer: 'workspace', args: [], error: 'never ran' },
        ],
      }),
    );
    expect(await all(p, '.card[data-id=a] .steps li', '(li) => [li.className, li.querySelector(".mark").className, li.querySelector(".mark").textContent, li.querySelector(".evidence").textContent]')).toEqual([
      ['when bad', 'mark ko', '✗', '→ role:link matches 2 elements'],
      ['then bad', 'mark ko', '✗', '→ never ran'],
    ]);
    expect(await has(p, '.card[data-id=a] .badge')).toBe(false);
  }, 60_000);

  it('pointing at a step lights it and its boxes; in VS Code it lights its line in the editor too', async () => {
    const p = await shell('?host=vscode');
    const base = session(['a']);
    await deliver(p, { ...base, criteria: [{ ...base.criteria[0]!, props: { name: 'x', line: 4 } }] });
    await deliver(p, result('a', 'pass', { shots: SHOTS, marks: [{ step: 1, ref: 'app-card', box: { x: 1, y: 0, width: 1, height: 1 } }] }));
    await p.waitFor('() => document.querySelector(".card[data-id=a] .box") !== null', null);
    const enter = (n: number) => p.evaluate<void>(`() => document.querySelector(".card[data-id=a] .steps li:nth-child(${n})").dispatchEvent(new MouseEvent("mouseenter"))`);
    const leave = (n: number) => p.evaluate<void>(`() => document.querySelector(".card[data-id=a] .steps li:nth-child(${n})").dispatchEvent(new MouseEvent("mouseleave"))`);
    await enter(3);
    expect(await has(p, '.card[data-id=a] .steps li:nth-child(3).hot')).toBe(true);
    expect(await has(p, '.card[data-id=a] .box.hot')).toBe(true);
    await leave(3);
    expect(await has(p, '.card[data-id=a] .hot')).toBe(false);
    // The props and the when locate nothing: no box lights.
    await enter(1);
    expect(await has(p, '.card[data-id=a] .box.hot')).toBe(false);
    await leave(1);
    await p.waitFor('() => window.__posted.length === 4', null);
    expect(await posted(p)).toEqual([
      { type: 'fudic:hover', file: SPEC, line: 7 },
      { type: 'fudic:hover', file: SPEC, line: null },
      { type: 'fudic:hover', file: SPEC, line: 4 },
      { type: 'fudic:hover', file: SPEC, line: null },
    ]);
  }, 60_000);
});

describe('the shots — criterion 13', () => {
  const marks = [{ step: 1, ref: 'app-card', box: { x: 1, y: 0, width: 1, height: 1 } }];
  const figures = (p: PageLike) => all(p, '.card[data-id=a] .shots figure', '(f) => f.querySelector(".kind").textContent');

  it('side by side by default: before and after, each at the size announced, boxes on the after', async () => {
    const p = await shell();
    await deliver(p, session(['a'], { viewport: { width: 1280, height: 720, scale: 2 } }));
    await deliver(p, result('a', 'pass', { shots: SHOTS, marks }));
    await p.waitFor('() => document.querySelectorAll(".card[data-id=a] .shots figure").length === 2', null);
    expect(await attr(p, '.modes button[data-mode=side]', 'aria-pressed')).toBe('true');
    expect(await figures(p)).toEqual(['Before the when', 'At the end']);
    expect(await has(p, '.card[data-id=a] .shots.two')).toBe(true);
    expect(await all(p, '.card[data-id=a] .shots img', '(i) => [i.getAttribute("src"), i.getAttribute("width"), i.getAttribute("height")]')).toEqual([
      ['/shot/before.png', '10', '20'],
      ['/shot/after.png', '10', '20'],
    ]);
    expect(await all(p, '.card[data-id=a] .shots .size', '(s) => s.textContent')).toEqual(['· 10×20 · 2x', '· 10×20 · 2x']);
    // The box in % of the shot: 1 of 10 across, 1 of 20 down.
    expect(await all(p, '.card[data-id=a] .shots .box', '(b) => [b.style.left, b.style.top, b.style.width, b.style.height, b.title]')).toEqual([
      ['10%', '0%', '10%', '5%', 'app-card'],
    ]);
  }, 60_000);

  it('final only: the after alone; slider: one frame, the before clipped by a handle', async () => {
    const p = await shell();
    await deliver(p, session(['a']));
    await deliver(p, result('a', 'pass', { shots: SHOTS, marks }));
    await click(p, '.modes button[data-mode=final]');
    await p.waitFor('() => document.querySelectorAll(".card[data-id=a] .shots figure").length === 1', null);
    expect(await figures(p)).toEqual(['At the end']);
    expect(await has(p, '.card[data-id=a] .shots.two')).toBe(false);
    expect(await all(p, '.modes button', '(b) => b.getAttribute("aria-pressed")')).toEqual(['false', 'false', 'true']);

    await click(p, '.modes button[data-mode=slider]');
    await p.waitFor('() => document.querySelector(".card[data-id=a] .shots input.slider") !== null', null);
    expect(await figures(p)).toEqual(['Before ↔ at the end']);
    expect(await all(p, '.card[data-id=a] .shots img', '(i) => [i.className, i.getAttribute("src")]')).toEqual([
      ['', '/shot/after.png'],
      ['before', '/shot/before.png'],
    ]);
    expect(await has(p, '.card[data-id=a] .shots .box')).toBe(true);
    expect(await p.evaluate<string>('() => document.querySelector(".card[data-id=a] img.before").style.clipPath')).toBe('inset(0px 50% 0px 0px)');
    await p.evaluate<void>('() => { const r = document.querySelector(".card[data-id=a] input.slider"); r.value = "80"; r.dispatchEvent(new Event("input")); }');
    expect(await p.evaluate<string>('() => document.querySelector(".card[data-id=a] img.before").style.clipPath')).toBe('inset(0px 20% 0px 0px)');

    // Without a before, the slider has nothing to slide: the after alone.
    await deliver(p, result('a', 'pass', { shots: { after: SHOTS.after }, marks }));
    await p.waitFor('() => document.querySelector(".card[data-id=a] .shots input.slider") === null', null);
    expect(await figures(p)).toEqual(['At the end']);
    // No shots at all, no figures.
    await deliver(p, result('a', 'pass'));
    await p.waitFor('() => document.querySelectorAll(".card[data-id=a] .shots figure").length === 0', null);
  }, 60_000);

  it('the mode chosen is kept for the next time the shell opens', async () => {
    const p = await shell();
    await click(p, '.modes button[data-mode=slider]');
    await load(p, '');
    expect(await all(p, '.modes button', '(b) => b.getAttribute("aria-pressed")')).toEqual(['false', 'true', 'false']);
    await click(p, '.modes button[data-mode=side]');
  }, 60_000);

  it('a new shot replaces the old one in place, without the card going empty in between', async () => {
    const p = await shell();
    await deliver(p, session(['a']));
    await deliver(p, result('a', 'pass', { shots: { after: SHOTS.after } }));
    await p.waitFor('() => document.querySelectorAll(".card[data-id=a] .shots figure").length === 1', null);
    // Watch the shots: they must never be empty while the next image decodes.
    await p.evaluate<void>(
      '() => { window.__empty = 0; new MutationObserver(() => { if (document.querySelector(".card[data-id=a] .shots").children.length === 0) window.__empty++; }).observe(document.querySelector(".card[data-id=a] .shots"), { childList: true }); }',
    );
    await deliver(p, result('a', 'pass', { shots: { after: { url: '/shot/next.png', width: 10, height: 20 } } }));
    await p.waitFor('() => document.querySelector(".card[data-id=a] .shots img").getAttribute("src") === "/shot/next.png"', null);
    expect(await p.evaluate<number>('() => window.__empty')).toBe(0);
  }, 60_000);

  it('Expand shows the shot twice as large in a dialog; keys do nothing while it is open', async () => {
    const p = await shell();
    await deliver(p, session(['a']));
    await deliver(p, result('a', 'pass', { shots: SHOTS, marks }));
    await p.waitFor('() => document.querySelectorAll(".card[data-id=a] .shots figure").length === 2', null);
    await click(p, '.card[data-id=a] .shots figure:nth-child(2) button.zoom');
    expect(await p.evaluate<boolean>('() => document.getElementById("zoom").open')).toBe(true);
    expect(await text(p, '#zoom-title')).toBe('a · at the end');
    expect(await all(p, '#zoom-body img', '(i) => [i.getAttribute("width"), i.getAttribute("height")]')).toEqual([['20', '40']]);
    expect(await p.evaluate<number>('() => document.querySelectorAll("#zoom-body .box").length')).toBe(1);
    await key(p, 'r');
    expect(await sent(p)).toEqual([]);
    await click(p, '#zoom-close');
    expect(await p.evaluate<boolean>('() => document.getElementById("zoom").open')).toBe(false);
    // The before, without its boxes.
    await click(p, '.card[data-id=a] .shots figure:nth-child(1) button.zoom');
    expect(await text(p, '#zoom-title')).toBe('a · before the first when');
    expect(await p.evaluate<number>('() => document.querySelectorAll("#zoom-body .box").length')).toBe(0);
    await click(p, '#zoom-close');
    // A result without that shot since: Expand on the old figure opens nothing.
    await p.evaluate<void>('() => { window.__stale = document.querySelector(".card[data-id=a] .shots figure:nth-child(1) button.zoom"); }');
    await deliver(p, result('a', 'pass', { shots: { after: SHOTS.after }, marks }));
    await p.evaluate<void>('() => window.__stale.click()');
    expect(await p.evaluate<boolean>('() => document.getElementById("zoom").open')).toBe(false);
  }, 60_000);
});

describe('links, theme and noise — criterion 13', () => {
  it('the titles, steps and diagnostics link to their files: vscode:// in a browser', async () => {
    const p = await shell();
    await deliver(p, {
      ...session(['a']),
      diagnostics: [
        { code: 'FUD0933', severity: 'error', message: 'no then', file: SPEC, line: 3, column: 1 },
        { code: 'FUD0972', severity: 'warning', message: 'no spec', file: '/home/p/app-card.fud', line: null, column: null },
        { code: 'FUD0900', severity: 'warning', message: 'somewhere', file: null, line: null, column: null },
      ],
    });
    expect(await attr(p, '.card[data-id=a] .title', 'href')).toBe(`vscode://file/${SPEC}:3`);
    expect(await attr(p, '.card[data-id=a] .steps a', 'href')).toBe('vscode://file/C:/p/fudic/terms/when/click.js:1');
    expect(await all(p, '#diagnostics li', '(li) => [li.className, li.textContent, li.querySelector("a").getAttribute("href")]')).toEqual([
      ['error', 'FUD0933 no then — app-card.fudspec:3', `vscode://file/${SPEC}:3`],
      ['warning', 'FUD0972 no spec — app-card.fud', 'vscode://file/home/p/app-card.fud'],
      ['warning', 'FUD0900 somewhere', null],
    ]);
    await deliver(p, session(['a']));
    expect(await has(p, '#diagnostics li')).toBe(false);
  }, 60_000);

  it('inside VS Code a link asks the editor instead, and the theme follows the editor', async () => {
    const p = await shell('?host=vscode&theme=dark');
    expect(await p.evaluate<string>('() => document.documentElement.dataset.theme')).toBe('dark');
    await deliver(p, session(['a']));
    await click(p, '.card[data-id=a] .title');
    await p.waitFor('() => window.__posted.length === 1', null);
    expect(await posted(p)).toEqual([{ type: 'fudic:open', file: SPEC, line: 3 }]);
    await p.evaluate<void>('() => window.postMessage({ type: "fudic:theme", theme: "light" }, "*")');
    await p.waitFor('() => document.documentElement.dataset.theme === "light"', null);
    await p.evaluate<void>('() => window.postMessage({ type: "fudic:theme", theme: "sepia" }, "*")');
    await p.evaluate<void>('() => window.postMessage(null, "*")');
    expect(await p.evaluate<string>('() => document.documentElement.dataset.theme')).toBe('light');
  }, 60_000);

  it('ignores what is not v: 2 or a type it knows, and shows a problem', async () => {
    const p = await shell();
    await deliver(p, { v: 1, type: 'session' });
    await deliver(p, { v: 2, type: 'pinned' } as unknown as BenchMessage);
    expect(await p.evaluate<number>('() => document.querySelectorAll(".card").length')).toBe(0);
    await deliver(p, { v: 2, type: 'problem', message: 'Chrome went away' });
    expect(await text(p, '#problem')).toBe('Chrome went away');
  }, 60_000);
});
