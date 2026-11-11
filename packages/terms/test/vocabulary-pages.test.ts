/**
 * SDD-82 §3.7 and criteria 24–28: the vocabulary of pages and flows. Each term, run with the stock
 * ctx over real Chrome and a small server of its own, does what it says — a `given` or a `when`
 * says what it did, and errs where it cannot — and each `then` passes its case and fails the
 * other with legible evidence (`expected`/`actual`). What the bench knows of the criterion — its
 * calls, the last document, the last `when` — comes from the fake host, as each test sets it.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stock, termsDir, type Term, type TermContext, type TermOutcome } from '../src/index.js';
import { fakeHost, launch, type FakeHost } from './browser.js';

type Block = 'given' | 'when' | 'then';

async function load(block: Block, name: string): Promise<Term & Record<string, unknown>> {
  return (await import(pathToFileURL(join(termsDir(), block, `${name}.js`)).href)) as Term & Record<string, unknown>;
}

const html = (title: string, body = ''): string =>
  `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;

/** A page that registers a worker which keeps every page it serves and gives it back offline. */
const WORKER_PAGE = html('Con worker', "<script>navigator.serviceWorker.register('/sw.js')</script>");
const WORKER = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open('pages').then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});`;

/** The test's own server: each path, what it answers. */
const server: Server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/') res.writeHead(200, { 'content-type': 'text/html', 'x-test': 'yes' }).end(html('Inicio'));
  else if (path === '/second') res.writeHead(200, { 'content-type': 'text/html' }).end(html('Second'));
  else if (path === '/echo') res.writeHead(200, { 'content-type': 'text/plain' }).end(`cookie=${req.headers.cookie ?? ''} lang=${req.headers['accept-language'] ?? ''}`);
  else if (path === '/worker') res.writeHead(200, { 'content-type': 'text/html' }).end(WORKER_PAGE);
  else if (path === '/sw.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(WORKER);
  else if (path === '/file') res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="personas.csv"' }).end('a,b\n');
  // Never answers: a navigation to it only times out.
  else if (path === '/slow') return;
  else res.writeHead(404, { 'content-type': 'text/html' }).end(html('No'));
});
let origin = '';

let browser: Browser;
let context: BrowserContext;
let page: Page;
let host: FakeHost;
let ctx: TermContext;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await launch();
});

afterAll(async () => {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(5000);
  host = fakeHost(page);
  host.record.url = `${origin}/`;
  ctx = stock.context!(undefined as never, host);
});

afterEach(async () => {
  await context.close();
});

async function run(block: Block, name: string, args: Record<string, string | number> = {}): Promise<TermOutcome> {
  return (await load(block, name)).run(ctx, args);
}

const ev = (expected: string, actual: string) => ({ expected, actual });

/** Whether a fetch from the page gets through: what `offline` and `online` change. */
const reaches = () => page.evaluate("fetch('/second').then(() => true, () => false)");

describe('§3.7 — what each new term says it does', () => {
  it.each([
    ['given', 'cookie', { name: 'fudic-session', value: 'ana' }, 'the browser has the cookie fudic-session=ana'],
    ['given', 'locale', { tag: 'en' }, 'the browser speaks en'],
    ['given', 'media', { feature: 'prefers-color-scheme', value: 'dark' }, 'the page has prefers-color-scheme: dark'],
    ['given', 'viewport', { width: 375, height: 812 }, 'the window is 375×812'],
    ['given', 'clock', { at: '2026-11-08T10:00:00Z' }, 'the clock stands at 2026-11-08T10:00:00Z'],
    ['given', 'offline', {}, 'the browser has no network'],
    ['when', 'go', { url: '/usuarios' }, 'the user goes to /usuarios'],
    ['when', 'back', {}, 'the user goes back'],
    ['when', 'forward', {}, 'the user goes forward'],
    ['when', 'reload', {}, 'the user reloads the page'],
    ['when', 'check', { target: 'role:checkbox' }, 'the user ticks role:checkbox'],
    ['when', 'uncheck', { target: 'role:checkbox' }, 'the user unticks role:checkbox'],
    ['when', 'select', { target: 'role:combobox', option: 'Dos' }, 'the user chooses "Dos" in role:combobox'],
    ['when', 'hover', { target: 'role:button' }, 'the user hovers over role:button'],
    ['when', 'upload', { target: 'role:button', file: './a.png' }, 'the user chooses ./a.png in role:button'],
    ['when', 'wait', { ms: 300 }, '300 ms pass'],
    ['when', 'offline', {}, 'the network goes'],
    ['when', 'online', {}, 'the network comes back'],
    ['then', 'title', { expected: 'Inicio' }, 'the title is "Inicio"'],
    ['then', 'url', { expected: '/usuarios' }, 'the page is at /usuarios'],
    ['then', 'status', { code: 401 }, 'the page answered 401'],
    ['then', 'count', { target: 'role:row', n: 2 }, 'there are 2 of role:row'],
    ['then', 'value', { target: 'role:textbox', expected: 'ana' }, 'role:textbox holds "ana"'],
    ['then', 'checked', { target: 'role:checkbox' }, 'role:checkbox is ticked'],
    ['then', 'unchecked', { target: 'role:checkbox' }, 'role:checkbox is unticked'],
    ['then', 'enabled', { target: 'role:button' }, 'role:button can be used'],
    ['then', 'disabled', { target: 'role:button' }, 'role:button cannot be used'],
    ['then', 'called', { fn: 'save', times: 1 }, 'save was called 1 time'],
    ['then', 'called', { fn: 'save', times: 2 }, 'save was called 2 times'],
    ['then', 'sent', { fn: 'login', field: 'user', expected: 'ana' }, 'login was sent user = "ana"'],
    ['then', 'lists', { value: 'hola-fudic' }, 'paths() lists hola-fudic'],
    ['then', 'not-reloaded', {}, 'the page was not reloaded'],
    ['then', 'requests', { n: 1 }, '1 request went out'],
    ['then', 'requests', { n: 3 }, '3 requests went out'],
    ['then', 'header', { name: 'cache-control', expected: 'no-cache' }, 'the page answered cache-control: no-cache'],
    ['then', 'downloaded', { name: 'personas.csv' }, 'personas.csv was downloaded'],
  ] as const)('%s/%s', async (block, name, args, said) => {
    expect((await load(block, name)).meta.describe!(args)).toBe(said);
  });

  it('a then that holds by what is not there says so (§4.5): read once, never retried', async () => {
    const negative = async (name: string, args: Record<string, string | number> = {}) => {
      const flag = (await load('then', name)).meta.negative;
      return typeof flag === 'function' ? flag(args) : flag === true;
    };
    expect(await negative('count', { n: 0 })).toBe(true);
    expect(await negative('count', { n: 2 })).toBe(false);
    expect(await negative('called', { times: 0 })).toBe(true);
    expect(await negative('called', { times: 1 })).toBe(false);
    expect(await negative('slotted', { slot: 'none' })).toBe(true);
    expect(await negative('slotted', { slot: 'icon' })).toBe(false);
    for (const name of ['hidden', 'unchecked', 'not-reloaded', 'requests']) expect(await negative(name)).toBe(true);
    for (const name of ['title', 'url', 'status', 'value', 'checked', 'enabled', 'disabled', 'sent', 'lists', 'header', 'downloaded']) {
      expect(await negative(name)).toBe(false);
    }
  });
});

describe('§3.7 — given (criteria 25, 26)', () => {
  it('cookie puts the cookie for the criterion URL before the page opens', async () => {
    expect(await run('given', 'cookie', { name: 'fudic-session', value: 'ana' })).toEqual({ pass: true, evidence: 'cookie fudic-session=ana' });
    await page.goto(`${origin}/echo`);
    expect(await page.textContent('body')).toContain('cookie=fudic-session=ana');
  });

  it('locale asks for the page in that language and says the browser speaks it', async () => {
    expect(await run('given', 'locale', { tag: 'en' })).toEqual({ pass: true, evidence: 'speaks en' });
    await page.goto(`${origin}/echo`);
    expect(await page.textContent('body')).toContain('lang=en');
    expect(await page.evaluate('[navigator.language, navigator.languages]')).toEqual(['en', ['en']]);
  });

  it('media paints the page under the feature; an unknown feature or value is an error, said', async () => {
    expect(await run('given', 'media', { feature: 'prefers-color-scheme', value: 'dark' })).toEqual({ pass: true, evidence: 'prefers-color-scheme: dark' });
    await run('given', 'media', { feature: 'prefers-reduced-motion', value: 'reduce' });
    await page.goto(`${origin}/`);
    expect(await page.evaluate("[matchMedia('(prefers-color-scheme: dark)').matches, matchMedia('(prefers-reduced-motion: reduce)').matches]")).toEqual([true, true]);
    await expect(run('given', 'media', { feature: 'hover', value: 'none' })).rejects.toThrow(/media knows prefers-color-scheme, .*; not hover/u);
    await expect(run('given', 'media', { feature: 'prefers-color-scheme', value: 'blue' })).rejects.toThrow('prefers-color-scheme takes light, dark, no-preference; not blue');
  });

  it('viewport sizes the window', async () => {
    expect(await run('given', 'viewport', { width: 375, height: 812 })).toEqual({ pass: true, evidence: '375×812' });
    await page.goto(`${origin}/`);
    expect(await page.evaluate('[innerWidth, innerHeight]')).toEqual([375, 812]);
  });

  it('clock stands the criterion clock at the instant; one that is not ISO 8601 is an error, said', async () => {
    expect(await run('given', 'clock', { at: '2026-11-08T10:00:00Z' })).toEqual({ pass: true, evidence: 'the clock stands at 2026-11-08T10:00:00.000Z' });
    expect(host.told).toEqual([`clock ${Date.parse('2026-11-08T10:00:00Z')} 2026-11-08T10:00:00Z`]);
    await expect(run('given', 'clock', { at: 'mañana' })).rejects.toThrow('"mañana" is not an ISO 8601 instant');
  });

  it('offline visits with network, and cuts it: a page without a worker opens nothing after', async () => {
    expect(await run('given', 'offline')).toEqual({ pass: true, evidence: 'without network; the page has no Service Worker' });
    expect(host.told).toEqual(['quiet']);
    expect(await reaches()).toBe(false);
  });

  it('offline with the app worker installs it first: the page then opens from it without network', async () => {
    host.record.url = `${origin}/worker`;
    // The bench's quiet page waits for what the page started: its worker's script among it.
    Object.assign(host, {
      quiet: async () => {
        host.told.push('quiet');
        await page.waitForLoadState('networkidle');
      },
    });
    expect(await run('given', 'offline')).toEqual({ pass: true, evidence: 'without network, with the Service Worker installed' });
    expect(host.told).toEqual(['quiet', 'quiet']);
    const response = await page.goto(`${origin}/worker`);
    expect([response?.status(), await page.title()]).toEqual([200, 'Con worker']);
  });
});

describe('§3.7 — when', () => {
  it('go opens the URL relative to the page, or to the criterion before any page', async () => {
    expect(await run('when', 'go', { url: '/second' })).toEqual({ pass: true, evidence: 'went to /second: 200' });
    // The term returns once the document answers; the workbench waits for the rest.
    await page.waitForLoadState();
    expect(await page.title()).toBe('Second');
    expect(await run('when', 'go', { url: 'nada' })).toEqual({ pass: true, evidence: 'went to nada: 404' });
    expect(await run('when', 'go', { url: '#part' })).toEqual({ pass: true, evidence: 'went to #part: the same document' });
  });

  it('go to a page the browser cannot open says so, as the person sees it; any other failure is an error', async () => {
    await page.goto(`${origin}/`);
    await context.setOffline(true);
    expect(await run('when', 'go', { url: '/second' })).toEqual({ pass: true, evidence: 'the browser could not open /second: net::ERR_INTERNET_DISCONNECTED' });
    await context.setOffline(false);
    page.setDefaultNavigationTimeout(300);
    await expect(run('when', 'go', { url: `${origin}/slow` })).rejects.toThrow(/Timeout 300ms exceeded/u);
  });

  it('back and forward walk the history, and say when there is nothing to walk to', async () => {
    await page.goto(`${origin}/`);
    await page.goto(`${origin}/second`);
    expect(await run('when', 'back')).toEqual({ pass: true, evidence: 'back to /' });
    expect(await run('when', 'forward')).toEqual({ pass: true, evidence: 'forward to /second' });
    expect(await run('when', 'forward')).toEqual({ pass: true, evidence: 'nothing to go forward to, or the same document' });
    await run('when', 'back');
    await run('when', 'back');
    expect(await run('when', 'back')).toEqual({ pass: true, evidence: 'nothing to go back to, or the same document' });
  });

  it('reload loads the document again', async () => {
    await page.goto(`${origin}/second`);
    await page.evaluate('globalThis.mark = 1');
    expect(await run('when', 'reload')).toEqual({ pass: true, evidence: 'reloaded /second' });
    expect(await page.evaluate('globalThis.mark')).toBeUndefined();
  });

  it('check and uncheck click the box through act, and leave it alone when it already is', async () => {
    await page.setContent('<input type="checkbox" aria-label="Activo">');
    expect(await run('when', 'check', { target: 'role:checkbox' })).toEqual({ pass: true, evidence: 'ticked role:checkbox' });
    expect(await page.isChecked('input')).toBe(true);
    expect(await run('when', 'check', { target: 'role:checkbox' })).toEqual({ pass: true, evidence: 'role:checkbox was already ticked' });
    expect(await run('when', 'uncheck', { target: 'role:checkbox' })).toEqual({ pass: true, evidence: 'unticked role:checkbox' });
    expect(await page.isChecked('input')).toBe(false);
    expect(await run('when', 'uncheck', { target: 'role:checkbox' })).toEqual({ pass: true, evidence: 'role:checkbox was already unticked' });
    expect(host.settled).toHaveLength(2);
  });

  it('uncheck does not fight a page that ticks the box again: that is the then to read', async () => {
    await page.setContent('<input type="checkbox" checked aria-label="Activo" onchange="setTimeout(() => (this.checked = true), 50)">');
    expect(await run('when', 'uncheck', { target: 'role:checkbox' })).toEqual({ pass: true, evidence: 'unticked role:checkbox' });
  });

  it('select chooses by the text of the option; an option that is not there is an error', async () => {
    await page.setContent('<select aria-label="N"><option value="1">Uno</option><option value="2">Dos</option></select>');
    expect(await run('when', 'select', { target: 'role:combobox', option: 'Dos' })).toEqual({ pass: true, evidence: 'chose "Dos"' });
    expect(await page.inputValue('select')).toBe('2');
    page.setDefaultTimeout(500);
    await expect(run('when', 'select', { target: 'role:combobox', option: 'Tres' })).rejects.toThrow();
  });

  it('hover moves the mouse over the element', async () => {
    await page.setContent('<button onmouseenter="this.textContent = \'over\'">b</button>');
    expect(await run('when', 'hover', { target: 'role:button' })).toEqual({ pass: true, evidence: 'over role:button' });
    expect(await page.textContent('button')).toBe('over');
  });

  it('upload chooses the file, relative to the .fudspec, in the input itself or in the chooser a button opens', async () => {
    const chosen = () => page.evaluate("document.querySelector('input').files[0].name");
    await page.setContent('<input type="file">');
    expect(await run('when', 'upload', { target: 'input', file: './hola.txt' })).toEqual({ pass: true, evidence: 'chose ./hola.txt' });
    expect(await chosen()).toBe('hola.txt');
    await page.setContent('<button onclick="this.nextElementSibling.click()">Foto</button><input type="file" hidden>');
    expect(await run('when', 'upload', { target: 'role:button/"Foto"', file: 'hola.txt' })).toEqual({ pass: true, evidence: 'chose hola.txt' });
    expect(await chosen()).toBe('hola.txt');
    expect(host.settled).toHaveLength(2);
  });

  it('wait moves the clocks through the host', async () => {
    expect(await run('when', 'wait', { ms: 300 })).toEqual({ pass: true, evidence: '300 ms passed' });
    expect(host.told).toEqual(['advance 300']);
  });

  it('offline cuts the network and online brings it back', async () => {
    await page.goto(`${origin}/`);
    expect(await run('when', 'offline')).toEqual({ pass: true, evidence: 'the network went' });
    expect(await reaches()).toBe(false);
    expect(await run('when', 'online')).toEqual({ pass: true, evidence: 'the network is back' });
    expect(await reaches()).toBe(true);
  });

  it('offline waits for a worker still installing, so it can serve what it keeps (criterion 22)', async () => {
    await page.goto(`${origin}/worker`);
    expect(await run('when', 'offline')).toEqual({ pass: true, evidence: 'the network went; the Service Worker stays' });
  });
});

describe('§3.7 — then, with evidence of text (criteria 24, 27, 28)', () => {
  it('title: pass on exactly the title; fail quoting it', async () => {
    await page.goto(`${origin}/`);
    expect(await run('then', 'title', { expected: 'Inicio' })).toEqual({ pass: true, evidence: ev('"Inicio"', '"Inicio"') });
    expect(await run('then', 'title', { expected: 'Ini' })).toEqual({ pass: false, evidence: ev('"Ini"', '"Inicio"') });
  });

  it('url: pass on the path and query; fail saying where it is', async () => {
    await page.goto(`${origin}/second?q=ana`);
    expect(await run('then', 'url', { expected: '/second?q=ana' })).toEqual({ pass: true, evidence: ev('/second?q=ana', '/second?q=ana') });
    expect(await run('then', 'url', { expected: '/second' })).toEqual({ pass: false, evidence: ev('/second', '/second?q=ana') });
  });

  it('status: the last document, or no response at all', async () => {
    host.record.response = { status: 401, headers: {} };
    expect(await run('then', 'status', { code: 401 })).toEqual({ pass: true, evidence: ev('401', '401') });
    expect(await run('then', 'status', { code: 200 })).toEqual({ pass: false, evidence: ev('200', '401') });
    host.record.response = null;
    expect(await run('then', 'status', { code: 200 })).toEqual({ pass: false, evidence: ev('200', 'no response') });
  });

  it('count: any number, none included, without the one-element rule', async () => {
    await page.setContent('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>');
    expect(await run('then', 'count', { target: 'role:row', n: 2 })).toEqual({ pass: true, evidence: ev('2', '2') });
    expect(await run('then', 'count', { target: 'role:row', n: 0 })).toEqual({ pass: false, evidence: ev('0', '2') });
    expect(await run('then', 'count', { target: 'role:button', n: 0 })).toEqual({ pass: true, evidence: ev('0', '0') });
  });

  it('value: the value of a control; fail quoting it, or saying it is not there', async () => {
    await page.setContent('<input aria-label="Nombre" value="ana">');
    expect(await run('then', 'value', { target: 'role:textbox', expected: 'ana' })).toEqual({ pass: true, evidence: ev('"ana"', '"ana"') });
    expect(await run('then', 'value', { target: 'role:textbox', expected: 'luis' })).toEqual({ pass: false, evidence: ev('"luis"', '"ana"') });
    expect(await run('then', 'value', { target: 'role:combobox', expected: 'x' })).toEqual({ pass: false, evidence: ev('"x"', 'not there') });
  });

  it.each([
    ['checked', 'ticked', true],
    ['unchecked', 'unticked', false],
  ] as const)('%s: pass on its state; fail on the other, and when not there', async (name, word, ticked) => {
    await page.setContent(`<input type="checkbox" aria-label="a" checked><input type="checkbox" aria-label="b">`);
    const yes = ticked ? 'role:checkbox/"a"' : 'role:checkbox/"b"';
    const no = ticked ? 'role:checkbox/"b"' : 'role:checkbox/"a"';
    expect(await run('then', name, { target: yes })).toEqual({ pass: true, evidence: ev(word, word) });
    expect(await run('then', name, { target: no })).toEqual({ pass: false, evidence: ev(word, ticked ? 'unticked' : 'ticked') });
    expect(await run('then', name, { target: 'role:switch' })).toEqual({ pass: false, evidence: ev(word, 'not there') });
  });

  it.each([
    ['checked', 'ticked', 'not a checkbox'],
    ['unchecked', 'unticked', 'not a checkbox'],
    ['value', '"x"', 'not a control'],
  ] as const)('%s on an element that has no such state fails saying so; two elements are still an error', async (name, expected, actual) => {
    await page.setContent('<ui-a>a</ui-a><input type="checkbox"><input type="checkbox">');
    expect(await run('then', name, { target: 'ui-a', expected: 'x' })).toEqual({ pass: false, evidence: ev(expected, actual) });
    await expect(run('then', name, { target: 'input', expected: 'x' })).rejects.toThrow('input matches 2 elements');
  });

  it.each([
    ['enabled', 'enabled', 'disabled'],
    ['disabled', 'disabled', 'enabled'],
  ] as const)('%s: pass on its state; fail on the other, and when not there', async (name, word, other) => {
    await page.setContent('<button>on</button><button disabled>off</button>');
    const yes = name === 'enabled' ? 'role:button/"on"' : 'role:button/"off"';
    const no = name === 'enabled' ? 'role:button/"off"' : 'role:button/"on"';
    expect(await run('then', name, { target: yes })).toEqual({ pass: true, evidence: ev(word, word) });
    expect(await run('then', name, { target: no })).toEqual({ pass: false, evidence: ev(word, other) });
    expect(await run('then', name, { target: 'role:link' })).toEqual({ pass: false, evidence: ev(word, 'not there') });
  });

  it('called: how many times, answered or not', () => {
    host.record.calls = [
      { name: 'search', args: {}, faked: true, status: 200 },
      { name: 'save', args: {}, faked: false, status: 200 },
      { name: 'search', args: {}, faked: false, status: 200 },
    ];
    return Promise.all([
      expect(run('then', 'called', { fn: 'search', times: 2 })).resolves.toEqual({ pass: true, evidence: ev('2 calls', '2 calls') }),
      expect(run('then', 'called', { fn: 'save', times: 2 })).resolves.toEqual({ pass: false, evidence: ev('2 calls', '1 calls') }),
      expect(run('then', 'called', { fn: 'remove', times: 0 })).resolves.toEqual({ pass: true, evidence: ev('0 calls', '0 calls') }),
    ]);
  });

  it('sent: a field of the last call, dotted, a file by its name, the rest as JSON; fail saying what was there', async () => {
    host.record.calls = [
      { name: 'save', args: { user: 'luis' }, faked: false, status: 200 },
      { name: 'save', args: { user: 'ana', id: 2, docs: ['marta.png'], meta: { a: 1 } }, faked: false, status: 200 },
    ];
    expect(await run('then', 'sent', { fn: 'save', field: 'user', expected: 'ana' })).toEqual({ pass: true, evidence: ev('"ana"', '"ana"') });
    expect(await run('then', 'sent', { fn: 'save', field: 'id', expected: '2' })).toEqual({ pass: true, evidence: ev('"2"', '"2"') });
    expect(await run('then', 'sent', { fn: 'save', field: 'docs.0', expected: 'marta.png' })).toEqual({ pass: true, evidence: ev('"marta.png"', '"marta.png"') });
    expect(await run('then', 'sent', { fn: 'save', field: 'meta', expected: '{"a":1}' })).toEqual({ pass: true, evidence: ev('"{"a":1}"', '"{"a":1}"') });
    expect(await run('then', 'sent', { fn: 'save', field: 'user', expected: 'luis' })).toEqual({ pass: false, evidence: ev('"luis"', '"ana"') });
    expect(await run('then', 'sent', { fn: 'save', field: 'id.x', expected: '2' })).toEqual({ pass: false, evidence: ev('"2"', 'no id.x') });
    expect(await run('then', 'sent', { fn: 'save', field: 'age', expected: '2' })).toEqual({ pass: false, evidence: ev('"2"', 'no age') });
    expect(await run('then', 'sent', { fn: 'login', field: 'user', expected: 'ana' })).toEqual({ pass: false, evidence: ev('"ana"', 'login was never called') });
  });

  it('lists: what the real paths() lists; fail saying what it lists, or that there is none', async () => {
    host.record.paths = ['hola-fudic', 'dsd-in-depth'];
    expect(await run('then', 'lists', { value: 'hola-fudic' })).toEqual({ pass: true, evidence: ev('lists hola-fudic', 'lists hola-fudic, dsd-in-depth') });
    expect(await run('then', 'lists', { value: 'otro' })).toEqual({ pass: false, evidence: ev('lists otro', 'lists hola-fudic, dsd-in-depth') });
    host.record.paths = [];
    expect(await run('then', 'lists', { value: 'otro' })).toEqual({ pass: false, evidence: ev('lists otro', 'lists nothing') });
    host.record.paths = null;
    expect(await run('then', 'lists', { value: 'otro' })).toEqual({ pass: false, evidence: ev('lists otro', 'the page has no paths()') });
  });

  it('not-reloaded: pass on the same document; fail on another', async () => {
    expect(await run('then', 'not-reloaded')).toEqual({ pass: true, evidence: ev('the same document', 'the same document') });
    host.record.reloaded = true;
    expect(await run('then', 'not-reloaded')).toEqual({ pass: false, evidence: ev('the same document', 'another document') });
  });

  it('requests: what went out during the last when', async () => {
    host.record.lastWhen = { requests: 1, downloads: [] };
    expect(await run('then', 'requests', { n: 1 })).toEqual({ pass: true, evidence: ev('1 requests', '1 requests') });
    expect(await run('then', 'requests', { n: 0 })).toEqual({ pass: false, evidence: ev('0 requests', '1 requests') });
  });

  it('header: a header of the last document, its name in any case; fail saying it had none, or no response', async () => {
    host.record.response = { status: 200, headers: { 'cache-control': 'private, no-cache' } };
    expect(await run('then', 'header', { name: 'Cache-Control', expected: 'private, no-cache' })).toEqual({
      pass: true,
      evidence: ev('cache-control: private, no-cache', 'cache-control: private, no-cache'),
    });
    expect(await run('then', 'header', { name: 'cache-control', expected: 'no-store' })).toEqual({
      pass: false,
      evidence: ev('cache-control: no-store', 'cache-control: private, no-cache'),
    });
    expect(await run('then', 'header', { name: 'etag', expected: 'x' })).toEqual({ pass: false, evidence: ev('etag: x', 'no etag') });
    host.record.response = null;
    expect(await run('then', 'header', { name: 'etag', expected: 'x' })).toEqual({ pass: false, evidence: ev('etag: x', 'no response') });
  });

  it('downloaded: a file the last when downloaded; fail saying what it downloaded, or nothing', async () => {
    host.record.lastWhen = { requests: 1, downloads: ['personas.csv'] };
    expect(await run('then', 'downloaded', { name: 'personas.csv' })).toEqual({ pass: true, evidence: ev('downloaded personas.csv', 'downloaded personas.csv') });
    expect(await run('then', 'downloaded', { name: 'otro.csv' })).toEqual({ pass: false, evidence: ev('downloaded otro.csv', 'downloaded personas.csv') });
    host.record.lastWhen = { requests: 0, downloads: [] };
    expect(await run('then', 'downloaded', { name: 'otro.csv' })).toEqual({ pass: false, evidence: ev('downloaded otro.csv', 'nothing downloaded') });
  });
});
