import { describe, expect, test } from 'vitest';
import { hostAttribute } from '../src/document.js';

describe('attachInternals, the stand-in the environment installs', () => {
  const internals = (): ElementInternals => document.createElement('div').attachInternals();

  test('starts valid, with no value, no message and no labels', () => {
    const i = internals();
    expect(i.validity.valid).toBe(true);
    expect(i.validity.valueMissing).toBe(false);
    expect(i.validationMessage).toBe('');
    expect(i.labels).toEqual([]);
    expect((i as unknown as { value: unknown }).value).toBeNull();
  });

  test('keeps the form value it is handed', () => {
    const i = internals();
    i.setFormValue('ana');
    expect((i as unknown as { value: unknown }).value).toBe('ana');
  });

  test('a flag set makes it invalid, with its message', () => {
    const i = internals();
    i.setValidity({ valueMissing: true }, 'Required.');
    expect(i.validity.valid).toBe(false);
    expect(i.validity.valueMissing).toBe(true);
    expect(i.validity.customError).toBe(false);
    expect(i.validationMessage).toBe('Required.');
  });

  test('no flags, or all clear, is valid again, and the message defaults to empty', () => {
    const i = internals();
    i.setValidity({ customError: true }, 'Bad.');
    i.setValidity({});
    expect(i.validity.valid).toBe(true);
    expect(i.validationMessage).toBe('');
    i.setValidity({ customError: true }, 'Bad.');
    i.setValidity({ customError: false, tooLong: false });
    expect(i.validity.valid).toBe(true);
  });

  test('one per call: two elements do not share their state', () => {
    const a = internals();
    const b = internals();
    a.setValidity({ tooShort: true });
    expect(b.validity.valid).toBe(true);
  });
});

describe('hostAttribute, read off the text of the page', () => {
  const page = (body: string): string => `<html><head></head><body>${body}</body></html>`;

  test('the value of the attribute on the first host, unescaped', () => {
    expect(hostAttribute(page('<x-a data-fud-adopt="a b&amp;c" id="h"></x-a>'), 'x-a', 'data-fud-adopt')).toBe('a b&c');
  });

  test('null for a host without that attribute, or without any', () => {
    expect(hostAttribute(page('<x-a id="h"></x-a>'), 'x-a', 'data-fud-adopt')).toBeNull();
    expect(hostAttribute(page('<x-a></x-a>'), 'x-a', 'data-fud-adopt')).toBeNull();
  });

  test('only the body is read, and only the tag asked for', () => {
    const html = '<html><head><x-a data-fud-adopt="head"></x-a></head><body><x-ab data-fud-adopt="no"></x-ab><x-a data-fud-adopt="yes"></x-a></body></html>';
    expect(hostAttribute(html, 'x-a', 'data-fud-adopt')).toBe('yes');
  });
});
