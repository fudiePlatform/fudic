/**
 * SDD-34 acceptance criteria §6.2–§6.6: the four semantic rules of `control`, plus the
 * per-element classification the emit picks its bind module from.
 *
 * Inputs go through the REAL pipeline — SDD-05 parser wired to the SDD-06 control parser,
 * structured by SDD-10 and batched through Oxc — so every rule runs over an authentic tree.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId } from '../../src/oxc/index.js';
import type { Node, Diagnostic } from '../../src/types/index.js';
import {
  analyze,
  walk,
  documentRoots,
  documentCode,
  type SemanticInput,
  type ComponentRegistry,
} from '../../src/semantic/index.js';
import { controlTarget, isFormAssociated, isRadio } from '../../src/binding/index.js';
import type { ElementNode, HtmlContent } from '../../src/html/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

const NO_COMPONENTS: ComponentRegistry = { has: () => false };
const APP_INPUT: ComponentRegistry = { has: (tag) => tag === 'app-input' };

function buildInput(source: string, components: ComponentRegistry = NO_COMPONENTS): SemanticInput {
  const html = parseDocument(source, { atConstructs: constructs }).value;
  const document = structureDocument(source, html).value;

  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  walk(documentRoots(document), {
    interpolation(expr) {
      ids.set(expr, batch.add('expression', expr.expr));
    },
  });
  const code = documentCode(document);
  if (code) {
    for (const part of code.parts) {
      if (part.type === 'neutral-js') ids.set(part, batch.add('module-statements', part.js));
    }
  }
  const js = batch.parse().value;

  return { source, document, js, fragmentId: (node) => ids.get(node), components };
}

function diags(source: string, components?: ComponentRegistry): readonly Diagnostic[] {
  return analyze(buildInput(source, components ?? NO_COMPONENTS)).diagnostics;
}

function codes(source: string, components?: ComponentRegistry): readonly string[] {
  return diags(source, components).map((d) => d.code);
}

/**
 * Wrap shadow content in a minimal valid component (DSD host wrapper, decision 75), inside a
 * bound `<form>` unless the fixture brought its own.
 *
 * The form is not decoration: by decision 115 a `control` with none above it is `FUD0595`, so
 * every fixture about a DIFFERENT rule needs one or it reports two things and the assertion
 * stops being about the rule under test. `@root` and never `@f`, so the wrapper can never be
 * the duplicate `FUD0591` is looking for.
 */
function component(inner: string, markers = ''): string {
  const body = inner.includes('<form control') ? inner : `<form control="@root">${inner}</form>`;
  return `<app-test><template shadowrootmode="open"${markers}>${body}</template></app-test>`;
}

/** Every element of a parsed snippet, in source order. */
function elements(source: string): ElementNode[] {
  const found: ElementNode[] = [];
  const collect = (nodes: readonly HtmlContent[]): void => {
    for (const node of nodes) {
      if (node.type !== 'element') continue;
      found.push(node);
      collect(node.children);
    }
  };
  collect(parseDocument(source, { atConstructs: constructs }).value.children);
  return found;
}

/** The element with the given tag, from a snippet parsed on its own. */
function element(markup: string, tag: string): ElementNode {
  const el = elements(markup).find((e) => e.name === tag);
  if (el === undefined) throw new Error(`no <${tag}> in fixture`);
  return el;
}

// ---------------------------------------------------------------------------
// §6.2 — the four cases of decision 109
// ---------------------------------------------------------------------------

