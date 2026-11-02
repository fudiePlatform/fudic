/**
 * SDD-74 §3.1, §4.2 and criterion 3 — `fails` leaves functions and `load`: FUD1360 on the whole
 * line, the line dropped, the rest of the file still read. Rules and middlewares keep theirs.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations, emitModule, parseApi, type Decl } from '../src/index.js';
import { codes, slice } from './helpers.js';
import { app } from './project.js';

const MESSAGE =
  "`fails` belongs to rules and middlewares. In a function, throw an error of @fudic/http from its handler: conflict('…'), notFound('…').";

describe('criterion 3: FUD1360', () => {
  it.each([
    ['a function', 'post save\n  fails reserved 409 "x"\n  id  i32'],
    ['`load`', 'load\n  fails reserved 409 "x"\n  users  str[]'],
  ])('under %s: FUD1360, an error, on the whole line', (_parent, source) => {
    const { diagnostics } = parseApi(source);
    expect(diagnostics.map((d) => [d.code, d.severity, d.message])).toEqual([['FUD1360', 'error', MESSAGE]]);
    expect(slice(source, diagnostics[0]!.span)).toBe('fails reserved 409 "x"');
  });

  it.each(['get', 'put', 'patch', 'delete'])('under %s too', (verb) => {
    expect(codes(`${verb} f\n  fails gone 410`)).toEqual(['FUD1360']);
  });

  it('any shape of the line: bare, broken or with lines below it', () => {
    expect(codes('post save\n  fails')).toEqual(['FUD1360']);
    expect(codes('post save\n  fails Taken abc nope')).toEqual(['FUD1360']);
    expect(codes('load\n  fails gone 410\n    x')).toEqual(['FUD1360']);
  });

  it('the line is dropped and the rest of the function is still read and checked', () => {
    const source = 'post save\n  fails reserved 409 "x"\n  catches 409\n  id  i32\n  bad  str[';
    expect(codes(source)).toEqual(['FUD1360', 'FUD1067']);
    const fn = parseApi(source).value.declarations[0] as Extract<Decl, { kind: 'fn' }>;
    expect(fn).not.toHaveProperty('fails');
    expect(fn.catches!.statuses.map((s) => s.value)).toEqual([409]);
    expect(fn.args.map((a) => a.name.text)).toEqual(['id']);
  });

  it('the rest of the file is still read: the next declarations parse', () => {
    const source = 'load\n  fails gone 410\n  users  str[]\nget f\n  fails x 409\ntype A\n  x  str';
    const { value, diagnostics } = parseApi(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD1360', 'FUD1360']);
    expect(value.declarations.map((d) => d.kind)).toEqual(['load', 'fn', 'type']);
    const load = value.declarations[0] as Extract<Decl, { kind: 'load' }>;
    expect(load).not.toHaveProperty('fails');
    expect(load.fields.map((f) => f.name.text)).toEqual(['users']);
  });

  it('under a rule and under a middleware: nothing', () => {
    expect(codes('rule r\n  on form\n  runs both\n  fails r')).toEqual([]);
    expect(codes('middleware m\n  client\n  fails cross-site 403 "x"')).toEqual([]);
  });
});

describe('criterion 3: what is generated without it (§4.2)', () => {
  const emitted = (text: string) => {
    const source = app('routes/r', text);
    const index = createApiIndex([source]);
    return [emitDeclarations(source, index, {}), emitModule(source, index, {}, 'server'), emitModule(source, index, {}, 'browser')];
  };

  it('a function or `load` with a `fails` line emits no <Name>Fails nor LoadFails', () => {
    for (const text of emitted('load\n  fails gone 410\npost save\n  fails reserved 409 "x"\n')) {
      expect(text).not.toMatch(/SaveFails|LoadFails/u);
      expect(text).not.toMatch(/\bfails\b/u);
    }
  });

  it('a middleware keeps its <Name>Fails', () => {
    const [dts, server] = emitted('middleware guard\n  server\n  fails denied 403 "No."\n  fails gone 410\n');
    expect(dts).toContain('GuardFails');
    expect(server).toContain('GuardFails = fails({ denied: [403, "No."], gone: [410] })');
  });
});
