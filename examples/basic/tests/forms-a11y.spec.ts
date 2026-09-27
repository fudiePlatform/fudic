/**
 * BUG-42 §6.G, criteria 34–39 — and steps 13–14 of §0.6: the name and the description of every
 * input of `/formularios`, measured where a screen reader reads them.
 *
 * **Measured in Chrome's accessibility tree**, through the DevTools protocol, and not off
 * attributes. The whole point of the bridge and of the relay is that NO attribute of the inner
 * `<input>` says its name: the `<label for>` points at the host, `shadowrootreferencetarget`
 * forwards it, and the description travels by element reflection. An attribute check would
 * pass on a page that names nothing and fail on the one that works.
 *
 * **Twice.** The normal pass runs on the bridge Chrome ships. The second deletes
 * `referenceTarget` from `ShadowRoot.prototype` before the page loads, which is what a browser
 * without the bridge looks like to `FudicControlElement` (criterion 37): it then associates the
 * labels itself. Both have to give the same names.
 *
 * **axe, with one exception that expires on its own.** axe-core computes names from attributes,
 * so it cannot see a label that reaches an input through the bridge or through element
 * reflection, and it reports the two inputs of `app-input` as unlabelled — while the browser
 * names them, as the first test here proves. That false positive, and only that one, is allowed
 * (`KNOWN`). The last test asserts axe STILL reports it: the day axe learns the bridge, that
 * test fails and says to delete the exception. Lighthouse runs axe, so it says the same until
 * then (BUG-42 §6, criterion 41).
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __ready: boolean;
    __hydrated: { readonly tag: string }[];
  }
}

type Pass = 'bridge' | 'fallback';

/**
 * Load `/formularios`, without the bridge when asked, and wait for the form to be up. Resolves to
 * how many bridges the fallback took out of the HTML (none on the normal pass).
 */
async function open(page: Page, pass: Pass): Promise<number> {
  let stripped = 0;
  if (pass === 'fallback') {
    // What criterion 37 asks for: `FudicControlElement` sees no bridge and takes the fallback.
    await page.addInitScript(() => {
      delete (ShadowRoot.prototype as { referenceTarget?: unknown }).referenceTarget;
    });
    // And what it does not say but needs: the attribute out of the HTML. The server's shadow
    // roots are built by the PARSER, before any script, so without this Chrome's own bridge
    // would still name the inputs under the fallback, and the pass would never find out whether
    // the relay associates the labels.
    await page.route('**/formularios', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replaceAll(/\sshadowrootreferencetarget="[^"]*"/gu, () => {
        stripped += 1;
        return '';
      });
      await route.fulfill({ response, body });
    });
  }
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
  await page.waitForFunction(
    () => ['app-form', 'app-input', 'app-field'].every((t) => window.__hydrated.some((h) => h.tag === t)),
    null,
    { timeout: 10_000 },
  );
  return stripped;
}

/** Every textbox of the page, as Chrome's accessibility tree has it: name → description. */
async function textboxes(page: Page): Promise<Record<string, string>> {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {
      ignored: boolean;
      role?: { value: string };
      name?: { value: string };
      description?: { value: string };
    }[];
  };
  await cdp.detach();
  const out: Record<string, string> = {};
  for (const n of nodes) {
    if (n.ignored || n.role?.value !== 'textbox') continue;
    out[(n.name?.value ?? '').trim()] = (n.description?.value ?? '').trim();
  }
  return out;
}

const inner = (page: Page, host: string) => page.locator(`app-form #${host} input`);
const field = (page: Page, id: string) => page.locator(`app-form input#${id}`);
const submit = (page: Page) => page.locator('app-form button[type="submit"]').click();
async function enter(target: ReturnType<typeof field>, text: string): Promise<void> {
  await target.fill(text);
  await target.blur();
}
const focusPath = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    let at: Element | null = document.activeElement;
    while (at !== null) {
      out.push(`${at.localName}${at.id === '' ? '' : `#${at.id}`}`);
      at = at.shadowRoot?.activeElement ?? null;
    }
    return out.join(' > ');
  });

/** The four fields of §0, by the name each input must have: no asterisk in any of them. */
const NAMES = ['Nombre', 'Alias', 'Email', 'Web'];

/**
 * The one finding axe is allowed: the two inputs of `app-input`, unlabelled to a tool that
 * reads attributes. By rule and by target, so anything else — another rule, another element —
 * still fails.
 */
