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
import { mapToGenerated } from '../src/mapping.js';
import { languageServiceFor, projectCorpus, typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

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
  type Group<T> = T & { $touch(): void; $validate(): Promise<boolean> };
  type SeoGroup = Group<{ canonical: Control<string> }>;
  type UserForm = Group<{ title: Control<string>; seo: SeoGroup }>;
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

/** The route with the model in the neutral zone and the badge line replaced by `to`. */
function route(to: string): string {
  const source = read(SLUG).replace('  }\n}', MODEL).replace(BADGE_TAG, to);
  if (!source.includes(to)) throw new Error(`mutation anchor not found: ${to}`);
  return source;
}

/** The corpus with the model in the neutral zone and the badge line replaced by `to`. */
function corpus(to: string, badge?: string): Record<string, string> {
  const source = route(to);
  return badge === undefined ? { [SLUG]: source } : { [SLUG]: source, [BADGE]: badge };
}

const describeDiag = (d: CorpusDiagnostic): string =>
  `${d.code} ${d.message} @${d.sourceText ?? '<unmapped>'}`;

/**
 * What the editor is offered at `offset` of the route, through the projection.
 *
 * Asked of the REAL language service and not of the emitted text, for the reason `anchors.test`
 * gives: a hole that maps somewhere nobody answers reads perfectly in the virtual and offers
 * nothing in the editor.
 */
function completionsAt(files: Record<string, string>, offset: number): readonly string[] {
  const { service, pathOf } = languageServiceFor(files);
  const virtual = projectCorpus(files).find((p) => p.file.path === SLUG)!.virtuals[0]!;
  const at = mapToGenerated(virtual, offset, 'completion');
  expect(at, 'the position maps into the projection').toBeDefined();

  const info = service.getCompletionsAtPosition(pathOf(virtual.fileName), at!, undefined);
  return (info?.entries ?? []).map((e) => e.name);
}

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

describe('the element decides what may be bound (decision 109)', () => {
  it('a field takes a control and refuses a group', () => {
    expect(typecheckCorpus(corpus(`<input control="@f.seo">`))).toHaveLength(1);
    expect(typecheckCorpus(corpus(`<textarea control="@f.seo"></textarea>`))).toHaveLength(1);
    expect(typecheckCorpus(corpus(`<select control="@f.seo"></select>`))).toHaveLength(1);
  });

  it('a `<form>` takes the form and refuses a control', () => {
    expect(typecheckCorpus(corpus(`<form control="@f"></form>`)).map(describeDiag)).toEqual([]);
    expect(typecheckCorpus(corpus(`<form control="@f.title"></form>`))).toHaveLength(1);
  });

  it('anything else is a group, and takes what a group is', () => {
    // Where the binding lands is layout — a `<fieldset>`, a `<div>`, a `<section>` — so what
    // is checked is the NODE and never the tag (§4.1).
    for (const tag of ['fieldset', 'div', 'section']) {
      expect(
        typecheckCorpus(corpus(`<${tag} control="@f.seo"></${tag}>`)).map(describeDiag),
      ).toEqual([]);
      expect(typecheckCorpus(corpus(`<${tag} control="@f.title"></${tag}>`))).toHaveLength(1);
    }
  });

  it('the error lands on what the author wrote', () => {
    const [only] = typecheckCorpus(corpus(`<input control="@f.seo">`));
    expect(only!.sourceText).toBe('f.seo');
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

/**
 * `control=` with nothing behind it — the instant the list is worth having.
 *
 * A value the author has opened and not written does not classify: `classifyControl` degrades it
 * to a plain attribute with `FUD0590`, so none of the branches above fire and the projection
 * used to write NOTHING at that offset. The root stayed silent too, and rightly — the answer
 * there is the form's nodes, not HTML's vocabulary — which left the one position where the
 * developer is certainly asking with nobody to answer it.
 */
describe('`control=` with the value still open', () => {
  /** The offset right behind the `=`, which is where the caret is when the list is asked for. */
  const behindTheEquals = (source: string): number =>
    source.indexOf('control=') + 'control='.length;

  it('offers the form on a native element, through the hole of `$control()`', () => {
    const source = route(`<input control=>`);

    expect(completionsAt({ [SLUG]: source }, behindTheEquals(source))).toContain('f');
  });

  it('offers it with the quotes already typed, which is the same empty value', () => {
    const source = route(`<input control="">`);
    // One character further in: between the quotes, where `attributeValueSpan` ends.
    const at = source.indexOf('control="') + 'control="'.length;

    expect(completionsAt({ [SLUG]: source }, at)).toContain('f');
  });

  it('offers it on a `<form>` too, where the call is the group one', () => {
    const source = route(`<form control=></form>`);

    expect(completionsAt({ [SLUG]: source }, behindTheEquals(source))).toContain('f');
  });

  it('offers it on a component tag, against the contract the child declared', () => {
    // Over there the binding is the `ctrl` prop, so the hole goes INSIDE the props literal —
    // where the globals literal used to report `TS2353` over the one name the author had
    // written correctly.
    const source = route(`<app-badge control=></app-badge>`);
    const files = { [SLUG]: source, [BADGE]: CONTROL_BADGE };

    expect(completionsAt(files, behindTheEquals(source))).toContain('f');
  });

  it('and the half-written name is no longer HTML’s vocabulary', () => {
    const diags = typecheckCorpus(corpus(`<app-badge control=></app-badge>`, CONTROL_BADGE));

    expect(diags.filter((d) => d.code === 2353).map(describeDiag)).toEqual([]);
  });

  it('says nothing about the prop being missing: it was written, only not finished', () => {
    // `$required` reads the names the author WROTE. A `control=` that has not reached its value
    // is still the one prop the child declared, so reporting it absent would be an error about
    // the character the developer is in the middle of typing.
    const diags = typecheckCorpus(corpus(`<app-badge control=></app-badge>`, CONTROL_BADGE));

    expect(diags.filter((d) => d.message.includes('ctrl'))).toEqual([]);
  });
});
