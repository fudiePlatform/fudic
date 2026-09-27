/**
 * SDD-34 acceptance criteria §6.2–§6.6: the four semantic rules of `control`, plus the
 * per-element classification the emit picks its bind module from.
 *
 * Inputs go through the REAL pipeline — SDD-05 parser wired to the SDD-06 control parser,
 * structured by SDD-10 and batched through Oxc — so every rule runs over an authentic tree.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
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

// The whole construct set, `@section` and `@snippet` included: a marker's block can be either.
const constructs: AtConstructParser = atConstructs;

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

// ---------------------------------------------------------------------------
// BUG-41 §3.4 — the `error` marker (decision 130), criterion 18
// ---------------------------------------------------------------------------

describe('error marker — what pairs (BUG-41 §3.3)', () => {
  it.each([
    ['after its field', '<input control="@f.title"><p error="@f.title"></p>'],
    ['before its field', '<p error="@f.title"></p><input control="@f.title">'],
    ['somewhere else in the tree', '<div><input control="@f.title"></div><footer><p error="@f.title"></p></footer>'],
    ['with its own static id', '<input control="@f.title"><p id="mine" error="@f.title"></p>'],
    ['holding only whitespace', '<input control="@f.title"><p error="@f.title">  </p>'],
    ['for a group', '<fieldset control="@f.seo"><div summary="@f.seo"></div></fieldset>'],
    ['for a radio group', '<input type="radio" control="@f.t"><input type="radio" control="@f.t"><p error="@f.t"></p>'],
    ['inside the same @if branch', '@if (x) { <input control="@f.title"><p error="@f.title"></p> }'],
    ['inside the same @else', '@if (x) { } else { <input control="@f.title"><p error="@f.title"></p> }'],
    ['inside the same @switch case', '@switch (x) { case 1: <input control="@f.title"><p error="@f.title"></p> }'],
  ])('pairs a marker %s', (_, inner) => {
    expect(codes(component(inner))).toEqual([]);
  });

  it('pairs the form’s own summary, inside the form', () => {
    expect(codes(component('<form control="@f"><div summary="@f"></div></form>'))).toEqual([]);
  });
});

describe('FUD0597 — a marker with nothing beside it to describe', () => {
  it('names a node no element of the template binds', () => {
    const source = component('<p error="@f.title"></p>');
    const [diag] = diags(source);
    expect(diag!.code).toBe('FUD0597');
    expect(source.slice(diag!.span.start, diag!.span.end)).toBe('error="@f.title"');
  });

  it('names a node bound in ANOTHER block', () => {
    expect(codes(component('@if (x) { <input control="@f.title"> }<p error="@f.title"></p>'))).toEqual(
      ['FUD0597'],
    );
  });

  it('names a node that only crosses into a component that is not a control-component', () => {
    const found = diags(
      component('<app-input control="@f.body"></app-input><p error="@f.body"></p>'),
      { ...APP_INPUT, formAssociated: () => false },
    );
    expect(found.map((d) => d.code)).toEqual(['FUD0597']);
    expect(found[0]!.message).toContain('formassociated');
  });

  it('pairs a marker beside a control-component: the relay carries it inside (BUG-42 §4.9)', () => {
    const source = component('<app-input control="@f.body"></app-input><p error="@f.body"></p>');
    expect(codes(source, { ...APP_INPUT, formAssociated: () => true })).toEqual([]);
  });

  it('says nothing when it cannot know whether the component is a control-component', () => {
    const source = component('<app-input control="@f.body"></app-input><p error="@f.body"></p>');
    expect(codes(source, APP_INPUT)).toEqual([]);
  });

  it('names a node bound to an element that carries no value', () => {
    expect(codes(component('<input type="submit" control="@f.go"><p error="@f.go"></p>'))).toEqual([
      'FUD0592',
      'FUD0597',
    ]);
  });
});

describe('FUD0598 — one node, one marker', () => {
  it('reports the second marker of a node', () => {
    const source = component('<input control="@f.title"><p error="@f.title"></p><i error="@f.title"></i>');
    const [diag] = diags(source);
    expect(diag!.code).toBe('FUD0598');
    expect(source.slice(diag!.span.start)).toMatch(/^error="@f\.title"><\/i>/u);
  });

  it('reports a marker inside a loop: every row would carry the same id', () => {
    const source = component(
      '<input control="@f.title">@foreach (const it of items) key (it) { <p error="@f.title"></p> }',
    );
    expect(codes(source)).toEqual(['FUD0598']);
  });
});

describe('FUD0599 — the runtime owns the marker’s text, and its id has to be readable', () => {
  it('reports content the runtime would overwrite', () => {
    expect(codes(component('<input control="@f.title"><p error="@f.title">Obligatorio</p>'))).toEqual([
      'FUD0599',
    ]);
  });

  it('reports an element inside it', () => {
    expect(codes(component('<input control="@f.title"><p error="@f.title"><b></b></p>'))).toEqual([
      'FUD0599',
    ]);
  });

  it('reports an id the compiler cannot point at', () => {
    expect(codes(component('<input control="@f.title"><p id="@x" error="@f.title"></p>'))).toEqual([
      'FUD0599',
    ]);
  });
});

describe('error marker — the blocks a page and a snippet add', () => {
  it('a `@section` body is a block of its own', () => {
    const route =
      '<link rel="layout" href="./_layout.fud">\n' +
      '@section nav {\n  <form control="@f"><input control="@f.q"><p error="@f.q"></p></form>\n}\n';
    expect(codes(route)).not.toContain('FUD0597');
  });

  it('a `@snippet` body is a block of its own', () => {
    const file =
      '@snippet row(x: string) { <form control="@f"><input control="@f.q"></form> }\n' +
      '@snippet hint(x: string) { <p error="@f.q"></p> }\n';
    expect(codes(file)).toContain('FUD0597');
  });
});

// ---------------------------------------------------------------------------
// BUG-42 §3.6 — summary, fields and the bridge (criteria 19, 20)
// ---------------------------------------------------------------------------

describe('BUG-42 — the two markers, one meaning each (criterion 19)', () => {
  it('FUD0600: `error` on a form or a group, on the attribute', () => {
    for (const inner of [
      '<form control="@f"><div error="@f"></div></form>',
      '<fieldset control="@f.seo"><div error="@f.seo"></div></fieldset>',
    ]) {
      const source = component(inner);
      const [diag] = diags(source);
      expect(diag!.code).toBe('FUD0600');
      expect(source.slice(diag!.span.start, diag!.span.end)).toMatch(/^error="@f(\.seo)?"$/u);
      expect(diag!.message).toContain('summary=');
    }
  });

  it('FUD0601: `summary` on a control', () => {
    const source = component('<input control="@f.name"><div summary="@f.name"></div>');
    const [diag] = diags(source);
    expect(diag!.code).toBe('FUD0601');
    expect(source.slice(diag!.span.start, diag!.span.end)).toBe('summary="@f.name"');
    expect(diag!.message).toContain('error=');
  });

  it.each(['p', 'span', 'small', 'label', 'a', 'button', 'strong', 'em', 'b', 'i', 'h1', 'h6', 'legend'])(
    'FUD0602: a summary on a <%s> cannot hold its list',
    (tag) => {
      const source = component(`<form control="@f"><${tag} summary="@f"></${tag}></form>`);
      expect(codes(source)).toEqual(['FUD0602']);
    },
  );

  it('a summary on a <div>, a <section> or a <ul> holder is fine', () => {
    for (const tag of ['div', 'section', 'aside']) {
      expect(codes(component(`<form control="@f"><${tag} summary="@f" fields></${tag}></form>`))).toEqual([]);
    }
  });

  it('the compiler chooses no field: loose radios or a dynamic id are the author’s business', () => {
    // `FUD0603` and `FUD0604` are retired (decision 132, amended): with no bridge written by
    // the author there is nothing to point at, and so nothing to report.
    for (const body of [
      '<input type="radio" control="@ctrl"><input type="radio" control="@ctrl">',
      '<input id="@x" control="@ctrl">',
    ]) {
      expect(codes(`<app-test><template shadowrootmode="open" formassociated>${body}</template></app-test>`)).toEqual([]);
    }
  });

  it('FUD0605: a hand-written reference target that is dynamic or names no id of the template', () => {
    for (const target of ['@x', 'nadie']) {
      const source =
        `<app-test><template shadowrootmode="open" formassociated shadowrootreferencetarget="${target}">` +
        '<input id="campo" control="@ctrl"></template></app-test>';
      const found = diags(source);
      expect(found.map((d) => d.code)).toEqual(['FUD0605']);
      expect(source.slice(found[0]!.span.start, found[0]!.span.end)).toMatch(/^shadowrootreferencetarget=/u);
    }
  });

  it('a hand-written reference target naming an id of the template is fine', () => {
    const source =
      '<app-test><template shadowrootmode="open" formassociated shadowrootreferencetarget="campo">' +
      '<input id="campo" control="@ctrl"></template></app-test>';
    expect(codes(source)).toEqual([]);
  });

  it('a control-component that binds nothing has no bridge and nothing to report', () => {
    expect(codes('<app-test><template shadowrootmode="open" formassociated><p></p></template></app-test>')).toEqual([]);
  });
});

describe('BUG-42 — FUD0596–FUD0599 speak for `summary` too (criterion 20)', () => {
  it('FUD0597, FUD0598 and FUD0599 name it too', () => {
    expect(diags(component('<div summary="@f.nada"></div>'))[0]!.code).toBe('FUD0597');
    const loop = diags(
      component('<form control="@f">@foreach (const it of items) key (it) { <div summary="@f"></div> }</form>'),
    );
    expect(loop.map((d) => d.code)).toContain('FUD0598');
    expect(loop.find((d) => d.code === 'FUD0598')!.message).toContain('`summary`');
    const full = diags(component('<form control="@f"><div summary="@f">x</div></form>'));
    expect(full.map((d) => d.code)).toEqual(['FUD0599']);
    expect(full[0]!.message).toContain('`summary`');
  });
});
