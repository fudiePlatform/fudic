import { describe, expect, it } from 'vitest';
import { firstLine, launchBrowser } from '../src/browser.js';
import { isFailure } from '../src/types.js';

describe('launchBrowser without Chrome', () => {
  it('answers FUD0975 with the first line of what Playwright threw', async () => {
    const answer = await launchBrowser({
      launch: () =>
        Promise.reject(
          new Error("browserType.launch: Chromium distribution 'chrome' is not found\nRun npx playwright install chrome"),
        ),
    });
    if (!isFailure(answer)) throw new Error('expected a failure');
    expect(answer.diagnostic).toMatchObject({ code: 'FUD0975', severity: 'error' });
    expect(answer.diagnostic.message).toContain("Chromium distribution 'chrome' is not found");
    expect(answer.diagnostic.message).not.toContain('playwright install');
  });

  it('asks for the system Chrome without a window, and survives a rejection that is not an Error', async () => {
    let asked: unknown;
    const answer = await launchBrowser({
      launch: (options) => {
        asked = options;
        return Promise.reject('no chrome here');
      },
    });
    expect(asked).toEqual({ channel: 'chrome', headless: true });
    expect(isFailure(answer) && answer.diagnostic.message).toContain('no chrome here');
  });
});

describe('firstLine', () => {
  it('takes the first line of an error or of anything thrown', () => {
    expect(firstLine(new Error('one\ntwo'))).toBe('one');
    expect(firstLine('plain\nrest')).toBe('plain');
    expect(firstLine(42)).toBe('42');
  });
});
