/**
 * SDD-59 §3.5 and §6.7.1–3: the stock vocabulary. Each term is valid as SDD-52 reads it in the
 * framework layer, and each one, run with the stock ctx over real Chrome, passes its positive
 * case and fails — never errs — its negative one, with the evidence of §3.5.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readTermModule } from '@fudic/spec';
import type { Browser, Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stock, termsDir, type Term, type TermContext, type TermOutcome } from '../src/index.js';
import { fakeHost, launch, type FakeHost } from './browser.js';

/** §3.5, block by block. */
const VOCABULARY = {
  given: [],
  when: ['click', 'focus', 'press', 'set-attribute', 'type'],
  then: ['attribute', 'focused', 'hidden', 'min-height', 'min-width', 'slotted', 'text', 'visible'],
} as const;

type Block = keyof typeof VOCABULARY;

const file = (block: Block, name: string) => join(termsDir(), block, `${name}.js`);

async function load(block: Block, name: string): Promise<Term & Record<string, unknown>> {
  return (await import(pathToFileURL(file(block, name)).href)) as Term & Record<string, unknown>;
}

const ALL = (Object.keys(VOCABULARY) as Block[]).flatMap((block) => VOCABULARY[block].map((name) => [block, name] as const));

describe('§6.7.1–2 — the vocabulary on disk', () => {
  it('has exactly the terms of §3.5, and nothing else', () => {
    for (const block of Object.keys(VOCABULARY) as Block[]) {
      const names = readdirSync(join(termsDir(), block))
        .filter((entry) => entry.endsWith('.js'))
        .map((entry) => entry.slice(0, -3))
        .sort();
      expect(names, block).toEqual([...VOCABULARY[block]]);
    }
  });

  it.each(ALL)('%s/%s passes the validator of SDD-52 in the framework layer, without diagnostics', (block, name) => {
    const module = readTermModule(readFileSync(file(block, name), 'utf8'), file(block, name), 'framework', block);
    expect(module.diagnostics).toEqual([]);
    expect(module).toMatchObject({ layer: 'framework', block, name });
  });

  it.each(ALL)('%s/%s exports meta and run, and no selfTest (§4.9)', async (block, name) => {
    const term = await load(block, name);
    expect(term.meta).toMatchObject({ name, block });
    expect(typeof term.run).toBe('function');
    expect('selfTest' in term).toBe(false);
  });
});

describe('§3.5 — what each term says it does', () => {
  it.each([
    ['when', 'click', { target: 'ui-a' }, 'the user clicks ui-a'],
    ['when', 'focus', { target: 'ui-a' }, 'ui-a gets the focus'],
    ['when', 'press', { target: 'ui-a', key: 'Enter' }, 'the user presses Enter on ui-a'],
    ['when', 'set-attribute', { target: 'ui-a', attribute: 'open', value: '' }, 'ui-a gets open=""'],
    ['when', 'type', { target: 'ui-a', text: 'hi' }, 'the user types "hi" in ui-a'],
    ['then', 'attribute', { target: 'ui-a', attribute: 'role', expected: 'tab' }, 'ui-a has role="tab"'],
    ['then', 'focused', { target: 'ui-a' }, 'ui-a has the focus'],
    ['then', 'hidden', { target: 'ui-a' }, 'ui-a is hidden'],
    ['then', 'min-height', { target: 'ui-a', px: 44 }, 'ui-a is at least 44px tall'],
    ['then', 'min-width', { target: 'ui-a', px: 44 }, 'ui-a is at least 44px wide'],
    ['then', 'slotted', { target: 'ui-a', slot: 'icon' }, 'ui-a is in the icon slot'],
    ['then', 'text', { target: 'ui-a', expected: 'Hi' }, 'ui-a says "Hi"'],
    ['then', 'visible', { target: 'ui-a' }, 'ui-a is visible'],
  ] as const)('%s/%s', async (block, name, args, said) => {
    expect((await load(block, name)).meta.describe!(args)).toBe(said);
  });
});

let browser: Browser;
let page: Page;
let host: FakeHost;
let ctx: TermContext;

beforeAll(async () => {
  browser = await launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  host = fakeHost(page);
  ctx = stock.context!(undefined as never, host);
});

afterEach(async () => {
  await page.close();
});

/** Runs a stock term with the stock ctx. */
async function run(block: Block, name: string, args: Record<string, string | number>): Promise<TermOutcome> {
  return (await load(block, name)).run(ctx, args);
}

/** What the page says of itself, for the `when` terms. */
const read = (script: string) => page.evaluate(script);

