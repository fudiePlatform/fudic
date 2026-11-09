/**
 * SDD-81 §3.2 and §3.6 — the file controls of the model, and the two rules of a file.
 *
 * In `node`, as every model test: a form with a file field is a form the server validates too,
 * so it cannot need a DOM. `File` and `Blob` are the platform's, in Node as in the browser.
 *
 * Criteria 28 (the model half: `required`, `accept` and `max-size` give their text without a
 * submit) and 32 (`max-length 3` over four files).
 */

import { describe, expect, it } from 'vitest';
import '../impl/browser/rules.js';
import {
  accept as acceptRule,
  maxLength as maxLengthRule,
  maxSize as maxSizeRule,
  required as requiredRule,
} from './generated/rules.browser.js';
import { accept, accepted, file, files, formOf, maxSize, required, text, withinSize } from '../src/contract/index.js';
import type { AnyForm, AnyValidator, Errors } from '../src/types.js';

const ROOT = undefined as unknown as AnyForm;
const run = (v: AnyValidator<never>, value: unknown): Errors | null =>
  (v as unknown as (x: unknown, r: AnyForm) => Errors | null)(value, ROOT);

const png = (bytes = 3, name = 'yo.png'): File => new File([new Uint8Array(bytes)], name, { type: 'image/png' });
const pdf = (): File => new File(['%PDF'], 'cv.PDF', { type: 'application/pdf' });

describe('file and files (SDD-81 §3.6)', () => {
  it('file: null until chosen, a File after set, null again after reset; typed `file`', () => {
    const f = formOf({ avatar: file() });
    expect(f.avatar.type).toBe('file');
    expect(f.avatar()).toBeNull();
    const one = png();
    f.avatar.set(one);
    expect(f.avatar()).toBe(one);
    expect(f.avatar.dirty()).toBe(true);
    f.$reset();
    expect(f.avatar()).toBeNull();
    expect(f.$value()).toEqual({ avatar: null });
  });

  it('files: [] until chosen, the list after set, [] again after reset; typed `file[]`', () => {
    const f = formOf({ docs: files() });
    expect(f.docs.type).toBe('file[]');
    expect(f.docs()).toEqual([]);
    const two = [png(), pdf()];
    f.docs.set(two);
    expect(f.docs()).toBe(two);
    f.docs.reset();
    expect(f.docs()).toEqual([]);
    expect(formOf({ docs: files(two) }).docs()).toBe(two);
  });

  it('a Blob passes where a File is expected; anything else is a range error', async () => {
    const f = formOf({ one: file(), many: files() });
    f.one.set(new Blob(['x']) as File);
    f.many.set([png(), new Blob(['y']) as File]);
    expect(await f.$validate()).toBe(true);
    f.one.set('yo.png' as unknown as File);
    f.many.set([png(), 'x' as unknown as File]);
    expect(await f.$validate()).toBe(false);
    expect(f.$errors()).toEqual({ one: { range: 'file' }, many: { range: 'file[]' } });
    f.many.set(null as unknown as readonly File[]);
    await f.$validate();
    expect(f.many.errors()).toEqual({ range: 'file[]' });
  });

  it('$progress() is null until a send moves bytes (bindForm feeds it)', () => {
    expect(formOf({ avatar: file() }).$progress()).toBeNull();
  });
});

describe('the checks of a file (SDD-81 §3.2)', () => {
  it('withinSize: every file on its own, never the sum; empty passes', () => {
    expect(withinSize(null, 0)).toBe(true);
    expect(withinSize([], 0)).toBe(true);
    expect(withinSize(png(3), 3)).toBe(true);
    expect(withinSize(png(4), 3)).toBe(false);
    expect(withinSize([png(3), png(3)], 3)).toBe(true);
    expect(withinSize([png(3), png(4)], 3)).toBe(false);
  });

  it('accepted: MIME types, wildcards and extensions, case aside; empty passes', () => {
    expect(accepted(null, 'image/png')).toBe(true);
    expect(accepted([], 'image/png')).toBe(true);
    expect(accepted(png(), 'image/png, image/jpeg')).toBe(true);
    expect(accepted(png(), 'IMAGE/*')).toBe(true);
    expect(accepted(pdf(), 'image/*')).toBe(false);
    expect(accepted(pdf(), 'image/*, .pdf')).toBe(true);
    expect(accepted(pdf(), ' , .doc')).toBe(false);
    expect(accepted([png(), pdf()], 'image/png')).toBe(false);
    // A Blob has no name: only its type can match.
    expect(accepted(new Blob(['x'], { type: 'text/plain' }), '.txt')).toBe(false);
    expect(accepted(new Blob(['x'], { type: 'text/plain' }), 'text/plain')).toBe(true);
  });

  it('maxSize and accept, the validators an argument rule runs', () => {
    expect(maxSize(3)(png(3), ROOT)).toBeNull();
    expect(maxSize(3)(png(4), ROOT)).toEqual({ maxSize: 3 });
    expect(accept('image/*')(png(), ROOT)).toBeNull();
    expect(accept('image/*')(pdf(), ROOT)).toEqual({ accept: 'image/*' });
  });

  it('required: an empty file[] is [], and fails as null does', () => {
    expect(required([], ROOT)).toEqual({ required: true });
    expect(required([png()], ROOT)).toBeNull();
    expect(run(requiredRule.use(), [])).toEqual({ required: true });
    expect(run(requiredRule.use(), [png()])).toBeNull();
  });

  it('the rules of rules.fudapi say what the validators say', () => {
    for (const value of [null, [], png(3), png(4), [png(3), png(4)]]) {
      expect(run(maxSizeRule.use({ n: 3 }), value)).toEqual(maxSize(3)(value, ROOT));
    }
    for (const value of [null, [], png(), pdf(), [png(), pdf()]]) {
      expect(run(acceptRule.use({ types: 'image/png' }), value)).toEqual(accept('image/png')(value, ROOT));
    }
  });
});

describe('criteria 28 and 32: the texts of a file field, before any submit', () => {
  const build = () =>
    formOf({
      avatar: file(null, [requiredRule.use(), acceptRule.use({ types: 'image/png, image/jpeg' }), maxSizeRule.use({ n: 2 * 1024 * 1024 })], {
        messages: {
          required: text('Elige una foto.'),
          accept: text('Tiene que ser PNG o JPEG.'),
          maxSize: text('Como mucho 2 MB.'),
        },
      }),
      docs: files([], [maxLengthRule.use({ n: 3 })], { messages: { maxLength: text('Como mucho {n} ficheros.') } }),
    });

  it('required, accept and max-size each give their text when a file is chosen', async () => {
    const f = build();
    f.avatar.touch();
    await f.avatar.validate();
    expect(f.avatar.message()).toBe('Elige una foto.');
    f.avatar.set(pdf());
    await f.avatar.validate();
    expect(f.avatar.message()).toBe('Tiene que ser PNG o JPEG.');
    f.avatar.set(png(3 * 1024 * 1024));
    await f.avatar.validate();
    expect(f.avatar.message()).toBe('Como mucho 2 MB.');
    f.avatar.set(png(1024));
    await f.avatar.validate();
    expect(f.avatar.message()).toBe('');
  });

  it('file[] with max-length 3 and four files gives its text', async () => {
    const f = build();
    f.docs.set([png(), png(), png(), png()]);
    await f.docs.validate();
    expect(f.docs.message()).toBe('Como mucho 3 ficheros.');
  });
});
