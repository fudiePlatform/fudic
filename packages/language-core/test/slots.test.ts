/**
 * BUG-11 — `slot=` and the global attributes of HTML.
 *
 * These go through `typecheckCorpus`, not through the emitted text, and that is the point:
 * the defect this file exists for lived under a suite at 100% because the tests asserted what
 * the emitter WROTE and never what TypeScript said about it.
 */

import { describe, expect, it } from 'vitest';
import { typecheckCorpus } from './typecheck.js';
import { emitClient, registryOf } from './_support.js';

const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';

/**
 * The corpus page, with its `<app-badge>` line replaced.
 *
 * The badge sits inside ANOTHER badge and not inside the `<article>` it used to, because
 * since BUG-23 §2.6 a `slot=` is checked against the union of the PARENT: with a native
 * element above it the answer is `never`, which is correct and would drown every assertion
 * here in an error about the wrong thing. The same component on both ends keeps
 * `badgeTemplate` in charge of what the union holds.
 */
const badgeLine = (attributes: string): Record<string, string> => ({
  [SLUG]: `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">

<app-badge>
  <app-badge ${attributes}>x</app-badge>
</app-badge>
`,
});

/** The badge component, with the body of its shadow template replaced. */
const badgeTemplate = (body: string): Record<string, string> => ({
  [BADGE]: `@code {
  type Tone = 'neutral' | 'success' | 'info';

  const { tone = 'neutral' } = props<{ tone?: Tone }>();
}

<app-badge>
  <template shadowrootmode="open">${body}</template>
</app-badge>
`,
});

describe('BUG-11 §6.1 — the example of this repository', () => {
  it('typechecks a component tag carrying slot=, with no TS2353', () => {
    // The line is `examples/basic/routes/blog/index.fud:48`, reproduced over the corpus:
    // `slot` is a global HTML attribute, not a prop of anybody.
    const diagnostics = typecheckCorpus(badgeLine(`slot="meta" .tone="success"`));
    expect(diagnostics.filter((d) => d.code === 2353)).toEqual([]);
  });
});

describe('BUG-11 §6.6 — the global attributes', () => {
  it('accepts every global attribute of HTML on a component, with no diagnostic', () => {
    const diagnostics = typecheckCorpus(
      badgeLine(
        `id="b" class="x" style="color:red" title="t" lang="es" dir="ltr" hidden ` +
          `tabindex="0" part="body" exportparts="body: badge" role="status" ` +
          `data-kind="tag" aria-label="etiqueta"`,
      ),
    );
    expect(diagnostics).toEqual([]);
  });
});

describe('BUG-11 §6.7 — the contract is still strict', () => {
  it('still reports a misspelt prop, with the suggestion', () => {
    const diagnostics = typecheckCorpus(badgeLine(`.tonee="success"`));
    const excess = diagnostics.filter((d) => d.code === 2561 || d.code === 2353);

    expect(excess).toHaveLength(1);
    expect(excess[0]!.message).toContain("'tone'");
    // On the name the user wrote, not on scaffolding.
    expect(excess[0]!.sourceText).toBe('tonee');
  });

  it('still reports a value of the wrong type', () => {
    const diagnostics = typecheckCorpus(badgeLine(`.tone="nope"`));
    expect(diagnostics.map((d) => d.code)).toContain(2322);
  });
});

describe('BUG-11 §6.2 and §6.3 — the $Slots contract', () => {
  it('exports the names a component declares, in source order', () => {
    const virtual = emitClient(
      `<app-card>
  <template shadowrootmode="open">
    <slot name="meta"></slot>
    <slot></slot>
    <slot name="footer"></slot>
  </template>
</app-card>
`,
      'app-card.fud',
    );
    expect(virtual.text).toContain("export type $Slots = 'meta' | 'footer';");
  });

  it('exports never when the component declares no named slot', () => {
    const onlyDefault = emitClient(
      `<app-card>
  <template shadowrootmode="open"><slot></slot></template>
</app-card>
`,
      'app-card.fud',
    );
    expect(onlyDefault.text).toContain('export type $Slots = never;');

    const none = emitClient(
      `<app-card>
  <template shadowrootmode="open"><b>x</b></template>
</app-card>
`,
      'app-card.fud',
    );
    expect(none.text).toContain('export type $Slots = never;');
  });

  it('is never for a page, a route or a layout — but it IS exported', () => {
    // A `<slot>` only means anything inside a shadow template, so a route declares none. The
    // export still has to be there, exactly as `$Sections` is: a consumer imports `$Slots`
    // from whatever it links, and a missing export is TS2305 about scaffolding instead of the
    // TS2345 about the name that the user can act on.
    const route = emitClient(
      `<link rel="layout" href="./_layout.fud">
<p>x</p>
`,
      'index.fud',
      registryOf({}, './_layout.fud'),
    );
    expect(route.text).toContain('export type $Slots = never;');
  });
});

