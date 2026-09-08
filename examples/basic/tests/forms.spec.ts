/**
 * SDD-34 §6.15–§6.18 — the four criteria that only a real build and a real browser can
 * answer, read off `/formularios`.
 *
 * That page is built to be measured. It carries a form whose model lives in its own `.ts`
 * and is imported from the neutral zone (§4.4), a control-component marked `formassociated`,
 * and — beside them, on the same page — an `app-counter` that is a normal component. The two
 * halves of the exception of §4.5 are therefore measured against each other in one load:
 * `app-input` comes up because it is form-associated, `app-counter` stays HTML until the
 * user touches it.
 *
 * The budget (§6.15) is read off the CHUNKS on disk rather than off the page: what a route
 * costs is the transitive closure of the modules its tags can load, and that is a question
 * about the build output, not about what the browser happened to fetch during the test.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __ready: boolean;
    __hydrated: { readonly tag: string }[];
  }
}

/** Load with the lifecycle recorded from the first byte, and touch nothing. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__ready = false;
    window.__hydrated = [];
    document.addEventListener('fud:ready', () => {
      window.__ready = true;
    });
    document.addEventListener('fud:hydrated', (e) => {
      window.__hydrated.push((e as CustomEvent<{ tag: string }>).detail);
    });
  });
  await page.goto('/formularios');
  await page.waitForFunction(() => window.__ready);
}

/** The `<input>` inside the control-component, two shadow roots down. */
const alias = (page: Page) => page.locator('app-form app-input input');
/** The plain text field of the fudic form, one shadow root down. */
const nameField = (page: Page) => page.locator('app-form input#nom');

test.describe('§6.16 — the one hydration nobody asked for, beside one that waits', () => {
  test('the form-associated tag is up before any gesture; the plain one is not', async ({
    page,
  }) => {
    await open(page);
    // The eager path is asynchronous — it defines and hydrates like a gesture would, only
    // without a gesture — so it is awaited, not assumed.
    //
    // Awaited on the OWNER, which is the last thing the walk reports. The marked tag comes up
    // inside the subtree pass, so waiting for it left the owner's chunk still in flight and
    // `formDefined` was read on a page that had not finished coming up — a race the suite lost
    // about one run in three.
    await expect
      .poll(() => page.evaluate(() => window.__hydrated.map((h) => h.tag)), { timeout: 10_000 })
      .toContain('app-form');
    expect(await page.evaluate(() => window.__hydrated.map((h) => h.tag))).toContain('app-input');

    const state = await page.evaluate(() => ({
      inputDefined: customElements.get('app-input') !== undefined,
      counterDefined: customElements.get('app-counter') !== undefined,
      formDefined: customElements.get('app-form') !== undefined,
      // The browser's own way of saying an instance was never upgraded.
      counterUndefined: document.querySelector('app-counter:not(:defined)') !== null,
      delegates: document.querySelector('app-form')!.shadowRoot!.querySelector('app-input')!
        .shadowRoot!.delegatesFocus,
      counterDelegates: document.querySelector('app-counter')?.shadowRoot?.delegatesFocus ?? null,
    }));

    expect(state.inputDefined).toBe(true);
    expect(state.delegates).toBe(true);
    // The contrast, in the same page and the same measurement: a component with no marker
    // has no JavaScript at all yet, and its shadow root does not delegate focus.
    expect(state.counterDefined).toBe(false);
    expect(state.counterUndefined).toBe(true);
    expect(state.counterDelegates).toBe(false);
    // The owner comes up with it, and that is the exception stated in full: the node the
    // control-component edits is not in its own payload — the parent names it and hands it
    // over — so a marked tag raised alone would be the half-raised element §4.5 refuses.
    // What does NOT come up is everything that owns nothing marked, which is the counter.
    expect(state.formDefined).toBe(true);
  });

  test('the plain component still hydrates the way it always did, on the first click', async ({
    page,
  }) => {
    await open(page);
    await page.locator('app-counter').locator('.inc').click();
    await expect(page.locator('app-counter').locator('.value')).toHaveText('11');
    expect(await page.evaluate(() => customElements.get('app-counter') !== undefined)).toBe(true);
  });
});

