/**
 * SDD-34 acceptance criteria §6.7–§6.8: what the two branches emit for a `control`.
 *
 * The two are asserted together on purpose. The server paints the markup and the client adopts
 * it, so an error slot one of them writes and the other does not is a node of difference
 * between the two trees — and a hydration that adopts nothing. Every criterion here that names
 * an id, an attribute or a node is checked on BOTH outputs.
 */

import { describe, expect, it } from 'vitest';
import {
  emitComponentModule,
  emitComponentClientModule,
  resolveComponents,
  hydratableTags,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** A one-component graph whose template is the given markup, with a form imported as a slice. */
function emit(
  template: string,
  code = "  import { f } from './user.form.js';",
): { server: string; client: string; hydratable: ReadonlySet<string> } {
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '<link rel="component" href="./app-input.fud">\n' +
      `@code {\n${code}\n}\n<m-el>\n  <template shadowrootmode="open">${template}</template>\n</m-el>\n`,
    '/app-input.fud':
      '@code {\n  const { ctrl } = props<{ ctrl?: unknown }>();\n}\n' +
      '<app-input>\n  <template shadowrootmode="open" formassociated><input control="@ctrl"></template>\n</app-input>\n',
  });
  const graph = resolveComponents('/home.fud', io);
  const comp = graph.components.get('m-el')!;
  return {
    server: emitComponentModule(graph, comp),
    client: emitComponentClientModule(graph, comp),
    hydratable: hydratableTags(graph),
  };
}

/**
 * The CHILD of the same graph: `app-input`, whose `<input control="@ctrl">` names a node it
 * does not own. It is emitted from the same fixture the parent is, so what one crosses and
 * what the other binds are two halves of one file.
 */
function emitChild(): string {
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud':
      '<link rel="component" href="./app-input.fud">\n' +
      '<m-el>\n  <template shadowrootmode="open"><app-input control="@f.body"></app-input></template>\n</m-el>\n',
    // Two props on purpose: `name` is the one that goes on the HOST so a foreign `<form>`
    // picks the entry up, and it is also what makes the rebind guard say something — a
    // component with one prop cannot show that the OTHER props do not re-make the binding.
    '/app-input.fud':
      '@code {\n  const { ctrl, name } = props<{ ctrl?: unknown; name?: string }>();\n}\n' +
      '<app-input>\n  <template shadowrootmode="open" formassociated><input control="@ctrl"></template>\n</app-input>\n',
  });
  const graph = resolveComponents('/home.fud', io);
  return emitComponentClientModule(graph, graph.components.get('app-input')!);
}

const OTHER_BINDS = ['bindCheckbox', 'bindNumber', 'bindRadio', 'bindSelectMultiple'] as const;

// ---------------------------------------------------------------------------
// §6.7 — six functions, and a chunk that names exactly one of them
// ---------------------------------------------------------------------------

