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
  // And the OWNER of the form up, which is what every test here drives. `fud:ready` says the
  // runtime is installed, not that the eager pass of §4.5 has finished: reading the form before
  // `app-form` reports hydrated was a race these tests lost more often than they won, because
  // a focus or a `fill` is not a gesture that would bring it up on its own.
  await page.waitForFunction(() => window.__hydrated.some((h) => h.tag === 'app-form'), null, {
    timeout: 10_000,
  });
}

/**
 * A field's `<input>`, found by the id the page gave its host. The page has two `app-input`
 * and an `app-field` now, so "the" control-component is no longer a thing to look for.
 */
const inner = (page: Page, host: string) => page.locator(`app-form #${host} input`);
const alias = (page: Page) => inner(page, 'ali');
const email = (page: Page) => inner(page, 'email');
const web = (page: Page) => inner(page, 'web');
/** A plain field of the fudic form, one shadow root down. */
const field = (page: Page, id: string) => page.locator(`app-form input#${id}`);
const nameField = (page: Page) => field(page, 'nom');
/** The element the view marked with `error=@userForm.<path>`, by the id the compiler gave it. */
const errorOf = (page: Page, path: string) => page.locator(`app-form #fud-e-userForm-${path}`);
const nameError = (page: Page) => errorOf(page, 'name');
/** The alias's marker: an `app-error` beside the control-component, in the page's tree. */
const aliasError = (page: Page) => errorOf(page, 'alias');
/** The web field's own marker, inside `app-field` beside its `<input>`. */
const webError = (page: Page) => page.locator('app-form #web .error');
const summary = (page: Page) => page.locator('app-form #fud-s-userForm');
const groupSummary = (page: Page) => page.locator('app-form #fud-s-userForm-acceso');
const button = (page: Page) => page.locator('app-form button[type="submit"]');
const submit = (page: Page) => button(page).click();
/**
 * The form's own submit, for a state in which `$valid()` has disabled the button. What is under
 * test there is what the binding does with a submit — and the keyboard cannot give one: the
 * implicit submission of a form whose default button is disabled does nothing.
 */
const forceSubmit = (page: Page) =>
  page.evaluate(() => {
    document.querySelector('app-form')!.shadowRoot!.querySelector('form')!.requestSubmit();
  });
/** Type into a field and leave it, which is the moment `ValidateOn.Blur` validates. */
async function enter(target: ReturnType<typeof field>, text: string): Promise<void> {
  await target.fill(text);
  await target.blur();
}
/** The focused element, followed down through every shadow root: `tag#id` per level. */
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