test.describe('§6.17 — an outside label reaches the input inside the shadow root', () => {
  test('clicking the label focuses the inner input, across the boundary', async ({ page }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);

    await page.locator('app-form label[for="ali"]').click();

    // Three levels down: the document's active element is the host of the component that
    // owns the form, then the control-component, then its own `<input>`. That last hop is
    // what `delegatesFocus` buys, and it is the whole reason the marker exists.
    const focus = await page.evaluate(() => {
      const host = document.activeElement;
      const inner = host?.shadowRoot?.activeElement ?? null;
      const deepest = inner?.shadowRoot?.activeElement ?? null;
      return {
        host: host?.localName ?? null,
        inner: inner?.localName ?? null,
        deepest: deepest?.localName ?? null,
      };
    });
    expect(focus).toEqual({ host: 'app-form', inner: 'app-input', deepest: 'input' });
  });

  test('the contrast: without the marker the label reaches nothing at all', async ({ page }) => {
    await open(page);

    // The same gesture against a component that is NOT form-associated. It is not that the
    // focus stops at the host: a custom element that is not form-associated is not
    // LABELABLE, so the label has nothing to point at and the click moves no focus at all.
    // This is what the eager JavaScript of §4.5 is paid for, written down as the negative.
    const landed = await page.evaluate(() => {
      const counter = document.querySelector('app-counter')!;
      counter.id = 'no-marker';
      const label = document.createElement('label');
      label.htmlFor = 'no-marker';
      label.textContent = 'Sin marcador';
      counter.before(label);
      label.click();
      return document.activeElement?.localName ?? null;
    });
    expect(landed).toBe('body');
  });
});

test.describe('§6.18 — the internals: a foreign form picks the value up, and `:invalid` is real', () => {
  test('`setFormValue` puts the entry in the FormData of a form that is not fudic', async ({
    page,
  }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);

    await alias(page).fill('ada');

    // `#ajeno` is a plain `<form>`: nothing binds it, and what puts the entry in its
    // `FormData` is the component's own `ElementInternals`.
    const entry = await page.evaluate(() => {
      const form = document
        .querySelector('app-form')!
        .shadowRoot!.querySelector<HTMLFormElement>('#ajeno')!;
      return new FormData(form).get('alias');
    });
    expect(entry).toBe('ada');
  });

  test('`setValidity` gives the host a `:invalid` a stylesheet can rely on', async ({ page }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);

    const matches = (): Promise<{ valid: boolean; invalid: boolean }> =>
      page.evaluate(() => {
        const host = document
          .querySelector('app-form')!
          .shadowRoot!.querySelector('app-input')!;
        return { valid: host.matches(':valid'), invalid: host.matches(':invalid') };
      });

    // Nothing has been validated, so there are no errors and the host is valid.
    expect(await matches()).toEqual({ valid: true, invalid: false });

    // Two characters: enough to fail `minLength(3)` once the form validates. The submit is
    // what runs `$validate` — the author's `@submit` stops the navigation, because sending
    // is out of this SDD's scope (§7) and there is nowhere to send it.
    await alias(page).fill('ab');
    await nameField(page).fill('Ada');
    await page.locator('app-form button[type="submit"]').click();

    await expect.poll(matches).toEqual({ valid: false, invalid: true });
  });
});

/**
 * §6.15 — the budget, measured over the chunk.
 *
 * The unit is the route's transitive closure: the runtime plus the hydration chunk of every
 * tag the page carries plus everything those import. Module names survive minification
 * because Rollup names a shared chunk after the module it came from, and that is exactly the
 * grain the criterion asks about — `bindText` is a module, and so are the five that must not
 * be there.
 */
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

/** Every hydratable tag the prerendered page carries, host and shadow alike. */
function tagsOf(route: string): readonly string[] {
  const html = readFileSync(join(DIST, route, 'index.html'), 'utf8');
  const found = [...html.matchAll(/<([a-z][a-z\d]*(?:-[a-z\d]+)+)\s+data-fud-id=/gu)];
  return [...new Set(found.map((m) => m[1]!))];
}

