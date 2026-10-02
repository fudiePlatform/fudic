import { describe, expect, it } from 'vitest';
import { sampleValue, type PropField, type PropShape } from '../../src/index.js';

const STRING: PropShape = { kind: 'string' };
const NUMBER: PropShape = { kind: 'number' };
const NULL: PropShape = { kind: 'null' };
const ANY: PropShape = { kind: 'any' };
const OPAQUE: PropShape = { kind: 'opaque' };

const field = (name: string, shape: PropShape, required = true): PropField => ({ name, required, shape });

describe('sampleValue — one row of the table per shape (criterion 2)', () => {
  it.each<readonly [string, PropShape, string]>([
    ['string', STRING, "''"],
    ['number', NUMBER, '0'],
    ['bigint', { kind: 'bigint' }, '0n'],
    ['boolean', { kind: 'boolean' }, 'false'],
    ['null', NULL, 'null'],
    ['string literal', { kind: 'literal', value: 'default' }, "'default'"],
    ['number literal', { kind: 'literal', value: 1 }, '1'],
    ['boolean literal', { kind: 'literal', value: true }, 'true'],
    ['array', { kind: 'array', element: OPAQUE }, '[]'],
    ['record', { kind: 'record' }, '{}'],
  ])('%s', (_, shape, value) => {
    expect(sampleValue(shape)).toBe(value);
  });

  it('gives no value for `any` and `opaque`', () => {
    expect(sampleValue(ANY)).toBeUndefined();
    expect(sampleValue(OPAQUE)).toBeUndefined();
  });

  it('escapes quotes and backslashes in a string literal', () => {
    expect(sampleValue({ kind: 'literal', value: "it's a \\ path" })).toBe("'it\\'s a \\\\ path'");
  });
});

describe('sampleValue — tuple', () => {
  it('writes one value per element', () => {
    expect(sampleValue({ kind: 'tuple', elements: [STRING, NUMBER, { kind: 'literal', value: 'x' }] })).toBe(
      "['', 0, 'x']",
    );
    expect(sampleValue({ kind: 'tuple', elements: [] })).toBe('[]');
  });

  it('has no value when one element has none', () => {
    expect(sampleValue({ kind: 'tuple', elements: [STRING, ANY] })).toBeUndefined();
  });
});

describe('sampleValue — object', () => {
  it('keeps the required fields with a sample, in order, and omits the optional ones', () => {
    const shape: PropShape = {
      kind: 'object',
      props: [field('title', STRING), field('count', NUMBER, false), field('href', STRING)],
    };
    expect(sampleValue(shape)).toBe("{ title: '', href: '' }");
  });

  it('omits a required field without a sample', () => {
    const shape: PropShape = { kind: 'object', props: [field('onClick', OPAQUE), field('data', ANY), field('n', NUMBER)] };
    expect(sampleValue(shape)).toBe('{ n: 0 }');
  });

  it('is `{}` when no field is left', () => {
    expect(sampleValue({ kind: 'object', props: [] })).toBe('{}');
    expect(sampleValue({ kind: 'object', props: [field('a', STRING, false), field('b', OPAQUE)] })).toBe('{}');
  });

  it('quotes a key that is not an identifier and leaves identifiers bare', () => {
    const shape: PropShape = {
      kind: 'object',
      props: [field('data-id', STRING), field("it's", NUMBER), field('$x', NUMBER), field('_y1', NUMBER)],
    };
    expect(sampleValue(shape)).toBe("{ 'data-id': '', 'it\\'s': 0, $x: 0, _y1: 0 }");
  });

  it('fills nested objects, arrays and tuples', () => {
    const shape: PropShape = {
      kind: 'object',
      props: [
        field('author', { kind: 'object', props: [field('name', STRING)] }),
        field('tags', { kind: 'array', element: STRING }),
        field('pair', { kind: 'tuple', elements: [NUMBER, NUMBER] }),
      ],
    };
    expect(sampleValue(shape)).toBe("{ author: { name: '' }, tags: [], pair: [0, 0] }");
  });
});

describe('sampleValue — union', () => {
  it('takes the first member that is not `null` and has a value', () => {
    const variant: PropShape = {
      kind: 'union',
      members: [
        { kind: 'literal', value: 'default' },
        { kind: 'literal', value: 'outline' },
      ],
    };
    expect(sampleValue(variant)).toBe("'default'");
    expect(sampleValue({ kind: 'union', members: [NULL, STRING] })).toBe("''");
    expect(sampleValue({ kind: 'union', members: [NULL, ANY, OPAQUE, NUMBER] })).toBe('0');
  });

  it('falls back to `null` when only `null` has a value', () => {
    expect(sampleValue({ kind: 'union', members: [ANY, NULL] })).toBe('null');
    expect(sampleValue({ kind: 'union', members: [NULL] })).toBe('null');
  });

  it('has no value when no member has one and `null` is not among them', () => {
    expect(sampleValue({ kind: 'union', members: [ANY, OPAQUE] })).toBeUndefined();
    expect(sampleValue({ kind: 'union', members: [] })).toBeUndefined();
  });
});
