import { FUD0970 } from '@fudic/diagnostics';
import { parseSpec } from '@fudic/spec';
import { describe, expect, it } from 'vitest';
import { toWire } from '../src/protocol.js';

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
