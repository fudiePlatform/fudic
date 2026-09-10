/**
 * Two requests of one server, in flight at the same time.
 *
 * `/sesion/:user` is rendered per request and its `load` awaits a lookup that takes a
 * different amount of time per user, so the two responses genuinely overlap: the slow one
 * enters first and leaves last. What is measured is that neither of them can see what the
 * other published — the seed of a page belongs to the response that produced it.
 *
 * Dev only, and that is not a shortcut: it is the one shape of the three that has a server
 * answering two requests at once. A preview build has no server for an `ssr` route.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';

/** The `fud-di` block of a rendered page: what the browser would rebuild its services from. */
function seedOf(html: string): unknown {
  const block = /<script type="application\/json" id="fud-di">(?<json>.*?)<\/script>/su.exec(html);
  return block === null ? null : JSON.parse(block.groups?.['json'] ?? 'null');
}

/** What a `data-id` painted, wherever in the document it is. */
function painted(html: string, id: string): string | null {
  const found = new RegExp(`data-id="${id}"[^>]*>(?<text>[^<]*)<`, 'u').exec(html);
  return found === null ? null : (found.groups?.['text'] ?? '').trim();
}

async function fetchPage(request: APIRequestContext, user: string): Promise<string> {
  const response = await request.get(`/sesion/${user}`, {
    headers: { accept: 'text/html' },
  });
  expect(response.status(), `/sesion/${user} answered`).toBe(200);
  return response.text();
}

test.describe('/sesion/:user — what one request publishes is its own', () => {
  test('one request alone is coherent', async ({ request }) => {
    const html = await fetchPage(request, 'ana');

    expect(painted(html, 'param')).toBe('Ana');
    expect(painted(html, 'session')).toBe('Ana');
    expect(seedOf(html)).toEqual({ user: 'Ana' });
  });

  test('two requests at once do not mix', async ({ request }) => {
    // Started together on purpose. `ana` waits 300 ms and `luis` 20 ms, so `luis` opens,
    // publishes and finishes entirely INSIDE the window `ana` is waiting in.
    const [ana, luis] = await Promise.all([fetchPage(request, 'ana'), fetchPage(request, 'luis')]);

    // Each page painted its own user, through the two paths that have to agree: the data
    // `load` returned, and the session the component injected.
    expect(painted(ana, 'param'), 'ana: the data of its own load').toBe('Ana');
    expect(painted(ana, 'session'), 'ana: the session its own request published').toBe('Ana');
    expect(painted(luis, 'param'), 'luis: the data of its own load').toBe('Luis');
    expect(painted(luis, 'session'), 'luis: the session its own request published').toBe('Luis');

    // And what each one hands the browser is its own seed, so hydration rebuilds the same
    // session the server painted rather than the other visitor's.
    expect(seedOf(ana), 'ana: its own seed').toEqual({ user: 'Ana' });
    expect(seedOf(luis), 'luis: its own seed').toEqual({ user: 'Luis' });
  });

  test('the browser rebuilds the session from the seed of its own page', async ({ page }) => {
    await page.goto('/sesion/luis');
    await expect(page.locator('sesion-panel [data-id="session"]')).toHaveText('Luis');
  });
});
