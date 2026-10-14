import type { Browser } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { BROWSER_CHOICES, firstLine, installCommand, launchBrowser, type Launcher, type Launchers } from '../src/browser.js';
import { isFailure } from '../src/types.js';

/** Launchers that record what was asked and start only the names in `works`. */
function launchers(works: readonly string[] = [], reject: (name: string) => unknown = (name) => new Error(`${name} is not here\nmore`)) {
  const asked: string[] = [];
  const closed: string[] = [];
  const type = (kind: string): Launcher => ({
    launch: async (options) => {
      const name = options.channel ?? kind;
      asked.push(`${kind}${options.channel === undefined ? '' : `/${options.channel}`}${options.headless ? '' : ' with a window'}`);
      if (!works.includes(name)) throw reject(name);
      return { close: async () => void closed.push(name) } as unknown as Browser;
    },
  });
  const all: Launchers = { chromium: type('chromium'), firefox: type('firefox'), webkit: type('webkit') };
  return { all, asked, closed };
}

describe('launchBrowser — criterion 6', () => {
  it('auto starts chrome when it is there', async () => {
    const l = launchers(['chrome', 'msedge']);
    const browser = await launchBrowser('auto', l.all);
    expect(isFailure(browser) ? browser : browser.name).toBe('chrome');
    expect(l.asked).toEqual(['chromium/chrome']);
  });

  it('auto starts msedge when chrome fails, and the browser says which it is', async () => {
    const l = launchers(['msedge']);
    const browser = await launchBrowser(undefined, l.all);
    if (isFailure(browser)) throw new Error('expected a browser');
    expect(browser.name).toBe('msedge');
    expect(l.asked).toEqual(['chromium/chrome', 'chromium/msedge']);
    await browser.close();
    expect(l.closed).toEqual(['msedge']);
  });

  it('auto falls back to Playwright\'s chromium, with no channel', async () => {
    const l = launchers(['chromium']);
    const browser = await launchBrowser('auto', l.all);
    expect(isFailure(browser) ? browser : browser.name).toBe('chromium');
    expect(l.asked).toEqual(['chromium/chrome', 'chromium/msedge', 'chromium']);
  });

  it('when all three fail, FUD0975 names the three tried, the last reason and the install command', async () => {
    const l = launchers();
    const answer = await launchBrowser('auto', l.all);
    if (!isFailure(answer)) throw new Error('expected a failure');
    expect(answer.diagnostic).toMatchObject({ code: 'FUD0975', severity: 'error' });
    const message = answer.diagnostic.message;
    for (const name of ['chrome', 'msedge', 'chromium']) expect(message).toContain(name);
    expect(message).toContain('chromium: chromium is not here');
    expect(message).not.toContain('more');
    expect(message).toContain('npx playwright-core install chromium');
  });

  it('--browser firefox tries only firefox, and its install command says firefox', async () => {
    const l = launchers();
    const answer = await launchBrowser('firefox', l.all);
    expect(l.asked).toEqual(['firefox']);
    if (!isFailure(answer)) throw new Error('expected a failure');
    expect(answer.diagnostic.message).toContain('npx playwright-core install firefox');
    expect(answer.diagnostic.message).not.toContain('msedge');
  });

  it.each([
    ['msedge', 'chromium/msedge'],
    ['webkit', 'webkit'],
    ['chromium', 'chromium'],
  ] as const)('a name starts only that one: %s', async (name, asked) => {
    const l = launchers([name]);
    const browser = await launchBrowser(name, l.all);
    expect(isFailure(browser) ? browser : browser.name).toBe(name);
    expect(l.asked).toEqual([asked]);
  });

  it('survives a rejection that is not an Error', async () => {
    const answer = await launchBrowser('chrome', launchers([], () => 'no chrome here').all);
    expect(isFailure(answer) && answer.diagnostic.message).toContain('chrome: no chrome here');
  });
});

describe('the choices', () => {
  it('are auto and the five names', () => {
    expect(BROWSER_CHOICES).toEqual(['auto', 'chrome', 'msedge', 'chromium', 'firefox', 'webkit']);
  });

  it('install what Playwright can download: the one asked, or its chromium', () => {
    expect(installCommand('auto')).toBe('npx playwright-core install chromium');
    expect(installCommand('chrome')).toBe('npx playwright-core install chromium');
    expect(installCommand('msedge')).toBe('npx playwright-core install chromium');
    expect(installCommand('webkit')).toBe('npx playwright-core install webkit');
  });
});

describe('firstLine', () => {
  it('takes the first line of an error or of anything thrown', () => {
    expect(firstLine(new Error('one\ntwo'))).toBe('one');
    expect(firstLine('plain\nrest')).toBe('plain');
    expect(firstLine(42)).toBe('42');
  });
});