test.describe('BUG-41 §1 — an error that goes when it is corrected (criterion 20)', () => {
  test('the steps of §1 leave the form sendable, and each field says its own text', async ({
    page,
  }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);

    // 1. Two characters and a submit: the alias complains, in the words the CONTROL declared.
    await nameField(page).fill('Ada');
    await alias(page).fill('ab');
    await forceSubmit(page);
    await expect(aliasError(page)).toHaveText('El alias necesita al menos 3 caracteres.');
    await expect(alias(page)).toHaveAttribute('aria-invalid', 'true');

    // 2. Corrected: the message goes at the keystroke, with no submit in between.
    await alias(page).fill('abc');
    await expect(aliasError(page)).toHaveText('');
    await expect(alias(page)).not.toHaveAttribute('aria-invalid');

    // 3. And the next submit leaves the alias and the name with nothing to say.
    await forceSubmit(page);
    await expect(aliasError(page)).toHaveText('');
    await expect(nameError(page)).toHaveText('');
  });

  test('leaving an empty required field says so, and the marker is what the input points at', async ({
    page,
  }) => {
    await open(page);
    await nameField(page).focus();
    await nameField(page).blur();
    await expect(nameError(page)).toHaveText('Escribe tu nombre.');
    const describedBy = await nameField(page).getAttribute('aria-describedby');
    expect(await nameError(page).getAttribute('id')).toBe(describedBy);
  });

  test('the first submit of an empty form marks every field before anything is sent', async ({
    page,
  }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);
    await submit(page);
    await expect(nameError(page)).toHaveText('Escribe tu nombre.');
    await expect(aliasError(page)).toHaveText('Elige un alias.');
  });

  test('a known error does not hand the submit to the browser’s own bubble', async ({ page }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);
    // Counted in the capture phase, ahead of everything: a submit the browser's constraint
    // validation stopped never fires at all, and this stays where it was.
    await page.evaluate(() => {
      const form = document.querySelector('app-form')!.shadowRoot!.querySelector('form')!;
      (window as unknown as { __submits: number }).__submits = 0;
      form.addEventListener('submit', () => (window as unknown as { __submits: number }).__submits++, true);
    });
    await expect(page.locator('app-form form')).toHaveAttribute('novalidate', '');

    await submit(page);
    await nameField(page).fill('Ada');
    await forceSubmit(page);
    expect(await page.evaluate(() => (window as unknown as { __submits: number }).__submits)).toBe(2);
    await expect(aliasError(page)).toHaveText('Elige un alias.');
    await expect(nameError(page)).toHaveText('');
    // The form has a summary with `fields`, so a failed submit hands the focus to IT (BUG-42
    // §4.7) — the first failing field no longer takes it.
    await expect(summary(page)).toBeFocused();
  });

  test('once left, the keystroke that breaks the value brings the error back', async ({ page }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);
    await alias(page).fill('abc');
    await alias(page).blur();
    await expect(aliasError(page)).toHaveText('');

    // Back in the field, and no blur this time: the keystroke alone has to say it.
    await alias(page).focus();
    await page.keyboard.press('Backspace');
    await expect(aliasError(page)).toHaveText('El alias necesita al menos 3 caracteres.');
    await page.keyboard.type('c');
    await expect(aliasError(page)).toHaveText('');
  });
});

/**
 * BUG-42 criterion 40 — the steps of §0.6, one test each.
 *
 * Steps 13 and 14 — the name and description of every input, and the same with the bridge
 * taken away — are in `forms-a11y.spec.ts`, which runs its whole battery twice.
 */
