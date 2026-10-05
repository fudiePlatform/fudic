import { describe, expect, it } from 'vitest';
import { isSignal, jsonLiteral } from '../src/host.js';

describe('isSignal', () => {
  it('is a function with a set method', () => {
    expect(isSignal(Object.assign(() => 1, { set: () => undefined }))).toBe(true);
  });

  it('is not a computed (a function without set), nor a value', () => {
    expect(isSignal(() => 1)).toBe(false);
    expect(isSignal(Object.assign(() => 1, { set: 1 }))).toBe(false);
    expect(isSignal({ set: () => undefined })).toBe(false);
    expect(isSignal(10)).toBe(false);
  });
});

describe('jsonLiteral', () => {
  it('writes what comes back the same', () => {
    expect(jsonLiteral(10)).toBe('10');
    expect(jsonLiteral('a "b"')).toBe('"a \\"b\\""');
    expect(jsonLiteral(null)).toBe('null');
    expect(jsonLiteral({ a: [1, { b: true }] })).toBe('{"a":[1,{"b":true}]}');
  });

  it('answers undefined for what does not survive JSON.stringify', () => {
    expect(jsonLiteral(() => 1)).toBeUndefined();
    expect(jsonLiteral(new Date(0))).toBeUndefined();
    expect(jsonLiteral(new Map([[1, 2]]))).toBeUndefined();
    expect(jsonLiteral(undefined)).toBeUndefined();
    expect(jsonLiteral(Number.NaN)).toBeUndefined();
    expect(jsonLiteral({ a: undefined })).toBeUndefined();
  });
});