const KNOWN_RULES = new Set(['label', 'label-title-only']);
const KNOWN_TARGETS = new Set(['app-form > #ali > #campo', 'app-form > #email > #campo']);

interface Finding {
  readonly rule: string;
  readonly target: string;
}

async function axe(page: Page): Promise<readonly Finding[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.flatMap((v) =>
    v.nodes.map((n) => ({ rule: v.id, target: n.target.flat().join(' > ') })),
  );
}

const unexpected = (found: readonly Finding[]): readonly Finding[] =>
  found.filter((f) => !(KNOWN_RULES.has(f.rule) && KNOWN_TARGETS.has(f.target)));

for (const pass of ['bridge', 'fallback'] as const) {
  test.describe(`BUG-42 §6.G — ${pass === 'bridge' ? 'with the native bridge' : 'without it (criterion 37)'}`, () => {
    test('34 · every input has its name, the wrapped ones included, with no asterisk', async ({
      page,
    }) => {
      const stripped = await open(page, pass);
      if (pass === 'fallback') {
        // Both halves of "no bridge": no API to ask, and no bridge on any of the three
        // control-components the parser built.
        expect(stripped).toBe(3);
        expect(await page.evaluate(() => 'referenceTarget' in ShadowRoot.prototype)).toBe(false);
      }
      await expect.poll(async () => Object.keys(await textboxes(page))).toEqual(
        expect.arrayContaining(NAMES),
      );
      // `getByRole` computes names on its own: it follows the bridge but not element
      // reflection, so it can only agree with Chrome on the normal pass.
      if (pass === 'bridge') {
        for (const name of NAMES) {
          await expect(page.getByRole('textbox', { name, exact: true })).toHaveCount(1);
        }
      }
    });

    test('35 · with an error, each input is described by its message', async ({ page }) => {
      await open(page, pass);
      await enter(field(page, 'nom'), '');
      await enter(inner(page, 'ali'), 'ab');
      await enter(inner(page, 'email'), 'pedro@');
      await enter(inner(page, 'web'), 'ftp://x');
      await expect
        .poll(async () => {
          const tree = await textboxes(page);
          return NAMES.map((name) => tree[name]);
        })
        .toEqual([
          'Escribe tu nombre.',
          'El alias necesita al menos 3 caracteres.',
          'Ese email no parece válido.',
          'La web empieza por http:// o https://.',
        ]);
    });

    test('36 · every label focuses its input, in the four patterns', async ({ page }) => {
      await open(page, pass);
      // Bottom to top, so a message painted on leaving a field never moves the next label.
      const labels: Record<string, string> = {
        'app-form #web label': 'app-form > app-field#web > input#campo',
        'app-form app-label label[for="email"]': 'app-form > app-input#email > input#campo',
        'app-form label[for="ali"]': 'app-form > app-input#ali > input#campo',
        'app-form label[for="nom"]': 'app-form > input#nom',
      };
      for (const [label, path] of Object.entries(labels)) {
        await page.locator(label).click();
        await expect.poll(() => focusPath(page)).toBe(path);
      }
    });

    test('§0.6 step 10 · every link of the summary puts the focus in its input', async ({ page }) => {
      await open(page, pass);
      await submit(page);
      const expected: Record<string, string> = {
        'Escribe tu nombre.': 'app-form > input#nom',
        'Elige un alias.': 'app-form > app-input#ali > input#campo',
        'Escribe tu email.': 'app-form > app-input#email > input#campo',
      };
      for (const [text, path] of Object.entries(expected)) {
        await page.locator('app-form #fud-s-userForm').getByRole('link', { name: text }).click();
        await expect.poll(() => focusPath(page)).toBe(path);
      }
    });

    test('38 · a wrapper label with its own text, referenced by `aria-labelledby`, names the input', async ({
      page,
    }) => {
      await open(page, pass);
      // The variant the README describes and the example does not ship: no projected `<label>`,
      // a text of its own with an id, and the control's host pointing at it. It names the input
      // (through the relay), and it loses the click, which is why the example does not use it.
      await page.evaluate(() => {
        const root = document.querySelector('app-form')!.shadowRoot!;
        const wrapper = root.querySelector('app-label')!;
        const text = document.createElement('span');
        text.id = 'email-text';
        text.textContent = 'Correo';
        wrapper.replaceWith(text);
        root.querySelector('#email')!.setAttribute('aria-labelledby', 'email-text');
      });
      // Chrome's tree only: `getByRole` computes names on its own and does not follow element
      // reflection, so it would say "no such textbox" about an input a screen reader names.
      await expect.poll(async () => Object.keys(await textboxes(page))).toContain('Correo');
    });

    test('39 · axe finds nothing but its known blind spot: on arrival, after a failed submit, all valid', async ({
      page,
    }) => {
      await open(page, pass);
      expect(unexpected(await axe(page))).toEqual([]);

      await submit(page);
      await expect(page.locator('app-form #fud-s-userForm li')).toHaveCount(5);
      expect(unexpected(await axe(page))).toEqual([]);

      await enter(field(page, 'nom'), 'Ada');
      await enter(inner(page, 'ali'), 'lovelace');
      await enter(inner(page, 'email'), 'ada@example.com');
      await enter(field(page, 'cla'), 'analitica');
      await enter(field(page, 'rep'), 'analitica');
      await expect(page.locator('app-form button[type="submit"]')).toBeEnabled();
      expect(unexpected(await axe(page))).toEqual([]);
    });
  });
}

