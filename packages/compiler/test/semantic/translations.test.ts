/**
 * The `translations` analyzer (SDD-58 §3.7): FUD1020 on a `t()` that cannot be extracted.
 * FUD1021 is retired (SDD-71): every app has a locale.
 */

import { describe, expect, it } from 'vitest';
import { analyze, type SemanticInput } from '../../src/semantic/index.js';
import { viewInput } from './_view.js';

const component = (body: string, code = ''): string =>
  `${code}<app-x><template shadowrootmode="open">${body}</template></app-x>`;

/** `[code, the text it underlines]` of the i18n codes, in report order. */
function found(source: string, edit: (i: SemanticInput) => SemanticInput = (i) => i): readonly [string, string][] {
  return analyze(edit(viewInput(source)))
    .diagnostics.filter((d) => d.code === 'FUD1020' || d.code === 'FUD1021')
    .map((d) => [d.code, source.slice(d.span!.start, d.span!.end)]);
}

describe('FUD1020: a t() the extraction cannot use', () => {
  it('a t(variable) in the view and in @code', () => {
    const source = component('<p>@t(v)</p>', "@code { import { t } from '@fudic/i18n'; const e = t(w); }\n");

    // In source order: the @code comes first.
    expect(found(source)).toEqual([
      ['FUD1020', 'w'],
      ['FUD1020', 'v'],
    ]);
  });

  it('holes without their object', () => {
    const source = component('<p>@t("Hola {name}")</p>', "@code { import { t } from '@fudic/i18n'; }\n");
    expect(found(source)).toEqual([['FUD1020', '"Hola {name}"']]);
  });

  it('nothing when nothing is imported from @fudic/i18n', () => {
    expect(found(component('<p>@t(v)</p>', '@code { const t = (s: string) => s; }\n'))).toEqual([]);
    expect(found(component('<p>@t(v)</p>'))).toEqual([]);
  });

  it('a valid call is fine', () => {
    const source = component('<p>@t("Hola {name}", { name })</p>', "@code { import { t } from '@fudic/i18n'; }\n");
    expect(found(source)).toEqual([]);
  });

  it('a fragment the host did not register says nothing', () => {
    const source = component('<p>@t(v)</p>', "@code { import { t } from '@fudic/i18n'; }\n");
    expect(found(source, (i) => ({ ...i, fragmentId: () => undefined }))).toEqual([]);
  });
});

describe('FUD1021 is retired (SDD-71)', () => {
  it('a pipe, format() and locale are fine in any app', () => {
    const source = component(
      '<p>@(precio | euros) @format(x, euros) @locale</p>',
      "@code {\n  import { format, locale, currency } from '@fudic/core';\n  const euros = currency('EUR');\n}\n",
    );
    expect(found(source)).toEqual([]);
  });
});