describe('§6.7 — the switch is spent at compile time', () => {
  it.each([
    ['<input control="@f.title">', 'bindText'],
    ['<textarea control="@f.body"></textarea>', 'bindText'],
    ['<input type="number" control="@f.qty">', 'bindNumber'],
    ['<input type="range" control="@f.qty">', 'bindNumber'],
    ['<input type="checkbox" control="@f.ok">', 'bindCheckbox'],
    ['<select control="@f.tone"></select>', 'bindSelect'],
    ['<select multiple control="@f.tags"></select>', 'bindSelectMultiple'],
  ])('%s calls %s', (markup, bind) => {
    const { client } = emit(markup);
    expect(client).toContain(`import { ${bind} } from '@fudic/forms/dom';`);
    expect(client).toContain(`${bind}(`);
  });

  it('a chunk with one text field does not name the other five, nor their modules', () => {
    const { client } = emit('<input type="text" control="@f.title">');
    for (const other of [...OTHER_BINDS, 'bindSelect']) {
      expect(client).not.toContain(other);
    }
    expect(client).not.toContain('bind-checkbox');
    expect(client).not.toContain('@fudic/forms/dom/');
  });

  it('a component with no control imports nothing from `@fudic/forms/dom`', () => {
    const { client, server } = emit('<p>hola</p>', '');
    expect(client).not.toContain('@fudic/forms');
    expect(server).not.toContain('@fudic/forms');
  });

  it('groups three radios into ONE call with the list', () => {
    const { client } = emit(
      ['a', 'b', 'c'].map((v) => `<input type="radio" value="${v}" control="@f.tone">`).join(''),
    );
    expect(client.match(/bindRadio\(/gu)).toHaveLength(1);
    expect(client).toMatch(/bindRadio\(\[\$n\d+, \$n\d+, \$n\d+\]/u);
  });

  it('a `<form>` binds state and a `<fieldset>` binds a group', () => {
    const { client } = emit('<form control="@f"><fieldset control="@f.seo"></fieldset></form>');
    expect(client).toContain("import { bindForm, bindGroup } from '@fudic/forms/dom';");
    expect(client).toMatch(/bindGroup\(\$n\d+, f\.seo\)/u);
  });

  it('binds inside an `@if`, into that block’s own hookup', () => {
    // A block is a walk of its own with its own nodes and its own `$d`: the binding has to
    // land in that closure, not in the component's (SDD-30 §3.1).
    const { client } = emit('@if (true) { <input control="@f.title"> }');
    expect(client).toContain("import { bindText } from '@fudic/forms/dom';");
    expect(client).toContain('bindText(');
    // The block tracks its roots, the slot among them: it is a node the block owns and has
    // to be able to take away.
    expect(client.match(/\$r\.push\(/gu)!.length).toBeGreaterThan(1);
  });

  it('a component tag calls nothing: the reference crosses instead (decision 110)', () => {
    const { client } = emit('<app-input control="@f.body"></app-input>');
    expect(client).not.toContain('@fudic/forms/dom');
    expect(client).not.toContain('data-fud-err');
  });

  it('the reference crosses as the `ctrl` prop, by REFERENCE and with no `u` (§6.2)', () => {
    const { client, server } = emit('<app-input control="@f.body"></app-input>');
    // Handed over ONCE, at hookup, as the object itself — not a read of it. It is the `ref`
    // shape of BUG-24: parent and child hold the same node, so there is nothing to reforward.
    expect(client).toMatch(/\$n\d+\.u\(\[, , f\.body\]\);/u);
    expect(client).not.toContain('$sub(f.body');
    // On the server there is no cable at all: the child's `render` is a call in this process.
    expect(server).toContain('{ "ctrl": f.body }');
  });

  it('no `u` pass is emitted for it: the child is beside the parent, not downstream', () => {
    const { client } = emit('<app-input control="@f.body"></app-input>');
    // The handover is in `$s`, which both `c` and `h` run. The update pass has no slot for
    // it — writing into the node does not repaint the parent (decision 84 intact).
    const update = client.slice(client.indexOf('u: ('), client.indexOf('r: ('));
    expect(update).not.toContain('f.body');
  });

  it('the child binds the crossed node from `$cb`, and not from the hookup', () => {
    // The other end of decision 110, and the reason it needs one at all: the cascade hooks a
    // child up in POST-ORDER, before the parent composes what it hands over, so `ctrl` is
    // still empty when `$s` runs. Binding there would bind nothing — and, with no guard,
    // would call `bindText` with `null` and throw inside the hydration.
    const child = emitChild();
    expect(child).toContain('const $cd = []');
    expect(child).toContain('const $cb = () => {');
    // Read ONCE into a name of its own: the guard and the argument have to be the same
    // evaluation of the author's expression.
    expect(child).toContain('const $fc0 = ctrl;');
    expect(child).toMatch(/\$fc0 && \$cd\.push\(bindText\(/u);
    // And nothing of it in `$s` beyond the call that runs it.
    expect(child).toContain('$cb();');
    expect(child).not.toContain('$d.push(bindText(');
  });

  it('`$cb` undoes its own previous work, so the second call replaces the first', () => {
    const child = emitChild();
    const body = child.slice(child.indexOf('const $cb'), child.indexOf('const $s'));
    expect(body).toContain('for (const $x of $cd) $x();');
    expect(body).toContain('$cd.length = 0;');
  });

  it('`u` re-makes it, and only when THAT prop is the one that moved', () => {
    const child = emitChild();
    const update = child.slice(child.indexOf('u: ('), child.indexOf('r: ('));
    // `ctrl` is the first prop, so slot 2 — presence, like every other guard: a sparse
    // payload says what moved, and a prop nobody named must not cost a rebind.
    expect(update).toContain('if (2 in $p) $cb();');
    // And the sibling prop is not in it: a rebind tears listeners down and puts them back,
    // so a `name` that moved must not cost the `<input>` its binding.
    expect(update).not.toContain('3 in $p) $cb()');
  });

  it('`r` disposes them: they are the one list emptied while the instance lives', () => {
    const child = emitChild();
    const release = child.slice(child.indexOf('r: ('));
    expect(release).toContain('$cd.forEach((d) => d());');
    expect(release).toContain('$d.forEach((d) => d());');
  });

  it('a node that is NOT a prop is bound at hookup, with no `$cb` anywhere', () => {
    // The form of `m-el` comes from a neutral import: it is there when the factory runs, it
    // cannot be replaced by an update, and it pays for none of the machinery above.
    const { client } = emit('<input control="@f.title">');
    expect(client).toContain('$d.push(bindText(');
    expect(client).not.toContain('$cb');
    expect(client).not.toContain('$cd');
  });

  it('an unsupported element emits no binding at all, and the file still emits', () => {
    const { client, server } = emit('<input type="submit" control="@f.go"><p>resto</p>');
    expect(client).not.toContain('@fudic/forms/dom');
    expect(client).not.toContain('data-fud-err');
    // The rest of the file is there: the emit reports and goes on (§5).
    expect(server).toContain('$dom.element("p")');
  });
});

// ---------------------------------------------------------------------------
// §6.8 — the markup: no `control`, a stable slot, `aria-describedby` always
// ---------------------------------------------------------------------------

describe('§6.8 — the error slot lives in the markup', () => {
  it('the attribute `control` does not survive to the HTML, on either branch', () => {
    const { server, client } = emit('<input control="@f.title">');
    for (const out of [server, client]) {
      expect(out).not.toContain("'control'");
      expect(out).not.toContain('"control"');
    }
  });

  it('both branches write the same slot id and the same `aria-describedby`', () => {
    const { server, client } = emit('<input control="@f.seo.canonical">');
    const id = 'fud-e-f-seo-canonical';
    for (const out of [server, client]) {
      expect(out).toContain(`$dom.setAttr($n0, 'aria-describedby', "${id}");`);
      expect(out).toContain(`'id', "${id}"`);
      expect(out).toContain("'data-fud-err', ''");
    }
  });

  it('the id comes from the NODE, not from a counter: order does not move it', () => {
    const first = emit('<input control="@f.a"><input control="@f.b">');
    const second = emit('<input control="@f.b"><input control="@f.a">');
    for (const out of [first.server, first.client, second.server, second.client]) {
      expect(out).toContain('fud-e-f-a');
      expect(out).toContain('fud-e-f-b');
    }
  });

  it('a radio group gets ONE slot, after its last element', () => {
    const { server, client } = emit(
      ['a', 'b'].map((v) => `<input type="radio" value="${v}" control="@f.tone">`).join(''),
    );
    for (const out of [server, client]) {
      expect(out.match(/fud-e-f-tone/gu)!.length).toBeGreaterThanOrEqual(3); // 2 refs + 1 id
      expect(out.match(/'data-fud-err', ''/gu)).toHaveLength(1);
    }
  });

  it('the server writes `aria-invalid` and the message when the form renders with errors', () => {
    const { server } = emit('<input control="@f.title">');
    expect(server).toContain('if (f.title.touched() && f.title.errors())');
    expect(server).toContain("$dom.setAttr($n0, 'aria-invalid', 'true')");
    expect(server).toContain("import { errorText as $fudErrorText } from '@fudic/forms';");
    expect(server).toContain('$dom.text($fudErrorText($e))');
  });

  it('the client writes NEITHER: they follow the errors, so the effect owns them', () => {
    const { client } = emit('<input control="@f.title">');
    expect(client).not.toContain('aria-invalid');
    expect(client).not.toContain('errorText');
  });

  it('a `<form>` gets a polite live region beside it', () => {
    const { server, client } = emit('<form control="@f"></form>');
    for (const out of [server, client]) {
      expect(out).toContain("'id', \"fud-s-f\"");
      expect(out).toContain("'data-fud-sum', ''");
      expect(out).toContain("'aria-live', 'polite'");
    }
    expect(server).toContain('const $e = f.$summary();');
  });

  it('a group and a component tag get no slot of their own', () => {
    const { server } = emit('<fieldset control="@f.seo"></fieldset>');
    expect(server).not.toContain('data-fud-err');
    expect(server).not.toContain('data-fud-sum');
  });
});

// ---------------------------------------------------------------------------
// §4.8 — a form is level 3
// ---------------------------------------------------------------------------

describe('§4.8 — a control makes the component hydrate', () => {
  it('a template whose only hookup is a `control` is hydratable', () => {
    expect(emit('<input control="@f.title">').hydratable.has('m-el')).toBe(true);
  });

  it('the same template without it is not', () => {
    expect(emit('<input>', '').hydratable.has('m-el')).toBe(false);
  });
});
