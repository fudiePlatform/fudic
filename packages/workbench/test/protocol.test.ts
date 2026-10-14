import { FUD0970 } from '@fudic/diagnostics';
import { parseSpec } from '@fudic/spec';
import { describe, expect, it } from 'vitest';
import { parseCommand, toWire } from '../src/protocol.js';

/** A `.fudspec` whose second line is broken: a parse diagnostic with a span and no file. */
const BROKEN = 'component app-card\n  then\n';
const parsed = parseSpec(BROKEN).diagnostics[0];

describe('toWire', () => {
  it('locates a span in the fallback file, 1-based', () => {
    expect(parsed).toBeDefined();
    const read = (file: string): string | undefined => (file === 'C:/p/app-card.fudspec' ? BROKEN : undefined);
    const wire = toWire(parsed!, 'C:/p/app-card.fudspec', read);
    expect(wire).toEqual({
      code: parsed!.code,
      severity: parsed!.severity,
      message: parsed!.message,
      file: 'C:/p/app-card.fudspec',
      line: 2,
      column: 3,
    });
  });

  it('keeps the file a diagnostic names over the fallback, with no line without a span', () => {
    const wire = toWire(FUD0970({ file: 'C:/p/index.fud' }), 'C:/p/other.fud', () => 'text');
    expect(wire).toEqual({
      code: 'FUD0970',
      severity: 'error',
      message: 'C:/p/index.fud is not a component with a tag, nor the .fudspec of one',
      file: 'C:/p/index.fud',
      line: null,
      column: null,
    });
  });

  it('has no line when the file cannot be read', () => {
    expect(toWire(parsed!, 'C:/p/gone.fudspec', () => undefined)).toMatchObject({
      file: 'C:/p/gone.fudspec',
      line: null,
      column: null,
    });
  });

  it('has no file, and reads nothing, without one', () => {
    const wire = toWire(parsed!, null, () => {
      throw new Error('must not read');
    });
    expect(wire).toMatchObject({ file: null, line: null, column: null });
  });
});

describe('parseCommand — criterion 10', () => {
  const line = (value: unknown) => JSON.stringify(value);

  it('reads every command of v: 2, keeping only its own fields', () => {
    expect(parseCommand(line({ v: 2, type: 'open', file: 'C:/p/a.fud', extra: 1 }))).toEqual({ v: 2, type: 'open', file: 'C:/p/a.fud' });
    expect(parseCommand(line({ v: 2, type: 'close', tag: 'app-card' }))).toEqual({ v: 2, type: 'close', tag: 'app-card' });
    expect(parseCommand(line({ v: 2, type: 'cancel', tag: 'app-card' }))).toEqual({ v: 2, type: 'cancel', tag: 'app-card' });
    expect(parseCommand(line({ v: 2, type: 'run', tag: 'app-card' }))).toEqual({ v: 2, type: 'run', tag: 'app-card' });
    expect(parseCommand(line({ v: 2, type: 'run', tag: 'app-card', ids: ['a', 'b'] }))).toEqual({
      v: 2,
      type: 'run',
      tag: 'app-card',
      ids: ['a', 'b'],
    });
    expect(parseCommand(line({ v: 2, type: 'run', tag: 'app-card', failing: true }))).toEqual({
      v: 2,
      type: 'run',
      tag: 'app-card',
      failing: true,
    });
    expect(parseCommand(line({ v: 2, type: 'pin', tag: 'app-card', id: 'a' }))).toEqual({ v: 2, type: 'pin', tag: 'app-card', id: 'a' });
    expect(parseCommand(line({ v: 2, type: 'pin', tag: 'app-card', id: null }))).toEqual({ v: 2, type: 'pin', tag: 'app-card', id: null });
    expect(parseCommand(line({ v: 2, type: 'pause', tag: 'app-card', paused: false }))).toEqual({
      v: 2,
      type: 'pause',
      tag: 'app-card',
      paused: false,
    });
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', '"run"'],
    ['null', 'null'],
    ['v: 1', line({ v: 1, type: 'cancel', tag: 'a' })],
    ['an open without a file', line({ v: 2, type: 'open', file: 3 })],
    ['a command without a tag', line({ v: 2, type: 'cancel' })],
    ['an unknown type', line({ v: 2, type: 'explode', tag: 'a' })],
    ['ids that are not strings', line({ v: 2, type: 'run', tag: 'a', ids: [1] })],
    ['ids that are not a list', line({ v: 2, type: 'run', tag: 'a', ids: 'a' })],
    ['failing that is not true', line({ v: 2, type: 'run', tag: 'a', failing: false })],
    ['a pin without an id', line({ v: 2, type: 'pin', tag: 'a' })],
    ['a pause without a boolean', line({ v: 2, type: 'pause', tag: 'a', paused: 'yes' })],
  ])('ignores %s', (_name, text) => {
    expect(parseCommand(text)).toBeUndefined();
  });
});