describe('controlTarget — the element decides (decision 109, §6.2)', () => {
  it('classifies the four cases', () => {
    const markup =
      '<form control="@f"><input control="@f.title"><fieldset control="@f.seo"></fieldset>' +
      '<app-input control="@f.body"></app-input></form>';
    expect(controlTarget(element(markup, 'form'), false)).toEqual({ kind: 'form' });
    expect(controlTarget(element(markup, 'input'), false)).toEqual({
      kind: 'value',
      bind: 'bindText',
    });
    expect(controlTarget(element(markup, 'fieldset'), false)).toEqual({ kind: 'group' });
    expect(controlTarget(element(markup, 'app-input'), true)).toEqual({
      kind: 'component',
      tag: 'app-input',
    });
  });

  it('a group is whatever element the author chose', () => {
    for (const tag of ['fieldset', 'div', 'section']) {
      expect(controlTarget(element(`<${tag} control="@f.seo"></${tag}>`, tag), false)).toEqual({
        kind: 'group',
      });
    }
  });

  it('a declared component wins over a name that looks native', () => {
    // The declaration decides, not the spelling: `has(tag)` is the whole rule.
    expect(controlTarget(element('<form control="@f"></form>', 'form'), true)).toEqual({
      kind: 'component',
      tag: 'form',
    });
  });
});