describe('BUG-11 §6.4 and §6.5 — slot= against the PARENT (rewritten by BUG-23 §2.6)', () => {
  it('projects slot= apart from the props, never inside the literal', () => {
    const diagnostics = typecheckCorpus({
      ...badgeTemplate(`<slot name="meta"></slot>`),
      ...badgeLine(`slot="meta"`),
    });
    expect(diagnostics).toEqual([]);
  });

  it('reports a slot the parent does not declare, on the name that was written', () => {
    const diagnostics = typecheckCorpus({
      ...badgeTemplate(`<slot name="meta"></slot><slot name="footer"></slot>`),
      ...badgeLine(`slot="nope"`),
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(2345);
    // §6.9: it lands on what the user wrote, not on the scaffolding around it. The message
    // names the alias (`$S0`) rather than expanding the union — the same thing `$Sections`
    // has always done, and what hover and completion are for.
    expect(diagnostics[0]!.sourceText).toBe('nope');
  });

  it('reports any slot= at all against a parent that declares none', () => {
    const diagnostics = typecheckCorpus({
      ...badgeTemplate(`<slot></slot>`),
      ...badgeLine(`slot="meta"`),
    });
    expect(diagnostics.map((d) => d.code)).toEqual([2345]);
  });
});

describe('BUG-11 §4.2 and §4.3 — only a static name is a name', () => {
  it('declares nothing for a slot whose name is interpolated, empty or absent', () => {
    const virtual = emitClient(
      `@code {
  const { where = 'a' } = props<{ where?: string }>();
}

<app-card>
  <template shadowrootmode="open">
    <slot name="@where"></slot>
    <slot name=""></slot>
    <slot name></slot>
    <slot name="real"></slot>
  </template>
</app-card>
`,
      'app-card.fud',
    );
    // A name that is not known until it runs cannot join a union of literals without
    // inventing something the user did not write.
    expect(virtual.text).toContain("export type $Slots = 'real';");
  });

  it('does not project a slot= whose value is interpolated, but does anchor an empty one', () => {
    const { text } = emitClient(
      `@code {
  const { where = 'meta' } = props<{ where?: string }>();
}

<app-page>
  <template shadowrootmode="open">
    <app-badge slot="@where">x</app-badge>
    <app-badge slot="">y</app-badge>
  </template>
</app-page>
`,
      'app-page.fud',
      registryOf({ 'app-badge': './app-badge.fud' }),
    );
    // A name not known until it runs cannot be checked against a union of literals, so it
    // produces one call and not two — and neither falls back into the props literal.
    expect(text.match(/\$intoSlot/gu)).toHaveLength(1);
    expect(text).not.toContain('slot:');
    // `slot=""` is the position completion is asked from, so it gets the two-character
    // anchor `@|` uses (BUG-23 §4.2 rule 5).
    expect(text).toContain("$intoSlot<never>('  ');");
  });
});

describe('BUG-11 §6.8 — a PARENT with no <link>', () => {
  it('reports the tag once, and does not add a second error for the slot inside it', () => {
    const diagnostics = typecheckCorpus({
      [SLUG]: `<link rel="layout" href="../layouts/_layout.fud">

<app-missing>
  <div slot="meta">x</div>
</app-missing>
`,
    });

    // TS2304 on the tag (decision 41), and nothing else: the `$Slots` of a component that
    // was never imported does not exist either, and a second error says nothing new. Since
    // BUG-23 §2.6 the union asked for belongs to the PARENT, so it is the parent's missing
    // link that buys the silence.
    expect(diagnostics.map((d) => d.code)).toEqual([2304]);
    expect(diagnostics[0]!.sourceText).toBe('app-missing');
  });

  it('but a slot with no component parent at all is an error (BUG-23 §2.6)', () => {
    const diagnostics = typecheckCorpus({
      [SLUG]: `<link rel="layout" href="../layouts/_layout.fud">

<article>
  <div slot="meta">x</div>
</article>
`,
    });

    expect(diagnostics.map((d) => d.code)).toEqual([2345]);
    expect(diagnostics[0]!.sourceText).toBe('meta');
  });
});