describe('§6.7.3 — when', () => {
  it('click clicks, through act, and says so', async () => {
    await page.setContent('<button onclick="this.textContent = \'done\'">go</button>');
    expect(await run('when', 'click', { target: 'role:button' })).toEqual({ pass: true, evidence: 'clicked role:button' });
    expect(await page.locator('button').textContent()).toBe('done');
    expect(host.settled).toHaveLength(1);
  });

  it('press focuses the target and presses the key on it, through act', async () => {
    await page.setContent(
      '<input aria-label="field" onkeydown="window.keys = (window.keys || []).concat(event.key)"><button>other</button>',
    );
    expect(await run('when', 'press', { target: 'role:textbox', key: 'x' })).toEqual({ pass: true, evidence: 'pressed x' });
    expect(await run('when', 'press', { target: 'role:textbox', key: 'Shift+Tab' })).toEqual({ pass: true, evidence: 'pressed Shift+Tab' });
    expect(await read('window.keys')).toEqual(['x', 'Shift', 'Tab']);
    expect(host.settled).toHaveLength(2);
  });

  it('press reaches a component through its shadow root', async () => {
    await page.setContent(`
      <ui-menu><template shadowrootmode="open" shadowrootdelegatesfocus><button onkeydown="this.textContent = event.key">menu</button></template></ui-menu>`);
    await run('when', 'press', { target: 'ui-menu', key: 'x' });
    expect(await ctx.text(ctx.locate('ui-menu'))).toBe('x');
  });

  it('type writes the text key by key, through act', async () => {
    await page.setContent('<input aria-label="name" oninput="window.inputs = (window.inputs || 0) + 1">');
    expect(await run('when', 'type', { target: 'role:textbox', text: 'hola' })).toEqual({ pass: true, evidence: 'typed "hola"' });
    expect(await page.locator('input').inputValue()).toBe('hola');
    expect(await read('window.inputs')).toBe(4);
    expect(host.settled).toHaveLength(1);
  });

  it('focus gives the focus, without a gesture to wait for', async () => {
    await page.setContent('<input aria-label="a"><button>b</button>');
    expect(await run('when', 'focus', { target: 'role:button' })).toEqual({ pass: true, evidence: 'focused role:button' });
    expect(await read('document.activeElement.localName')).toBe('button');
    expect(host.settled).toEqual([]);
  });

  it('set-attribute sets it, through act, and says it was not there', async () => {
    await page.setContent('<ui-a></ui-a>');
    expect(await run('when', 'set-attribute', { target: 'ui-a', attribute: 'variant', value: 'highlight' })).toEqual({
      pass: true,
      evidence: 'before: none',
    });
    expect(await page.locator('ui-a').getAttribute('variant')).toBe('highlight');
    expect(host.settled).toHaveLength(1);
  });

  it('set-attribute says the value it replaced', async () => {
    await page.setContent('<ui-a variant="plain"></ui-a>');
    expect(await run('when', 'set-attribute', { target: 'ui-a', attribute: 'variant', value: '' })).toEqual({
      pass: true,
      evidence: 'before: "plain"',
    });
    expect(await page.locator('ui-a').getAttribute('variant')).toBe('');
  });
});