test.describe('BUG-42 §0.6 — what the example does in the browser', () => {
  const MARKERS = ['name', 'alias', 'email', 'acceso-clave', 'acceso-repetir'];

  test('1 · on arrival: no message, no red field, empty summaries, the button enabled', async ({
    page,
  }) => {
    await open(page);
    for (const path of MARKERS) await expect(errorOf(page, path)).toHaveText('');
    await expect(webError(page)).toHaveText('');
    for (const box of [summary(page), groupSummary(page)]) {
      expect(await box.evaluate((el) => el.childNodes.length)).toBe(0);
    }
    await expect(page.locator('app-form [aria-invalid="true"]')).toHaveCount(0);
    await expect(button(page)).toBeEnabled();
  });

  test('2 · leaving Name empty says so, and the button disables; the summary stays empty', async ({
    page,
  }) => {
    await open(page);
    await nameField(page).focus();
    await nameField(page).blur();
    await expect(nameError(page)).toHaveText('Escribe tu nombre.');
    await expect(button(page)).toBeDisabled();
    await expect(summary(page)).toBeEmpty();
  });

  test('3 · the form summary says BOTH of its errors, as a list', async ({ page }) => {
    await open(page);
    await enter(nameField(page), 'pedro');
    await enter(alias(page), 'pedro');
    await enter(field(page, 'cla'), 'pedro1234');
    await expect(summary(page).locator('ul > li')).toHaveText([
      'El alias no puede ser tu nombre.',
      'La contraseña no puede contener tu nombre.',
    ]);
    await expect(button(page)).toBeDisabled();
  });

  test('4 · different passwords: the group summary says so, inside the fieldset', async ({
    page,
  }) => {
    await open(page);
    await enter(field(page, 'cla'), 'abcdefgh');
    await enter(field(page, 'rep'), 'abcdefgx');
    await expect(groupSummary(page).locator('ul > li')).toHaveText(['Las contraseñas no coinciden.']);
    await expect(page.locator('app-form fieldset #fud-s-userForm-acceso')).toHaveCount(1);
  });

  test('5 · an invalid email is said in its `app-error`', async ({ page }) => {
    await open(page);
    await enter(email(page), 'pedro@');
    await expect(errorOf(page, 'email')).toHaveText('Ese email no parece válido.');
  });

  test('6 · a web that is not a URL is said inside `app-field`; empty says nothing', async ({
    page,
  }) => {
    await open(page);
    await enter(web(page), 'ftp://x');
    await expect(webError(page)).toHaveText('La web empieza por http:// o https://.');
    await enter(web(page), '');
    await expect(webError(page)).toHaveText('');
  });

  test('7 · everything right: the button enables', async ({ page }) => {
    await open(page);
    await enter(nameField(page), 'Ada');
    await enter(alias(page), 'lovelace');
    await enter(email(page), 'ada@example.com');
    await enter(field(page, 'cla'), 'analitica');
    await expect(button(page)).toBeDisabled();
    await enter(field(page, 'rep'), 'analitica');
    await expect(button(page)).toBeEnabled();
  });

  test('8 · with `Validity.Rules` the form is born invalid, and still says nothing', async ({
    page,
  }) => {
    await open(page);
    // The example ships `Interacted`, so the other policy is built here from the SAME published
    // pieces the page runs on: a form with a `required` nobody has touched.
    const seen = await page.evaluate(async () => {
      const at = '/_fudic/0.0.1/forms/';
      const { form } = (await import(`${at}form.js`)) as typeof import('@fudic/forms');
      const { control } = (await import(`${at}control.js`)) as typeof import('@fudic/forms');
      const { required } = (await import(`${at}validators.js`)) as typeof import('@fudic/forms');
      const { Validity } = (await import(`${at}internals.js`)) as typeof import('@fudic/forms');
      const rules = form({ name: control('', [required]) }, { validity: Validity.Rules });
      const interacted = form({ name: control('', [required]) });
      return {
        rules: rules.$valid(),
        interacted: interacted.$valid(),
        message: rules.name.message(),
        errors: rules.$errors(),
      };
    });
    expect(seen).toEqual({ rules: false, interacted: true, message: '', errors: null });
  });

  test('9 · a submit with nothing touched: every message, the summary lists them, focus on it', async ({
    page,
  }) => {
    await open(page);
    await submit(page);
    await expect(nameError(page)).toHaveText('Escribe tu nombre.');
    await expect(aliasError(page)).toHaveText('Elige un alias.');
    await expect(errorOf(page, 'email')).toHaveText('Escribe tu email.');
    await expect(summary(page).locator('li > a')).toHaveText([
      'Escribe tu nombre.',
      'Elige un alias.',
      'Escribe tu email.',
      'Elige una contraseña.',
      'Repite la contraseña.',
    ]);
    await expect(summary(page)).toBeFocused();
  });

  test('10 · every link of the summary puts the focus in its input, control-components too', async ({
    page,
  }) => {
    await open(page);
    await submit(page);
    const expected: Record<string, string> = {
      'Escribe tu nombre.': 'app-form > input#nom',
      'Elige un alias.': 'app-form > app-input#ali > input#campo',
      'Escribe tu email.': 'app-form > app-input#email > input#campo',
      'Elige una contraseña.': 'app-form > input#cla',
      'Repite la contraseña.': 'app-form > input#rep',
    };
    for (const [text, path] of Object.entries(expected)) {
      await summary(page).getByRole('link', { name: text }).click();
      await expect.poll(() => focusPath(page)).toBe(path);
    }
  });

  test('11 · correcting a field takes its entry out of the summary on that keystroke', async ({
    page,
  }) => {
    await open(page);
    await submit(page);
    await expect(summary(page).locator('li')).toHaveCount(5);
    await nameField(page).focus();
    await page.keyboard.type('A');
    await expect(summary(page).locator('li')).toHaveCount(4);
    await expect(summary(page)).not.toContainText('Escribe tu nombre.');
  });

  test('12 · every label focuses its input, in the four patterns', async ({ page }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);
    // Bottom to top: leaving a field paints its message UNDER it, and a label below would move
    // between the moment the click is aimed and the moment it lands.
    const labels: Record<string, string> = {
      'app-form label[for="cla"]': 'app-form > input#cla',
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
});

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

test.describe('§6.18 — the internals: `:invalid` is real, and the type is a prop', () => {
  test('one component serves any shape of input: the binding is chosen at bind time', async ({
    page,
  }) => {
    await open(page);
    await expect.poll(() => alias(page).count()).toBe(1);

    // `app-input` declares `type` as a PROP and `ctrl` as a `Control<unknown>`, so the page
    // decides the shape and the component decides nothing. Without that, a text field and a
    // number field would be two components — the six bind functions partition by type, and a
    // component that fixes its element fixes its type with it (decision 109).
    await alias(page).fill('ada');
    expect(await alias(page).getAttribute('type')).toBe('text');

    // And the value really reached the model: what proves the dispatch picked `bindText` is
    // the form agreeing, not the attribute.
    await nameField(page).fill('Ada');
    await submit(page);
    await expect(nameError(page)).toHaveText('');
    await expect(aliasError(page)).toHaveText('');
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
    // The button is already disabled by `$valid()`: the form submits itself.
    await forceSubmit(page);

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

/**
 * Every module a route can end up evaluating, keyed by file name.
 *
 * Imports are followed whether relative or absolute: since SDD-45 the runtime is PUBLISHED
 * under `/_fudic/<version>/`, and the chunks reach it by an absolute specifier — a walk that
 * followed only `./` stopped at the first runtime import and measured nothing.
 */
function closureOf(route: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const walk = (file: string): void => {
    if (out.has(file)) return;
    const code = readFileSync(file, 'utf8');
    out.set(file, code);
    for (const m of code.matchAll(/(?:from|import)\s*["']([./][^"']+)["']/gu)) {
      const spec = m[1]!;
      walk(spec.startsWith('/') ? join(DIST, spec) : join(dirname(file), spec));
    }
  };
  // The runtime travels with every page, so it is part of every route's budget. Its entry
  // names carry a build id, so they are read off the page instead of spelled here.
  for (const src of entriesOf(route)) walk(join(DIST, src));
  for (const tag of tagsOf(route)) walk(chunkOf(tag));
  return out;
}

/** The module scripts a prerendered route loads — the boot and the runtime entry. */
function entriesOf(route: string): readonly string[] {
  const html = readFileSync(join(DIST, route, 'index.html'), 'utf8');
  return [...html.matchAll(/<script type="module" src="([^"]+)"/gu)].map((m) => m[1]!);
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
    for (const token of ['setFormValue', 'setValidity', 'aria-invalid']) {
      expect(code, `\`${token}\` reached a route with no forms`).not.toContain(token);
    }
  });

  test('the route pays for the bindings it writes, and the dispatch only where it is written', async () => {
    const closure = closureOf('formularios');
    const modules = modulesOf(closure);
    const code = codeOf(closure);

    // `<input control="@userForm.name">` has a static type, so the compiler chose its binding
    // and the route carries that one module.
    expect(modules).toContain('bind-text');

    // `app-input` writes `<input type="@type">`, so its binding cannot be chosen at compile
    // time and the dispatch comes with it (decision 109). Measured in the BYTES and not in the
    // module list: only one chunk imports it, so Rollup inlines it into that chunk — which is
    // itself the point being measured, since that chunk is the component that asked for it.
    expect(code, 'the dispatch did not reach the component that wrote a dynamic type').toContain(
      '.checked',
    );

    // And what NO element of this route can be stays out — which is what says the bill is
    // itemised rather than a `@fudic/forms/dom` barrel. There is no `<select>` on this page,
    // and the dispatch cannot produce one: an `<input>` never becomes a select.
    for (const absent of ['bind-select', 'bind-select-multiple']) {
      expect(modules, `${absent} was emitted into a page that has no such element`).not.toContain(
        absent,
      );
    }
    for (const token of ['.options', 'selectedOptions']) {
      expect(code, `the coercion \`${token}\` shipped to a page with no <select>`).not.toContain(
        token,
      );
    }
  });

  test('and a route whose inputs all have a static type carries no dispatch at all', async () => {
    // The other half of the bill, and the one that makes the first half acceptable: the cost
    // of a dynamic `type` lands in the chunk of the component that wrote one, and nowhere
    // else. Measured on a route that has none.
    const closure = closureOf('hidratacion');
    expect(modulesOf(closure)).not.toContain('bind-by-type');
    expect(codeOf(closure)).not.toContain('.checked');
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
