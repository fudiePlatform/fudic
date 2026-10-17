/**
 * The stock extension over real Chrome: the page it hands over, `act` through the host's settle,
 * `text` as a person sees it; plus `defineExtension` and `termsDir`.
 */

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineExtension, stock, termsDir, type BenchExtension, type TermContext } from '../src/index.js';
import { fakeHost, launch, type FakeHost } from './browser.js';

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

describe('stock', () => {
  it('hands over the host page itself', () => {
    expect(ctx.page).toBe(host.page);
  });

  it('ignores the ctx it receives: the base ctx is built from the host alone', async () => {
    const other: TermContext = {
      page,
      locate: () => {
        throw new Error('not this one');
      },
      act: () => Promise.reject(new Error('not this one')),
      text: () => Promise.reject(new Error('not this one')),
    };
    const built = stock.context!(other, host);
    expect(built).not.toBe(other);
    await page.setContent('<ui-a>hi</ui-a>');
    expect(await built.text(built.locate('ui-a'))).toBe('hi');
  });

  it('has no setup: it does not prepare the page', () => {
    expect(stock.setup).toBeUndefined();
  });
});

describe('ctx.act', () => {
  it('runs the gesture through the host settle and returns its result', async () => {
    await page.setContent('<button onclick="this.textContent = \'done\'">go</button>');
    const button = ctx.locate('button');
    const result = await ctx.act(button, async () => {
      await button.click();
      return 42;
    });
    expect(result).toBe(42);
    expect(host.settled).toHaveLength(1);
    expect(await ctx.text(button)).toBe('done');
  });

  it('hands settle the raw locator of a ctx.locate: what the host reads while waiting neither counts nor marks', async () => {
    await page.setContent('<button style="margin:0">go</button><button>other</button>');
    const button = ctx.locate('role:button/"go"');
    await ctx.act(button, async () => undefined);
    const raw = host.settled[0]!;
    expect(raw).not.toBe(button);
    expect(raw.toString()).toBe(button.toString());
    await raw.isVisible();
    expect(host.located).toEqual([]);
  });

  it('hands settle any other locator as it is', async () => {
    await page.setContent('<button>go</button>');
    const plain = page.locator('button');
    await ctx.act(plain, async () => undefined);
    expect(host.settled[0]).toBe(plain);
  });

  it('a gesture that rejects rejects act', async () => {
    await page.setContent('<button>go</button>');
    const button = ctx.locate('button');
    await expect(ctx.act(button, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(host.settled).toHaveLength(1);
  });
});

describe('ctx.text', () => {
  it('enters shadow roots', async () => {
    await page.setContent(`
      <ui-card><template shadowrootmode="open"><h2>Title</h2><p>Body</p></template></ui-card>`);
    expect(await ctx.text(ctx.locate('ui-card'))).toBe('TitleBody');
  });

  it('puts in each slot what is assigned to it, the default slot included', async () => {
    await page.setContent(`
      <ui-card>
        <template shadowrootmode="open">[<slot name="icon"></slot>] <slot></slot></template>
        <span slot="icon">★</span>
        Hello
      </ui-card>`);
    expect(await ctx.text(ctx.locate('ui-card'))).toBe('[★] Hello');
  });

  it('a slot with nothing assigned shows its fallback content', async () => {
    await page.setContent(`
      <ui-card><template shadowrootmode="open"><slot name="icon">no icon</slot></template></ui-card>`);
    expect(await ctx.text(ctx.locate('ui-card'))).toBe('no icon');
  });

  it('skips style, script and template, and comments', async () => {
    await page.setContent(`
      <ui-card>
        <template shadowrootmode="open">
          <style>p { color: red }</style>
          <script>void 0</script>
          <template>hidden</template>
          <!-- a comment -->
          <p>shown</p>
        </template>
      </ui-card>`);
    expect(await ctx.text(ctx.locate('ui-card'))).toBe('shown');
  });

  it('collapses runs of white space and trims', async () => {
    await page.setContent('<p>  one \n\n\t two   three  </p>');
    expect(await ctx.text(ctx.locate('p'))).toBe('one two three');
  });

  it('a nested host is flattened too', async () => {
    await page.setContent(`
      <ui-outer>
        <template shadowrootmode="open">
          <ui-inner><template shadowrootmode="open">in <slot></slot></template>slotted</ui-inner>
        </template>
      </ui-outer>`);
    expect(await ctx.text(ctx.locate('ui-outer'))).toBe('in slotted');
  });

  it('marks the target, as any checked call', async () => {
    await page.setContent('<p style="margin:0">x</p>');
    await ctx.text(ctx.locate('p'));
    expect(host.located.map((l) => l.ref)).toEqual(['p']);
  });
});

describe('defineExtension', () => {
  it('returns the very extension it receives', () => {
    const extension: BenchExtension = { setup: async () => {} };
    expect(defineExtension(extension)).toBe(extension);
  });
});

describe('termsDir', () => {
  it('is absolute, exists, and has given/, when/ and then/', () => {
    const dir = termsDir();
    expect(isAbsolute(dir)).toBe(true);
    expect(statSync(dir).isDirectory()).toBe(true);
    for (const block of ['given', 'when', 'then']) expect(existsSync(join(dir, block))).toBe(true);
  });
});