test('the exception above is still needed: axe cannot see a name given through the bridge', async ({
  page,
}) => {
  await open(page, 'bridge');
  // Chrome names both inputs — criterion 34 — and axe still says they have no label. When this
  // fails, axe has learned the bridge: delete `KNOWN_RULES`/`KNOWN_TARGETS` and this test.
  const found = await axe(page);
  const blind = found.filter((f) => f.rule === 'label').map((f) => f.target);
  expect(blind.sort()).toEqual([...KNOWN_TARGETS].sort());
});

/**
 * Every other form of `examples/basic`, measured the same way: names and descriptions in
 * Chrome's tree, and axe over the form. `/delegacion` binds twelve fields with `control`;
 * `/snippets` builds a plain `<form>` out of snippets.
 */
test.describe('BUG-42 — the other forms of the example', () => {
  /**
   * Load a route. Nothing more: a name or a description is in the server's HTML before any
   * script, and a form that needs JavaScript to be accessible is exactly what these tests catch.
   */
  async function load(page: Page, route: string): Promise<void> {
    await page.goto(route);
  }

  const axeOn = async (page: Page, selector: string): Promise<readonly Finding[]> => {
    const { violations } = await new AxeBuilder({ page }).include(selector).analyze();
    return violations.flatMap((v) => v.nodes.map((n) => ({ rule: v.id, target: n.target.flat().join(' > ') })));
  };

  test('/delegacion: twelve named fields, the error is a description and not part of the name', async ({
    page,
  }) => {
    await load(page, '/delegacion');
    // Every field named before any script runs.
    const before = await textboxes(page);
    expect(Object.keys(before)).toEqual(expect.arrayContaining(['1 (obligatorio)', '2 (mín. 2)', '12']));
    const first = page.locator('app-wide-form input').first();
    // The form comes alive on a gesture (SDD-17); retried, because a blur that lands before the
    // chunk is heard by nobody.
    await first.click();
    await expect(async () => {
      await first.focus();
      await page.locator('app-wide-form input').nth(1).focus();
      await expect(page.locator('app-wide-form .error').first()).toHaveText('El campo 1 es obligatorio.', {
        timeout: 500,
      });
    }).toPass();
    const tree = await textboxes(page);
    expect(tree['1 (obligatorio)']).toBe('El campo 1 es obligatorio.');
    for (let i = 3; i <= 12; i++) expect(Object.keys(tree)).toContain(String(i));
    expect(await axeOn(page, 'app-wide-form')).toEqual([]);
  });

  test('/snippets: the fields a snippet writes are named by the label that wraps them', async ({ page }) => {
    await load(page, '/snippets');
    const tree = await textboxes(page);
    expect(Object.keys(tree)).toEqual(expect.arrayContaining(['Correo', 'Ciudad']));
    expect(await axeOn(page, 'form.campos')).toEqual([]);
  });
});

test.describe('BUG-42 — with no JavaScript at all', () => {
  test.use({ javaScriptEnabled: false });

  test('/formularios: every input is named by the server HTML alone, bridge included', async ({ page }) => {
    // Declarative shadow DOM and `shadowrootreferencetarget` are the parser's: the `<label for>`
    // of *Alias* and *Email* reaches the input inside `app-input` with no script. What does
    // need one is the relay of a description written on the host, and the fallback.
    await page.goto('/formularios');
    const tree = await textboxes(page);
    expect(Object.keys(tree)).toEqual(expect.arrayContaining(NAMES));
  });
});
