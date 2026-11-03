/**
 * `propChannelDiagnostics` and `declaredPropsOf` (SDD-62): the form of a prop crossing, checked
 * from one document and what each child declares, with no resolved graph — what the editor and
 * the check run, so `FUD0200` and `FUD0201` are their voice as well as the build's.
 */

import { describe, expect, it } from 'vitest';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument, type ComponentDocument, type StructuredDocument } from '../../src/document/index.js';
import { declaredPropsOf, propChannelDiagnostics } from '../../src/emit/index.js';
import { parseDocument } from '../../src/html/index.js';

function structured(source: string): StructuredDocument {
  return structureDocument(source, parseDocument(source, { atConstructs }).value).value;
}

const CHILD = `@code {
  import type { Signal } from "@fudic/core";
  const { count, onSave, label } = props<{ count: Signal<number>; onSave: () => void; label?: string }>();
}

<app-child>
  <template shadowrootmode="open"><p>@count()</p></template>
</app-child>
`;

const childProps = declaredPropsOf(CHILD, structured(CHILD) as ComponentDocument);

const parent = (bindings: string): string => `<link rel="component" href="./app-child.fud">

@code {
  import { signal } from "@fudic/core";
  const count = signal(0);
  function save() {}
}

<app-parent>
  <template shadowrootmode="open"><app-child ${bindings}></app-child></template>
</app-parent>
`;

/** What the check says about `source`, as `CODE text-under-it`. */
function said(source: string): readonly string[] {
  return propChannelDiagnostics(source, structured(source), (tag) => (tag === 'app-child' ? childProps : undefined)).map(
    (d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`,
  );
}

describe('declaredPropsOf', () => {
  it('reads each prop of a parsed component: name, required, and its channel', () => {
    expect(childProps.map((p) => [p.name, p.required, p.channel ?? null])).toEqual([
      ['count', true, 'signal'],
      ['onSave', true, 'fn'],
      ['label', false, null],
    ]);
  });
});

describe('propChannelDiagnostics', () => {
  it('a Signal prop fed a read, over the whole attribute (FUD0200)', () => {
    expect(said(parent('.count="@count()" .onSave="@save"'))).toEqual(['FUD0200 .count="@count()"']);
  });

  it('a callback prop fed an arrow, over the whole attribute (FUD0201)', () => {
    expect(said(parent('.count="@count" .onSave="@(() => save())"'))).toEqual(['FUD0201 .onSave="@(() => save())"']);
  });

  it('the right form says nothing', () => {
    expect(said(parent('.count="@count" .onSave="@save"'))).toEqual([]);
  });

  it('an imported name crosses as whatever it is: TypeScript says, not this rule', () => {
    const source = parent('.count="@shared" .onSave="@save"').replace(
      'import { signal } from "@fudic/core";',
      'import { signal } from "@fudic/core";\n  import { shared } from "./store.js";',
    );
    expect(said(source)).toEqual([]);
  });

  it('a child it cannot read is not checked', () => {
    const source = parent('.count="@count()"').replaceAll('app-child', 'app-ghost');
    expect(said(source)).toEqual([]);
  });

  it('a file of snippets owns no names: a Signal prop it feeds is FUD0200', () => {
    const source = `<link rel="component" href="./app-child.fud">
@snippet row(n: number) { <app-child .count="@n" .onSave="@n"></app-child> }
`;
    expect(structured(source).type).toBe('snippet-document');
    expect(said(source).map((s) => s.split(' ')[0])).toContain('FUD0200');
  });
});