/** The built chunk of a tag: `assets/h/<tag>-<build id>.js`. */
function chunkOf(tag: string): string {
  const dir = join(DIST, 'assets', 'h');
  const file = readdirSync(dir).find((f) => new RegExp(`^${tag}-[0-9a-f]+\\.js$`, 'u').test(f));
  expect(file, `no chunk was emitted for ${tag}`).toBeDefined();
  return join(dir, file!);
}

/** Every module a route can end up evaluating, keyed by file name. */
function closureOf(route: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const walk = (file: string): void => {
    if (out.has(file)) return;
    const code = readFileSync(file, 'utf8');
    out.set(file, code);
    for (const m of code.matchAll(/from\s*["'](\.[^"']+)["']/gu)) {
      walk(join(dirname(file), m[1]!));
    }
  };
  // The runtime travels with every page, so it is part of every route's budget.
  walk(join(DIST, 'fudic-main.js'));
  for (const tag of tagsOf(route)) walk(chunkOf(tag));
  return out;
}

/**
 * The bare module names of a closure — `bind-text`, `user.form`, `signal`…
 *
 * Rollup names a chunk after the module it came from and appends an eight-character hash
 * (the build id, for a hydration chunk), so only that suffix is stripped: a greedier cut
 * would turn `bind-text-6BTHdMhv.js` into `bind`, and the criterion is about which of the six
 * bind modules travelled.
 */
const modulesOf = (closure: ReadonlyMap<string, string>): readonly string[] =>
  [...closure.keys()].map((f) =>
    f
      .split(/[\\/]/u)
      .at(-1)!
      .replace(/-[0-9A-Za-z_-]{8}\.js$/u, '')
      .replace(/\.js$/u, ''),
  );

const codeOf = (closure: ReadonlyMap<string, string>): string => [...closure.values()].join('\n');

test.describe('§6.15 — the budget, per route, over the chunk', () => {
  test('a route with no forms does not drag one byte of @fudic/forms', async () => {
    const closure = closureOf('hidratacion');
    const modules = modulesOf(closure);
    const code = codeOf(closure);

    expect(modules.length).toBeGreaterThan(5); // it really is a page with components
    for (const module of modules) expect(module).not.toMatch(/^bind-|^user\.form$|^messages$/u);
    // And not by inlining either: nothing of the forms runtime is in the bytes.
    for (const token of ['setFormValue', 'setValidity', 'data-fud-err', 'aria-invalid']) {
      expect(code, `\`${token}\` reached a route with no forms`).not.toContain(token);
    }
  });

  test('the route with a form drags bindText and none of the other five', async () => {
    const closure = closureOf('formularios');
    const modules = modulesOf(closure);
    const code = codeOf(closure);

    expect(modules).toContain('bind-text');
    for (const other of ['bind-number', 'bind-checkbox', 'bind-radio', 'bind-select', 'bind-select-multiple']) {
      expect(modules, `${other} was emitted into a page that has no such element`).not.toContain(
        other,
      );
    }
    // The `switch (el.type)` of the prototype, measured by its absence: the coercions of the
    // shapes this page does not use are not inlined anywhere either.
    for (const token of ['.checked', '.options', 'selectedOptions']) {
      expect(code, `the coercion \`${token}\` shipped to a page with one text field`).not.toContain(
        token,
      );
    }
  });

  test('the body of a serverValidator, and its data layer, never reach the browser', async () => {
    const closure = closureOf('formularios');
    const code = codeOf(closure);

    // `ALIAS_TABLE_MARKER` is in `src/data/aliases.js`, which only the erased validator body
    // imported. If it is here, the erasure failed and Rollup kept the module alive.
    expect(code).not.toContain('alias-table-must-not-ship');
    expect(code).not.toContain('aliasTaken');
    // The call survived, so the array of validators keeps its length and its order (§4.7).
    expect(code).toContain('=>null');
  });
});
