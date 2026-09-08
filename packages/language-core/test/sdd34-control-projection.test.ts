/**
 * SDD-34 §4.9 in the editor — `control` is a binding of this language, and its expression is
 * CODE that TypeScript has to see.
 *
 * The SDD does not merely allow this, it depends on it: §4.9 says that a misspelt path is «un
 * error de TypeScript, no un `FUD`», and the emit is deliberately left with no schema analysis
 * because the checker already has the types. That trade only pays if the projection actually
 * writes the expression down. Today `emitBehaviour` has branches for `event`, `bus`, `class`,
 * `style` and `ref`, and `control` falls into `default: return;` — so the value is never
 * projected, the path is checked by nobody, and the attribute itself is reported as if it were
 * HTML's vocabulary.
 *
 * Measured against the real checker over the real corpus, like the rest of this suite: what is
 * under test is what TypeScript concludes, not what the emitter prints.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';

const read = (path: string): string => readFileSync(resolve(FIXTURES, path), 'utf8');

/**
 * The form model, in the NEUTRAL zone — which is where SDD-34 §4.4 says a form belongs, so
 * that the server paints its values and the page works with no JavaScript.
 *
 * Declared inline rather than imported: the corpus cannot reach `@fudic/forms`, and what is
 * being measured is the projection of the binding, not the shape of the real `Control<T>`.
 */
const MODEL = `  }
  type Control<T> = { (): T; set(v: T): void; touch(): void };
  type SeoGroup = { canonical: Control<string> };
  type UserForm = { title: Control<string>; seo: SeoGroup };
  declare const f: UserForm;
}`;

/** The badge, rewritten to RECEIVE a node: the `ctrl` prop of decision 112. */
const CONTROL_BADGE = `@code {
  type Control<T> = { (): T; set(v: T): void; touch(): void };

  const { ctrl } = props<{ ctrl: Control<string> }>();
}

<app-badge>
  <template shadowrootmode="open">
    <span class="badge">@ctrl()</span>
  </template>
</app-badge>
`;

/** The line of the route the mutations replace. */
const BADGE_TAG = `<app-badge .tone="@(data.found ? 'info' : 'neutral')">@data.tag</app-badge>`;

/** The corpus with the model in the neutral zone and the badge line replaced by `to`. */
function corpus(to: string, badge?: string): Record<string, string> {
  const source = read(SLUG).replace('  }\n}', MODEL).replace(BADGE_TAG, to);
  if (!source.includes(to)) throw new Error(`mutation anchor not found: ${to}`);
  return badge === undefined ? { [SLUG]: source } : { [SLUG]: source, [BADGE]: badge };
}

const describeDiag = (d: CorpusDiagnostic): string =>
  `${d.code} ${d.message} @${d.sourceText ?? '<unmapped>'}`;

describe('`control` on a native element', () => {
  it('the expression is CODE: a name that does not exist is reported', () => {
    // The sharpest form of the defect, and the one that needs no schema at all. `noExiste` is
    // not declared anywhere in the file; if the value reached the projection, TypeScript would
    // say `TS2304` over those eight characters. Today the whole binding falls into
    // `default: return;` and the checker never sees a thing — so the corpus is SILENT, which
    // is the worst answer available: not a wrong error, no error.
    const diags = typecheckCorpus(corpus(`<input control="@noExiste">`));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2304);
    expect(diags[0]!.sourceText).toBe('noExiste');
  });

  it('says nothing when the path is right', () => {
    // The guard on the other side: once the value is projected, a CORRECT one must stay
    // silent. It passes today too, and vacuously — nothing is checked, so nothing complains —
    // which is precisely why it cannot be the only thing this file asserts.
    expect(typecheckCorpus(corpus(`<input control="@f.title">`)).map(describeDiag)).toEqual([]);
  });

  it('reports a misspelt path ON the path — the literal promise of §4.9', () => {
    const diags = typecheckCorpus(corpus(`<input control="@f.titulo">`));

    // One error, and about the right thing: `titulo` is not a member of the form. This is the
    // whole reason the emit was allowed to skip schema analysis.
    expect(diags).toHaveLength(1);
    expect(diags[0]!.sourceText).toBe('titulo');
    expect(diags[0]!.message).toContain('titulo');
  });

  it('reaches a nested group like any other member access', () => {
    expect(
      typecheckCorpus(corpus(`<input control="@f.seo.canonical">`)).map(describeDiag),
    ).toEqual([]);
    expect(typecheckCorpus(corpus(`<input control="@f.seo.canonica">`))).toHaveLength(1);
  });
});

describe('`control` on a component tag', () => {
  it('crosses as the `ctrl` prop and is accepted (decision 112)', () => {
    // The attribute is not HTML's here either: it is the one prop `CONTROL_PROP` names, and a
    // component that declares it takes the node. Today it is reported as an unknown attribute.
    const diags = typecheckCorpus(corpus(`<app-badge control="@f.title"></app-badge>`, CONTROL_BADGE));
    expect(diags.map(describeDiag)).toEqual([]);
  });

  it('on a tag with no `<link>` the path is still checked, against nothing', () => {
    // No contract was imported, so there is no type to check the node against — and that is
    // the one silence BUG-11 §4.4 keeps: the unknown tag already fails on its own name, and a
    // second error about a `$C0` that does not exist would be the same mistake said twice.
    // What does NOT stop is the expression: it is code either way.
    const unknown = typecheckCorpus(corpus(`<app-nadie control="@f.title"></app-nadie>`));
    expect(unknown.map((d) => d.code)).toEqual([2304]);
    expect(unknown[0]!.sourceText).toBe('app-nadie');

    const misspelt = typecheckCorpus(corpus(`<app-nadie control="@f.titulo"></app-nadie>`));
    expect(misspelt.map((d) => d.sourceText)).toEqual(['app-nadie', 'titulo']);
  });

  it('and the checker still refuses a node of the wrong type', () => {
    // `seo` is a group, not a `Control<string>`, and the badge asks for a control. The error
    // has to land on what the author wrote — which is the other half of §4.9.
    const diags = typecheckCorpus(corpus(`<app-badge control="@f.seo"></app-badge>`, CONTROL_BADGE));
    expect(diags).toHaveLength(1);
    expect(diags[0]!.sourceText).toContain('seo');
  });
});
