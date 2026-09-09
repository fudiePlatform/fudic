/**
 * SDD-34 §6.14 — the body of a `serverValidator` does not reach the browser.
 *
 * That it does not RUN on the client (SDD-33) was never the point: its body — a query, an
 * import of the data layer — would still be in the bundle. What is erased is the ARGUMENT and
 * never the call, so the array of validators keeps its length, its order and its behaviour in
 * `$validate()`; and with the original function left with no references, Rollup takes away
 * everything that hung off it.
 */

import { describe, expect, it } from 'vitest';
import { eraseServerValidators } from '../src/server-validators.js';

const SCHEMA = [
  "import { db } from '../data/db.js';",
  "import { control, form, required, serverValidator } from '@fudic/forms';",
  '',
  'export const post = form({',
  '  slug: control(\'\', [required, serverValidator(async (v) => {',
  '    return (await db.slug(v)) ? { taken: 1 } : null;',
  '  })]),',
  '});',
].join('\n');

describe('§6.14 — erasing the server validators', () => {
  it('replaces the argument and keeps the call', () => {
    const out = eraseServerValidators(SCHEMA)!;
    expect(out).toContain('serverValidator(() => null)');
    expect(out).not.toContain('db.slug');
    expect(out).not.toContain('taken');
  });

  it('keeps the length and the order of the validator array', () => {
    const out = eraseServerValidators(SCHEMA)!;
    // The rule that is skipped on the client is skipped in the position it occupied: deleting
    // the call would renumber everything after it.
    expect(out).toContain("control('', [required, serverValidator(() => null)])");
  });

  it('erases every one of them, and only their arguments', () => {
    const source = [
      "import { serverValidator } from '@fudic/forms';",
      'export const a = serverValidator(async (v) => check(v));',
      'export const b = serverValidator(function (v) { return heavy(v); });',
      'export const keep = plain(() => 1);',
    ].join('\n');
    const out = eraseServerValidators(source)!;
    expect(out).toContain('export const a = serverValidator(() => null);');
    expect(out).toContain('export const b = serverValidator(() => null);');
    expect(out).toContain('export const keep = plain(() => 1);');
  });

  it('follows the imported BINDING, not the word', () => {
    // Renamed at the import: still this one.
    const renamed = [
      "import { serverValidator as onlyOnTheServer } from '@fudic/forms';",
      'export const a = onlyOnTheServer(async (v) => check(v));',
    ].join('\n');
    expect(eraseServerValidators(renamed)).toContain('onlyOnTheServer(() => null)');

    // A homonym of the author's is left alone — a distinction no text match can make.
    const homonym = [
      "import { control } from '@fudic/forms';",
      'function serverValidator(fn) { return fn; }',
      'export const a = serverValidator(async (v) => check(v));',
    ].join('\n');
    expect(eraseServerValidators(homonym)).toBeNull();
  });

  it('leaves a file with nothing to erase exactly as it was', () => {
    // `null` and not the same string: the transform hands the module back untouched, so the
    // bundler keeps whatever source map it already had.
    expect(eraseServerValidators('export const a = 1;')).toBeNull();
    expect(eraseServerValidators("import { control } from '@fudic/forms';")).toBeNull();
    // Mentions the word, imports nothing from the package.
    expect(eraseServerValidators('const serverValidator = 1; // @fudic/forms')).toBeNull();
  });

  it('does not touch a namespace import, and does not half-erase it', () => {
    const source = [
      "import * as forms from '@fudic/forms';",
      'export const a = forms.serverValidator(async (v) => check(v));',
    ].join('\n');
    expect(eraseServerValidators(source)).toBeNull();
  });

  it('leaves a call whose shape is not `serverValidator`’s', () => {
    const source = [
      "import { serverValidator } from '@fudic/forms';",
      'export const a = serverValidator();',
      'export const b = serverValidator(one, two);',
    ].join('\n');
    expect(eraseServerValidators(source)).toBeNull();
  });

  it('leaves a file that does not parse alone', () => {
    expect(eraseServerValidators("import { serverValidator } from '@fudic/forms'; const = ;")).toBeNull();
  });
});
