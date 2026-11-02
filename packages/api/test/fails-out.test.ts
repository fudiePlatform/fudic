/**
 * SDD-74 §3.1, §4.2 and criteria 3 and 4 (decision 175 as decided): `fails` leaves `load` only —
 * FUD1360 on the whole line, the line dropped, the rest of the file still read. A function keeps
 * its `fails`: the server sends the code, and the browser stub carries the text of each.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations, emitModule, parseApi, type ApiLocale, type Decl } from '../src/index.js';
import { codes, slice } from './helpers.js';
import { app } from './project.js';

const MESSAGE =
  '`fails` does not belong to `load`: a page whose data fails goes to error-pages. Throw an error of @fudic/http from its handler: notFound(), forbidden().';

describe('criterion 3: FUD1360, under `load` only', () => {
  it('under `load`: FUD1360, an error, on the whole line', () => {
    const source = 'load\n  fails reserved 409 "x"\n  users  str[]';
    const { diagnostics } = parseApi(source);
    expect(diagnostics.map((d) => [d.code, d.severity, d.message])).toEqual([['FUD1360', 'error', MESSAGE]]);
    expect(slice(source, diagnostics[0]!.span)).toBe('fails reserved 409 "x"');
  });

  it('any shape of the line: bare, broken or with lines below it', () => {
    expect(codes('load\n  fails')).toEqual(['FUD1360']);
    expect(codes('load\n  fails Taken abc nope')).toEqual(['FUD1360']);
    expect(codes('load\n  fails gone 410\n    x')).toEqual(['FUD1360']);
  });

  it('the line is dropped and the rest of the file is still read', () => {
    const source = 'load\n  fails gone 410\n  users  str[]\nget f\n  fails x 409\ntype A\n  x  str';
    const { value, diagnostics } = parseApi(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD1360']);
    expect(value.declarations.map((d) => d.kind)).toEqual(['load', 'fn', 'type']);
    const load = value.declarations[0] as Extract<Decl, { kind: 'load' }>;
    expect(load).not.toHaveProperty('fails');
    expect(load.fields.map((f) => f.name.text)).toEqual(['users']);
  });

  it.each(['get', 'post', 'put', 'patch', 'delete'])('under %s: nothing, the function keeps it', (verb) => {
    const source = `${verb} f\n  catches 409\n  fails reserved 409 "x"`;
    expect(codes(source)).toEqual([]);
    const fn = parseApi(source).value.declarations[0] as Extract<Decl, { kind: 'fn' }>;
    expect(fn.fails.map((f) => [f.code.text, f.status.value, f.detail?.text])).toEqual([['reserved', 409, 'x']]);
  });

  it('under a rule and under a middleware: nothing', () => {
    expect(codes('rule r\n  on form\n  runs both\n  fails r')).toEqual([]);
    expect(codes('middleware m\n  client\n  fails cross-site 403 "x"')).toEqual([]);
  });
});

describe('criterion 4: what is generated', () => {
  const emitted = (text: string, i18n?: ApiLocale) => {
    const source = app('routes/r', text);
    const index = createApiIndex([source]);
    return {
      dts: emitDeclarations(source, index, {}),
      server: emitModule(source, index, {}, 'server', ...(i18n === undefined ? [] : [i18n])),
      browser: emitModule(source, index, {}, 'browser', ...(i18n === undefined ? [] : [i18n])),
    };
  };

  it('`load` with a `fails` line emits no LoadFails', () => {
    for (const text of Object.values(emitted('load\n  fails gone 410\n'))) expect(text).not.toContain('LoadFails');
  });

  it('a function with `fails full 409 "x"`: the .d.ts exports SaveFails, the stub carries fails: { full: "x" }', () => {
    const { dts, server, browser } = emitted('post save\n  catches 409\n  fails full 409 "x"\n  fails gone 410\n');
    expect(dts).toContain('export const SaveFails: { readonly full: () => HttpError; readonly gone: () => HttpError };');
    expect(server).toContain('SaveFails = fails({ full: [409, "x"], gone: [410] })');
    expect(browser).toContain('fails: { "full": "x" }');
    // A code with no text has nothing for the page to put: the stub leaves it out.
    expect(browser).not.toMatch(/"gone":/u);
  });

  it('a function without a text in its `fails` carries no `fails` in its stub', () => {
    expect(emitted('post save\n  fails gone 410\n').browser).not.toContain('fails: {');
  });

  it('the stub of a locale carries each text in that locale', () => {
    const en: ApiLocale = { translate: (m) => (m.source === 'Ya no quedan plazas.' ? ['No places left.'] : undefined) };
    const { browser } = emitted('post reserve\n  catches 409\n  fails full 409 "Ya no quedan plazas."\n', en);
    expect(browser).toContain('fails: { "full": "No places left." }');
  });

  it('a middleware keeps its <Name>Fails', () => {
    const { dts, server } = emitted('middleware guard\n  server\n  fails denied 403 "No."\n  fails gone 410\n');
    expect(dts).toContain('GuardFails');
    expect(server).toContain('GuardFails = fails({ denied: [403, "No."], gone: [410] })');
  });
});
