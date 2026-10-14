import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { mount, shadowOf } from '../src/index.js';
import * as XCounter from './fixtures/x-counter.fud';

/** What the first test left, for the second to look for. */
const left: { host?: Element } = {};

describe('criterion 27: one test does not see the one before', () => {
  test('the first mounts, clicks and moves the page', async () => {
    const t = await mount(XCounter, { props: { start: 7 }, url: '/first' });
    document.documentElement.setAttribute('data-first', '');
    await t.click(t.getByRole('button'));
    left.host = t.host;
  });

  test('the second finds an empty page at the base URL, and no init of the first', async () => {
    expect(document.body.childElementCount).toBe(0);
    expect(document.head.childElementCount).toBe(0);
    expect(document.documentElement.hasAttribute('data-first')).toBe(false);
    expect(location.href).toBe('http://localhost/');
    expect(left.host!.isConnected).toBe(false);
    expect(() => shadowOf(left.host!)).toThrow('has no shadow root');
  });

  test('and a page of its own comes up cold: its first click counts again', async () => {
    const t = await mount(XCounter, { props: { start: 7 } });
    await t.click(t.getByRole('button'));
    expect(t.getByRole('status')).toHaveTextContent('8');
  });
});

describe('criterion 28: no fixed waits', () => {
  test('no file of src/ uses setTimeout', () => {
    const src = fileURLToPath(new URL('../src/', import.meta.url));
    const offenders = readdirSync(src).filter((file) => /\bsetTimeout\b/u.test(readFileSync(`${src}${file}`, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
