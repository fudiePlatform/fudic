/**
 * SDD-86 §3.1, §4.7, criterion 21 — the seven hooks are globals of `@code`, like `props`, and a
 * function that does not fit, or a cleanup that is not a function, is an ordinary TypeScript
 * error on the `.fud`. Measured with the real checker over the projected corpus.
 */
import { describe, expect, it } from 'vitest';
import { typecheckCorpus } from './typecheck.js';

const FILE = 'sdd86/app-hooks.fud';
const ROUTE = 'sdd86/ruta-hooks.fud';

const component = (code: string): string =>
  ['@code {', code, '}', '<app-hooks>', '  <template shadowrootmode="open"><p>x</p></template>', '</app-hooks>', ''].join('\n');

const route = (code: string): string => ['@code {', code, '}', '<p>x</p>', ''].join('\n');

/** `code text-under-it` of every complaint on `file`. */
function said(file: string, source: string): string[] {
  return typecheckCorpus({ [file]: source })
    .filter((d) => d.fud === file)
    .map((d) => `${d.code} ${d.sourceText ?? '?'}`);
}

const HOOKS = ['beforeHydrate', 'afterHydrate', 'beforeCreate', 'afterCreate', 'onConnect', 'onDisconnect', 'onDispose'];

describe('criterion 21', () => {
  it("afterHydrate((host) => { host.dataset.x = '1'; }) has no type error", () => {
    expect(said(FILE, component("afterHydrate((host) => { host.dataset.x = '1'; });"))).toEqual([]);
  });

  it('afterHydrate(42) is a type error, on the argument', () => {
    const found = said(FILE, component('afterHydrate(42);'));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^2345 42$/u);
  });

  it('onConnect(() => 42) is a type error: 42 is not a cleanup', () => {
    expect(said(FILE, component('onConnect(() => 42);')).length).toBeGreaterThan(0);
  });
});

describe('the seven, as globals of @code (§3.1)', () => {
  it('none needs an import, and host is an HTMLElement in every one', () => {
    const code = HOOKS.map((h) => `${h}((host) => { const el: HTMLElement = host; el.toggleAttribute('x'); });`).join('\n');
    expect(said(FILE, component(code))).toEqual([]);
  });

  it('a function that takes no host fits too', () => {
    expect(said(FILE, component(HOOKS.map((h) => `${h}(() => {});`).join('\n')))).toEqual([]);
  });

  it('afterHydrate, afterCreate and onConnect may return their cleanup', () => {
    const code = ['afterHydrate', 'afterCreate', 'onConnect'].map((h) => `${h}(() => () => {});`).join('\n');
    expect(said(FILE, component(code))).toEqual([]);
  });

  it('an async afterHydrate — the IndexedDB example of §4.9', () => {
    expect(said(FILE, component('afterHydrate(async () => { await Promise.resolve(); });'))).toEqual([]);
  });

  it('a cleanup that is not a function is an error in each of the three', () => {
    for (const h of ['afterHydrate', 'afterCreate', 'onConnect']) {
      expect(said(FILE, component(`${h}(() => 'nope');`)).length, h).toBeGreaterThan(0);
    }
  });

  it('host is not something else: reading a property HTMLElement lacks is an error', () => {
    expect(said(FILE, component('onConnect((host) => { host.notAProperty; });')).length).toBeGreaterThan(0);
  });

  it('a hook with no argument, or a non-function, is an error', () => {
    expect(said(FILE, component('onDispose();')).length).toBeGreaterThan(0);
    expect(said(FILE, component("beforeHydrate('x');")).length).toBeGreaterThan(0);
  });

  it('the five that are not create hooks type-check in a route as well', () => {
    const code = ['beforeHydrate', 'afterHydrate', 'onConnect', 'onDisconnect', 'onDispose']
      .map((h) => `${h}((host) => { host.dataset.r = '1'; });`)
      .join('\n');
    expect(said(ROUTE, route(code))).toEqual([]);
  });
});
