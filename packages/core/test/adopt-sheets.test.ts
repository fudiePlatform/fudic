/**
 * BUG-45 §3.1 — the shared sheets of a component created in the browser.
 *
 * A host the runtime fabricates opens its shadow root with `attachShadow`, which adopts
 * nothing. `adoptSheets` reads the specifiers its `data-fud-adopt` names and adopts the sheet
 * each `<style type="module" specifier>` of the document holds, built once.
 *
 * The cache is the module's and outlives a test, so every test names its own specifiers.
 *
 * Acceptance criteria covered: BUG-45 §5.1–§5.4.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { adoptSheets } from '../src/adopt-sheets.js';

/** A `<style type="module" specifier>` in the head, as the server hoists it. */
function moduleStyle(specifier: string, css: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.setAttribute('type', 'module');
  style.setAttribute('specifier', specifier);
  style.textContent = css;
  document.head.append(style);
  return style;
}

/** A host with its shadow root open, carrying `adopt` as its `data-fud-adopt` when given. */
function host(adopt?: string): { host: HTMLElement; shadow: ShadowRoot } {
  const el = document.createElement('div');
  if (adopt !== undefined) el.setAttribute('data-fud-adopt', adopt);
  return { host: el, shadow: el.attachShadow({ mode: 'open' }) };
}

/** The text of each adopted sheet's first rule, in adoption order. */
const rules = (shadow: ShadowRoot): string[] =>
  shadow.adoptedStyleSheets.map((s) => s.cssRules[0]!.cssText);

afterEach(() => {
  document.head.replaceChildren();
});

describe('adoptSheets — what the host names (§5.1)', () => {
  it('adopts every named sheet, in the order `data-fud-adopt` lists them', () => {
    moduleStyle('x-a', '.a { color: red; }');
    moduleStyle('_t1', ':host { color: blue; }');
    const { host: el, shadow } = host('_t1 x-a');

    adoptSheets(el, shadow);

    expect(rules(shadow)).toEqual([':host { color: blue; }', '.a { color: red; }']);
  });

  it('matches the specifier exactly, skipping the other module styles', () => {
    moduleStyle('x-b-other', '.other { color: red; }');
    moduleStyle('x-b', '.b { color: green; }');
    const { host: el, shadow } = host('x-b');

    adoptSheets(el, shadow);

    expect(rules(shadow)).toEqual(['.b { color: green; }']);
  });

  it('ignores the extra spaces of a hand-written list', () => {
    moduleStyle('x-c', '.c { color: red; }');
    const { host: el, shadow } = host('  x-c  ');

    adoptSheets(el, shadow);

    expect(shadow.adoptedStyleSheets).toHaveLength(1);
  });

  it('adds to what the shadow root already adopted, and replaces nothing', () => {
    moduleStyle('x-d', '.d { color: red; }');
    const { host: el, shadow } = host('x-d');
    const own = new CSSStyleSheet();
    own.replaceSync('.own { color: black; }');
    shadow.adoptedStyleSheets = [own];

    adoptSheets(el, shadow);

    expect(shadow.adoptedStyleSheets[0]).toBe(own);
    expect(rules(shadow)).toEqual(['.own { color: black; }', '.d { color: red; }']);
  });
});

describe('adoptSheets — one sheet per specifier (§5.2)', () => {
  it('hands every instance the same sheet object', () => {
    moduleStyle('x-e', '.e { color: red; }');
    const one = host('x-e');
    const two = host('x-e');

    adoptSheets(one.host, one.shadow);
    adoptSheets(two.host, two.shadow);

    expect(two.shadow.adoptedStyleSheets[0]).toBe(one.shadow.adoptedStyleSheets[0]);
  });

  it('builds it once: the `<style>` is not read again', () => {
    const style = moduleStyle('x-f', '.f { color: red; }');
    const one = host('x-f');
    adoptSheets(one.host, one.shadow);
    style.remove();

    const two = host('x-f');
    adoptSheets(two.host, two.shadow);

    expect(rules(two.shadow)).toEqual(['.f { color: red; }']);
  });
});

describe('adoptSheets — what is not there (§5.3, §5.4)', () => {
  it('leaves a host with no `data-fud-adopt` alone', () => {
    const { host: el, shadow } = host();

    adoptSheets(el, shadow);

    expect(shadow.adoptedStyleSheets).toEqual([]);
  });

  it('adopts what it finds and skips a specifier with no `<style>` in the document', () => {
    moduleStyle('x-g', '.g { color: red; }');
    const { host: el, shadow } = host('_missing-g x-g');

    adoptSheets(el, shadow);

    expect(rules(shadow)).toEqual(['.g { color: red; }']);
  });

  it('finds a sheet that arrives after a host missed it', () => {
    const first = host('x-h');
    adoptSheets(first.host, first.shadow);
    expect(first.shadow.adoptedStyleSheets).toEqual([]);

    moduleStyle('x-h', '.h { color: red; }');
    const second = host('x-h');
    adoptSheets(second.host, second.shadow);

    expect(rules(second.shadow)).toEqual(['.h { color: red; }']);
  });
});