describe('§6.7.3 — then', () => {
  it('visible: pass when on screen, fail when hidden or not there', async () => {
    await page.setContent('<ui-a>a</ui-a><ui-b style="display:none">b</ui-b>');
    expect(await run('then', 'visible', { target: 'ui-a' })).toEqual({ pass: true, evidence: 'visible' });
    expect(await run('then', 'visible', { target: 'ui-b' })).toEqual({ pass: false, evidence: 'hidden' });
    expect(await run('then', 'visible', { target: 'ui-c' })).toEqual({ pass: false, evidence: 'hidden' });
  });

  it('hidden: pass when hidden or not there, fail when on screen', async () => {
    await page.setContent('<ui-a>a</ui-a><ui-b style="display:none">b</ui-b>');
    expect(await run('then', 'hidden', { target: 'ui-b' })).toEqual({ pass: true, evidence: 'hidden' });
    expect(await run('then', 'hidden', { target: 'ui-c' })).toEqual({ pass: true, evidence: 'hidden' });
    expect(await run('then', 'hidden', { target: 'ui-a' })).toEqual({ pass: false, evidence: 'visible' });
  });

  it('text: pass when the visible text contains it, through shadow roots and slots; fail with expected and actual', async () => {
    await page.setContent(`
      <ui-card><template shadowrootmode="open"><h2>Title</h2> <slot></slot></template>Body text</ui-card>`);
    expect(await run('then', 'text', { target: 'ui-card', expected: 'Title Body' })).toEqual({
      pass: true,
      evidence: { expected: 'Title Body', actual: 'Title Body text' },
    });
    expect(await run('then', 'text', { target: 'ui-card', expected: 'Footer' })).toEqual({
      pass: false,
      evidence: { expected: 'Footer', actual: 'Title Body text' },
    });
  });

  it('attribute: pass on exactly that value; fail on another, and on none with actual null', async () => {
    await page.setContent('<button aria-expanded="true">a</button>');
    expect(await run('then', 'attribute', { target: 'role:button', attribute: 'aria-expanded', expected: 'true' })).toEqual({
      pass: true,
      evidence: { expected: 'true', actual: 'true' },
    });
    expect(await run('then', 'attribute', { target: 'role:button', attribute: 'aria-expanded', expected: 'tru' })).toEqual({
      pass: false,
      evidence: { expected: 'tru', actual: 'true' },
    });
    expect(await run('then', 'attribute', { target: 'role:button', attribute: 'aria-pressed', expected: 'true' })).toEqual({
      pass: false,
      evidence: { expected: 'true', actual: null },
    });
  });

  it('focused: pass on the focused element inside a shadow root; fail saying where the focus is', async () => {
    await page.setContent(`
      <ui-menu><template shadowrootmode="open"><ul role="menu"><li role="menuitem" tabindex="-1">Primero</li><li role="menuitem" tabindex="-1">Segundo</li></ul></template></ui-menu>
      <input aria-label="outside">`);
    expect(await run('then', 'focused', { target: 'role:menuitem/"Primero"' })).toEqual({ pass: false, evidence: 'the focus is on nothing' });
    await ctx.locate('role:menuitem/"Primero"').focus();
    expect(await run('then', 'focused', { target: 'role:menuitem/"Primero"' })).toEqual({ pass: true, evidence: 'focused' });
    expect(await run('then', 'focused', { target: 'role:menuitem/"Segundo"' })).toEqual({ pass: false, evidence: 'the focus is on li' });
    // The host holds the focus of its shadow root, but it is not the focused element.
    expect(await run('then', 'focused', { target: 'ui-menu' })).toEqual({ pass: false, evidence: 'the focus is on li' });
    await ctx.locate('role:textbox').focus();
    expect(await run('then', 'focused', { target: 'role:menuitem/"Primero"' })).toEqual({ pass: false, evidence: 'the focus is on input' });
  });

  it('slotted: pass on the slot it went to, named or default; fail saying which, or none', async () => {
    await page.setContent(`
      <ui-card>
        <template shadowrootmode="open"><slot name="icon"></slot><slot></slot></template>
        <span slot="icon" role="img" aria-label="estrella">★</span>
        <span role="note">body</span>
        <ui-badge slot="badge">new</ui-badge>
      </ui-card>`);
    expect(await run('then', 'slotted', { target: 'role:img/"estrella"', slot: 'icon' })).toEqual({
      pass: true,
      evidence: { expected: 'icon', actual: 'icon' },
    });
    expect(await run('then', 'slotted', { target: 'role:note', slot: 'default' })).toEqual({
      pass: true,
      evidence: { expected: 'default', actual: 'default' },
    });
    expect(await run('then', 'slotted', { target: 'role:img/"estrella"', slot: 'default' })).toEqual({
      pass: false,
      evidence: { expected: 'default', actual: 'icon' },
    });
    // A slot the component does not declare: assigned nowhere. By tag: an element assigned nowhere
    // is not rendered, so it has no role for a `role:` reference to find.
    expect(await run('then', 'slotted', { target: 'ui-badge', slot: 'badge' })).toEqual({
      pass: false,
      evidence: { expected: 'badge', actual: 'none' },
    });
  });

  it('slotted: an element no slot took is not rendered, so a role finds nothing: none, at once', async () => {
    await page.setContent(`
      <ui-card><template shadowrootmode="open"><p>card</p></template><span slot="icon" role="img" aria-label="estrella">★</span></ui-card>`);
    expect(await run('then', 'slotted', { target: 'role:img/"estrella"', slot: 'icon' })).toEqual({
      pass: false,
      evidence: { expected: 'icon', actual: 'none' },
    });
  });

  it.each([
    ['text', { expected: 'x' }, { expected: 'x', actual: 'not there' }],
    ['attribute', { attribute: 'role', expected: 'x' }, { expected: 'x', actual: 'not there' }],
    ['focused', {}, 'not there'],
    ['min-height', { px: 1 }, 'not there'],
    ['min-width', { px: 1 }, 'not there'],
  ] as const)('%s on an element that is not there fails at once, and does not wait for it', async (name, args, evidence) => {
    await page.setContent('<ui-a></ui-a>');
    page.setDefaultTimeout(1000);
    const started = Date.now();
    expect(await run('then', name, { target: 'role:menuitem', ...args })).toEqual({ pass: false, evidence });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(host.located).toEqual([]);
  });

  it.each(['min-height', 'min-width'] as const)('%s: pass from the size up; fail below it, and on an element without a box', async (name) => {
    await page.setContent(`<ui-a style="display:block;width:44px;height:44px"></ui-a><ui-b style="display:none"></ui-b>`);
    expect(await run('then', name, { target: 'ui-a', px: 44 })).toEqual({ pass: true, evidence: '44px' });
    expect(await run('then', name, { target: 'ui-a', px: 45 })).toEqual({ pass: false, evidence: '44px' });
    expect(await run('then', name, { target: 'ui-b', px: 1 })).toEqual({ pass: false, evidence: 'not rendered' });
  });
});
