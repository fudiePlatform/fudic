import { describe, expect, it } from 'vitest';
import { createTermContext, parseRef } from '../src/context.js';
import { fakePage } from './helpers/fake-page.js';

describe('parseRef — criterion 9', () => {
  it('reads a tag, a role, and a role with its exact name', () => {
    expect(parseRef('app-card')).toEqual({ css: 'app-card' });
    expect(parseRef('role:tab')).toEqual({ role: 'tab' });
    expect(parseRef('role:tab/"Tab B"')).toEqual({ role: 'tab', name: 'Tab B' });
    expect(parseRef('role:link/""')).toEqual({ role: 'link', name: '' });
  });
});

describe('createTermContext, on a page without a browser', () => {
  it('fails a reference that matches more than one element, saying how many', async () => {
    const locator = createTermContext(fakePage(() => ({ count: 2 }))).locate('role:link');
    await expect(locator.box()).rejects.toThrow('role:link matches 2 elements');
    await expect(locator.textContent()).rejects.toThrow('matches 2 elements');
    await expect(locator.isVisible()).rejects.toThrow('matches 2 elements');
    await expect(locator.click()).rejects.toThrow('matches 2 elements');
    await expect(locator.setAttribute('a', 'b')).rejects.toThrow('matches 2 elements');
  });

  it('measures, reads and sees one element', async () => {
    const page = fakePage(() => ({ box: { width: 3, height: 44 }, text: 'hi', visible: false }));
    const locator = createTermContext(page).locate('app-card');
    expect(await locator.box()).toEqual({ width: 3, height: 44 });
    expect(await locator.textContent()).toBe('hi');
    expect(await locator.isVisible()).toBe(false);
  });

  it('fails a box of an element that is not rendered', async () => {
    const ctx = createTermContext(fakePage(() => ({ box: null })));
    await expect(ctx.locate('app-card').box()).rejects.toThrow('app-card is not rendered');
  });

  it('criterion 8 — tells where each reference that resolves to one element was', async () => {
    const located: [string, unknown][] = [];
    const page = fakePage((target) =>
      'css' in target && target.css === 'app-card'
        ? { box: { x: 5, y: 7, width: 3, height: 4 } }
        : 'role' in target
          ? { count: 0 }
          : { box: null },
    );
    const ctx = createTermContext(page, undefined, (ref, box) => located.push([ref, box]));
    await ctx.locate('app-card').isVisible();
    await ctx.locate('role:link').isVisible();
    await ctx.locate('hidden-thing').isVisible();
    expect(located).toEqual([['app-card', { x: 5, y: 7, width: 3, height: 4 }]]);
    // Without a callback, a located box goes nowhere.
    await expect(createTermContext(page).locate('app-card').isVisible()).resolves.toBe(true);
  });

  it('goto calls back and does not navigate; without a callback it is quiet', async () => {
    const page = fakePage();
    const paths: string[] = [];
    await createTermContext(page, (path) => paths.push(path)).goto('/blog');
    await createTermContext(page).goto('/blog');
    expect(paths).toEqual(['/blog']);
    expect(page.calls).toEqual([]);
  });
});

describe('the actions wait for the gesture to be served — criterion 11, the sequence', () => {
  it('waits for the host to hydrate, then a frame, when its tag was not defined', async () => {
    const page = fakePage(() => ({ host: { id: '3', defined: false } }));
    await createTermContext(page).locate('role:tab/"Tab B"').click();
    expect(page.calls).toEqual(['click {"role":"tab","name":"Tab B"}', 'waitFor 3', 'frame']);
  });

  it('waits only a frame when the tag was already defined', async () => {
    const page = fakePage(() => ({ host: { id: '3', defined: true } }));
    await createTermContext(page).locate('app-card').setAttribute('variant', 'highlight');
    expect(page.calls).toEqual(['setAttribute {"css":"app-card"} ["variant","highlight"]', 'frame']);
  });

  it('waits only a frame when nothing hydratable holds the element', async () => {
    const page = fakePage(() => ({ host: null }));
    await createTermContext(page).locate('app-card').click();
    expect(page.calls).toEqual(['click {"css":"app-card"}', 'frame']);
  });
});