describe('controlTarget — one function per shape of element (§4.2)', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['<input control="@c">', 'bindText'],
    ['<input type="text" control="@c">', 'bindText'],
    ['<input type="email" control="@c">', 'bindText'],
    ['<input type="color" control="@c">', 'bindText'],
    ['<input type="number" control="@c">', 'bindNumber'],
    ['<input type="range" control="@c">', 'bindNumber'],
    ['<input type="checkbox" control="@c">', 'bindCheckbox'],
    ['<input type="radio" control="@c">', 'bindRadio'],
    // Not enumerated in the table, and text on purpose: the browser gives them a string
    // `value`, and an unknown `type` is `text` by HTML's own rule.
    ['<input type="month" control="@c">', 'bindText'],
    ['<input type="hidden" control="@c">', 'bindText'],
  ];

  it.each(cases)('%s → %s', (markup, bind) => {
    expect(controlTarget(element(markup, 'input'), false)).toEqual({ kind: 'value', bind });
  });

  it('a textarea is text and a select is one of two', () => {
    expect(controlTarget(element('<textarea control="@c"></textarea>', 'textarea'), false)).toEqual(
      { kind: 'value', bind: 'bindText' },
    );
    expect(controlTarget(element('<select control="@c"></select>', 'select'), false)).toEqual({
      kind: 'value',
      bind: 'bindSelect',
    });
    expect(
      controlTarget(element('<select multiple control="@c"></select>', 'select'), false),
    ).toEqual({ kind: 'value', bind: 'bindSelectMultiple' });
  });

  it('the case of the tag and of the type is the DOM’s, not the author’s', () => {
    expect(controlTarget(element('<INPUT TYPE="CHECKBOX" control="@c">', 'INPUT'), false)).toEqual({
      kind: 'value',
      bind: 'bindCheckbox',
    });
  });

  it('isRadio is true only for a static radio input', () => {
    expect(isRadio(element('<input type="radio" control="@c">', 'input'))).toBe(true);
    expect(isRadio(element('<input type="text" control="@c">', 'input'))).toBe(false);
    expect(isRadio(element('<input type="@t" control="@c">', 'input'))).toBe(false);
    expect(isRadio(element('<select control="@c"></select>', 'select'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §6.5 — FUD0592, three faces and three messages
// ---------------------------------------------------------------------------

describe('FUD0592 — an element that carries no user value (§6.5)', () => {
  it('rejects file and the valueless types, each with its own message', () => {
    const seen = new Set<string>();
    for (const markup of [
      '<input type="file" control="@f.doc">',
      '<input type="submit" control="@f.go">',
    ]) {
      const found = diags(component(markup));
      expect(found.map((d) => d.code)).toEqual(['FUD0592']);
      seen.add(found[0]!.message);
    }
    expect(seen.size).toBe(2);
  });

  it('a DYNAMIC type is not one of them any more (decision 109)', () => {
    // It used to be the third face of `FUD0592`, on the argument that the rescue would be a
    // runtime dispatch and that dispatch is the table this design removes. Both halves were
    // true and the conclusion was not: the table is only in the chunk of the component that
    // WROTE a dynamic type, and what it buys is one `app-input` instead of one per shape of
    // `<input>`. A route that never writes one carries exactly the bindings it uses.
    expect(codes(component('<input type="@t" control="@f.title">'))).toEqual([]);
    expect(controlTarget(element('<input type="@t" control="@f.title">', 'input'), false)).toEqual({
      kind: 'value',
      bind: 'bindByType',
      dynamicType: true,
    });
  });

  it('rejects every valueless type', () => {
    for (const type of ['submit', 'reset', 'button', 'image']) {
      expect(codes(component(`<input type="${type}" control="@f.go">`))).toEqual(['FUD0592']);
    }
  });

  it('says nothing about an element with no `control` at all', () => {
    expect(codes(component('<input type="submit"><input type="@t">'))).toEqual([]);
  });

  it('a `control` whose value is not an expression is left to FUD0590 alone', () => {
    // It degraded to a plain attribute in the SDD-07 pass — which is where `FUD0590` is
    // reported and where `classify.test.ts` asserts it — so no rule about `control` sees it,
    // and the author is not told twice about one mistake.
    expect(codes(component('<input type="submit" control="go">'))).toEqual([]);
    expect(codes(component('<input control="go"><input control="go">'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §6.3 — FUD0591, one node one element (decision 110)
// ---------------------------------------------------------------------------

describe('FUD0591 — a form node binds one element (§6.3)', () => {
  it('reports the SECOND binding, with its span', () => {
    const inner = '<input control="@f.title"><input control="@f.title">';
    const source = component(inner);
    const found = diags(source);
    expect(found.map((d) => d.code)).toEqual(['FUD0591']);
    const at = found[0]!.span;
    expect(source.slice(at.start, at.end)).toBe('control="@f.title"');
    // The one blamed is the second: its span starts past the first one's.
    expect(at.start).toBeGreaterThan(source.indexOf('control="@f.title"'));
  });

  it('three radios on the same node are legitimate', () => {
    const radios = ['a', 'b', 'c']
      .map((v) => `<input type="radio" value="${v}" control="@f.tone">`)
      .join('');
    expect(codes(component(radios))).toEqual([]);
  });

  it('three radios plus a text input on the same node is FUD0591 again', () => {
    const radios = ['a', 'b', 'c']
      .map((v) => `<input type="radio" value="${v}" control="@f.tone">`)
      .join('');
    const found = codes(component(`${radios}<input type="text" control="@f.tone">`));
    expect(found).toEqual(['FUD0591', 'FUD0591', 'FUD0591']);
  });

  it('two different nodes are not a duplicate', () => {
    expect(codes(component('<input control="@f.title"><input control="@f.body">'))).toEqual([]);
  });

  it('does not compare paths that only DENOTE the same node', () => {
    // `@f["title"]` is the same node and this rule will not say so: that needs the schema,
    // and the schema has types (§4.9).
    expect(codes(component('<input control="@f.title"><input control="@f[\'title\']">'))).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// §6.4 — FUD0594, `control` in a loop (decision 114)
// ---------------------------------------------------------------------------

describe('FUD0595 — a node binds inside its own form (decision 115)', () => {
  /** The component wrapper WITHOUT the automatic `<form control>` the helper adds. */
  const bare = (inner: string, markers = ''): string =>
    `<app-test><template shadowrootmode="open"${markers}>${inner}</template></app-test>`;

  it('rejects a control with no `<form control>` above it', () => {
    expect(codes(bare('<input control="@f.title">'))).toEqual(['FUD0595']);
    expect(codes(bare('<fieldset control="@f.seo"></fieldset>'))).toEqual(['FUD0595']);
    expect(codes(bare('<app-input control="@f.body"></app-input>'), APP_INPUT)).toEqual(['FUD0595']);
  });

  it('a plain `<form>` is not a form: what opens the scope is the BINDING', () => {
    // The whole point of the rule. A `<form>` nobody bound is a foreign form — it submits
    // natively and reads the DOM, while the value the user typed lives in the model. The two
    // only ever agreed through a `name` attribute copied across by `setFormValue`, which is
    // not interop, it is two sources of truth.
    expect(codes(bare('<form><input control="@f.title"></form>'))).toEqual(['FUD0595']);
  });

  it('says nothing under a bound form, at any depth, and nothing about the form itself', () => {
    expect(
      codes(bare('<form control="@f"><div><fieldset control="@f.seo"><input control="@f.seo.c"></fieldset></div></form>')),
    ).toEqual([]);
  });

  it('a control-component is exempt: its form is in the file that handed it the node', () => {
    // `formassociated` IS the declaration that this component binds a node it did not name
    // (decision 111). Its own template has no form in it by construction, and the crossing
    // site — where the `<form>` really is — is checked by this same rule over there.
    expect(codes(bare('<input control="@ctrl">', ' formassociated'))).toEqual([]);
  });

  it('reports the binding, not the element', () => {
    const [first] = diags(bare('<input id="x" control="@f.title">'));
    expect(first!.code).toBe('FUD0595');
    expect(bare('<input id="x" control="@f.title">').slice(first!.span.start, first!.span.end)).toBe(
      'control="@f.title"',
    );
  });
});

describe('FUD0594 — `control` inside a loop (§6.4)', () => {
  it('reports it inside a @foreach', () => {
    const source = component(
      '@foreach (const it of items) key (it.id) { <input control="@f.title"> }',
    );
    const found = diags(source);
    expect(found.map((d) => d.code)).toContain('FUD0594');
    const at = found.find((d) => d.code === 'FUD0594')!.span;
    expect(source.slice(at.start, at.end)).toBe('control="@f.title"');
  });

  it('says nothing outside a loop, and nothing under an @if', () => {
    expect(codes(component('@if (x) { <input control="@f.title"> }'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §6.6 — FUD0593, where `formassociated` may be written (decision 111)
// ---------------------------------------------------------------------------

describe('FUD0593 — `formassociated` placement (§6.6)', () => {
  it('accepts it on the root template of a component', () => {
    expect(codes(component('<input control="@ctrl">', ' formassociated'))).toEqual([]);
  });

  it('rejects it on a nested template', () => {
    const source = component('<template formassociated><span></span></template>');
    const found = diags(source);
    expect(found.map((d) => d.code)).toEqual(['FUD0593']);
    expect(source.slice(found[0]!.span.start, found[0]!.span.end)).toBe('formassociated');
  });

  it('rejects it in page mode', () => {
    const page =
      '<!DOCTYPE html><html><head></head><body>' +
      '<template shadowrootmode="open" formassociated></template></body></html>';
    expect(codes(page)).toEqual(['FUD0593']);
  });

  it('ignores the word on an element that is not a template', () => {
    expect(codes(component('<div formassociated></div>'))).toEqual([]);
  });

  it('says nothing about a nested template that carries no marker', () => {
    expect(codes(component('<template><span></span></template>'))).toEqual([]);
  });

  it('isFormAssociated reads the marker, however it is spelled', () => {
    const marked = '<template shadowrootmode="open" FormAssociated></template>';
    expect(isFormAssociated(element(marked, 'template'))).toBe(true);
    expect(
      isFormAssociated(element('<template shadowrootmode="open"></template>', 'template')),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A component tag receiving a control (§6.2, the component half)
// ---------------------------------------------------------------------------

describe('control on a component tag', () => {
  it('is a crossing, not an unsupported element', () => {
    expect(codes(component('<app-input control="@f.body"></app-input>'), APP_INPUT)).toEqual([]);
  });
});
