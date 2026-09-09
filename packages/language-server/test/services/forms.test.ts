/**
 * What may be written in a `control`, and where (SDD-34 §4.1, decisions 109, 112 and 115).
 *
 * Two authorities and therefore two harnesses. WHERE is the grammar's and is asked of the parse
 * alone, so those tests are a source string and a tree. WHAT is the TYPE's and only TypeScript
 * knows it, so those run over a REAL program: the shapes are read structurally — callable plus
 * `set`/`touch` for a control, `$touch`/`$validate` for a form — and a hand-written checker
 * that answered them would be a second implementation of the very thing under test.
 *
 * The degradations are hand-made, and they have to be: a real program cannot be made to lack a
 * program, and «no answer» is what every caller here is built to survive.
 */

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { clientFileName } from '@fudic/language-core';
import { DocumentCache } from '../../src/document-cache.js';
import { parseFud } from '../../src/parse.js';
import {
  accepts,
  bindsControl,
  boundPaths,
  controlBindingSites,
  controlOfferAt,
  controlSites,
  controlWants,
  nodeMembersAt,
  nodeMembersBefore,
  nodesInScope,
  projectedOffset,
  reaches,
  wantsLabel,
} from '../../src/services/forms.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { component, LAYOUT, memoryFs } from '../_support.js';

const doc = (source: string) => parseFud(source).document;

/**
 * `markup` as a route, which is the shortest `.fud` that holds arbitrary markup at the root.
 *
 * The link is not decoration: the role decides what `documentRoots` walks, and a fragment with
 * no role at all has no roots to walk.
 */
const page = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">\n${markup}\n`;

/** The element with this tag, from a parsed source — what the tree questions are asked about. */
function elementOf(source: string, tag: string) {
  const found = [...controlSites(doc(source), source)].find((el) => el.name === tag);
  return found;
}

/**
 * A page holding `markup`, cached the way the plugin caches one.
 *
 * `controlOfferAt` and `projectedOffset` take a `CachedDocument` rather than a tree: the first
 * because the ROLE of the file decides (a layout never offers a `control`), the second because
 * it reads the projection.
 */
function cache(markup: string, path = '/p/pages/index.fud') {
  const source =
    path.endsWith('_layout.fud') || path.includes('/components/')
      ? markup
      : `<link rel="layout" href="../layouts/_layout.fud">\n${markup}\n`;
  const index = new WorkspaceIndex(
    memoryFs({
      '/p/layouts/_layout.fud': LAYOUT,
      '/p/components/app-badge.fud': component('app-badge'),
      [path]: source,
    }),
  );
  index.scan('/p');
  return new DocumentCache(index).get(path, 1, source);
}

describe('controlWants — what the element takes (decision 109)', () => {
  const wants = (markup: string, tag: string) => {
    const el = elementOf(page(`<form control="@f">${markup}</form>`), tag);
    return controlWants(el!, tag.includes('-'));
  };

  it('reads the three native shapes off the tag', () => {
    expect(wants('<input>', 'input')).toBe('control');
    expect(wants('<textarea></textarea>', 'textarea')).toBe('control');
    expect(wants('<div></div>', 'div')).toBe('group');
    expect(controlWants(elementOf(page('<form></form>'), 'form')!, false)).toBe('form');
  });

  it('leaves a component to its own contract (decision 112)', () => {
    expect(wants('<app-input></app-input>', 'app-input')).toBe('component');
  });

  it('has no answer for an element that can make nothing of a control', () => {
    // `<input type="submit">` is `FUD0592`: offering the attribute there is offering the error.
    expect(wants('<input type="submit">', 'input')).toBeUndefined();
  });
});

describe('accepts and reaches — a binding is an end, a list is a step', () => {
  it('accepts exactly what the element binds', () => {
    expect(accepts('control', 'control')).toBe(true);
    expect(accepts('control', 'group')).toBe(false);
    expect(accepts('group', 'group')).toBe(true);
    expect(accepts('form', 'control')).toBe(false);
    // A component is checked against the `ctrl` its own contract declares, never from here.
    expect(accepts('component', 'control')).toBe(true);
    expect(accepts('component', 'group')).toBe(true);
  });

  it('reaches through a group even where it does not fit', () => {
    // `@userForm` is not what an `<input>` binds, and it is the only way to write what it does.
    expect(reaches('control', 'group')).toBe(true);
    expect(reaches('control', 'control')).toBe(true);
    // A control is the other direction: nothing hangs off a leaf.
    expect(reaches('form', 'control')).toBe(false);
    expect(reaches('group', 'control')).toBe(false);
  });

  it('says what each element takes, in the words of the model', () => {
    expect(wantsLabel('form')).toBe('form');
    expect(wantsLabel('control')).toBe('control');
    expect(wantsLabel('group')).toBe('group');
    expect(wantsLabel('component')).toBe('control node');
  });
});

describe('controlSites — where a `control` may be written (decision 115)', () => {
  const namesOf = (source: string) =>
    [...controlSites(doc(source), source)].map((el) => el.name).sort();

  it('always holds the `<form>`, which is the element that opens one', () => {
    // Even with no binding on it yet: it is the only way the first `control` of a file can be
    // offered at all.
    expect(namesOf(page('<form></form>'))).toEqual(['form']);
  });

  it('holds everything under a bound `<form>`, however deep', () => {
    const source = page('<form control="@f"><fieldset><input></fieldset></form><input id="out">');

    expect(namesOf(source)).toEqual(['fieldset', 'form', 'input']);
  });

  it('holds nothing under a `<form>` that binds nothing', () => {
    // The children of an unbound `<form>` are not inside a form: there is no node above them,
    // and a `control` there is exactly the `FUD0595` the analyser reports.
    expect(namesOf(page('<form><input></form>'))).toEqual(['form']);
  });

  it('holds every element of a `formassociated` template, form or no form', () => {
    // A control-component binds the node its parent handed it, so its own template needs no
    // `<form>` above anything — decision 115's exemption.
    const associated = `<app-input>\n  <template shadowrootmode="open" formassociated>\n    <span><input></span>\n  </template>\n</app-input>\n`;

    expect(namesOf(associated)).toContain('input');
    expect(namesOf(associated)).toContain('span');
  });

  it('and none of it when the same template is not form-associated', () => {
    expect(namesOf(component('app-input'))).toEqual([]);
  });
});

describe('controlBindingSites — what the light bulb is made of', () => {
  const sitesOf = (source: string) => controlBindingSites(doc(source), source);

  it('carries the form above each field, as written and as an offset inside it', () => {
    const source = page('<form control="@userForm"><input></form>');
    const input = sitesOf(source).find((site) => site.element.name === 'input');

    expect(input?.wants).toBe('control');
    expect(input?.owner?.path).toBe('@userForm');
    // INSIDE the expression, not just past it: a half-open mapping would have left it outside.
    expect(source.slice(input!.owner!.at, input!.owner!.at + 1)).toBe('m');
  });

  it('offers the `<form>` itself with no owner, since it is the one that opens the scope', () => {
    const form = sitesOf(page('<form><input></form>')).find((site) => site.element.name === 'form');

    expect(form?.wants).toBe('form');
    expect(form?.owner).toBeUndefined();
  });

  it('points at the place ` control=…` goes: just past the tag name', () => {
    const source = page('<form control="@userForm"><input id="a"></form>');
    const input = sitesOf(source).find((site) => site.element.name === 'input')!;

    expect(source.slice(input.insertAt, input.insertAt + 4)).toBe(' id=');
  });

  it('skips an element that already names a node, in either spelling', () => {
    const attribute = page('<form control="@userForm"><input control="@userForm.a"></form>');
    const prop = page('<form control="@userForm"><app-x .ctrl="@userForm.a"></app-x></form>');

    expect(sitesOf(attribute).map((site) => site.element.name)).toEqual([]);
    expect(sitesOf(prop).map((site) => site.element.name)).toEqual([]);
  });

  it('skips an element that can make nothing of a control', () => {
    const source = page('<form control="@userForm"><input type="submit"></form>');

    expect(sitesOf(source).map((site) => site.element.name)).toEqual([]);
  });

  it('leaves the fields ownerless when the `<form>` opened with an empty value', () => {
    // `control=` with nothing behind it is `FUD0590`: it names no form, so there is nothing to
    // offer the fields of, and the bulb falls back to the nodes the file declares.
    const source = page('<form control=><input></form>');
    const site = sitesOf(source).find((s) => s.element.name === 'input');

    expect(site?.owner).toBeUndefined();
  });

  it('and ownerless too when the `<form>` carries the name with no value at all', () => {
    // `<form control>` is the boolean spelling: no `=`, so there is no value span to read a
    // path out of — a different absence from the empty one, and the same answer.
    const source = page('<form control><input></form>');
    const site = sitesOf(source).find((s) => s.element.name === 'input');

    expect(site?.owner).toBeUndefined();
  });
});

describe('boundPaths and bindsControl — what is already on screen', () => {
  it('reads both spellings of a binding as the one path they are', () => {
    const source = page('<form control="@userForm"><app-x .ctrl="@userForm.a"></app-x></form>');

    expect([...boundPaths(doc(source), source)].sort()).toEqual(['@userForm', '@userForm.a']);
  });

  it('has no path to remember for a binding written with no value at all', () => {
    // `.ctrl` with no `=` is still the prop a `control` crosses as, so it is read here — and
    // there is no value span to take a path out of. `control` bare never reaches this: with no
    // expression behind it the grammar degrades it to a plain attribute.
    const source = page('<form control="@userForm"><app-x .ctrl></app-x></form>');

    expect([...boundPaths(doc(source), source)]).toEqual(['@userForm']);
  });

  it('says of an element whether it names a node at all', () => {
    const source = page('<form control="@userForm"><input></form>');
    const tree = doc(source);

    expect(bindsControl([...controlSites(tree, source)].find((el) => el.name === 'form')!, source)).toBe(true);
    expect(bindsControl([...controlSites(tree, source)].find((el) => el.name === 'input')!, source)).toBe(false);
  });
});

describe('controlOfferAt — whether `control` belongs in this attribute list', () => {
  const offerFor = (markup: string, tag: string) => {
    const cached = cache(markup);
    const el = [...controlSites(cached.document, cached.source)].find((e) => e.name === tag);
    return el === undefined ? undefined : controlOfferAt(cached, el, tag.includes('-'));
  };

  it('offers it inside a form, saying what the element takes', () => {
    expect(offerFor('<form control="@f"><input></form>', 'input')).toEqual({
      wants: 'control',
      label: 'control',
    });
  });

  it('refuses it where the element already carries one', () => {
    expect(offerFor('<form control="@f"><input control="@f.a"></form>', 'input')).toBeUndefined();
  });

  it('refuses it outside any form, where it would be `FUD0595`', () => {
    expect(offerFor('<article><input></article>', 'input')).toBeUndefined();
  });

  it('refuses it on an element that can make nothing of one', () => {
    expect(offerFor('<form control="@f"><input type="file"></form>', 'input')).toBeUndefined();
  });

  it('refuses it in a LAYOUT, which has no `@code` to name a node from', () => {
    const cached = cache(LAYOUT.replace('@RenderBody()', '<form></form>\n      @RenderBody()'), '/p/layouts/_layout.fud');
    const form = [...controlSites(cached.document, cached.source)].find((el) => el.name === 'form');

    expect(controlOfferAt(cached, form!, false)).toBeUndefined();
  });
});

describe('projectedOffset — a `.fud` offset in the file the checker reads', () => {
  it('carries an offset the projection copied', () => {
    const cached = cache('@code {\n  const n = 1;\n}\n<article>hi</article>');

    expect(projectedOffset(cached, cached.source.indexOf('const n'))).toBeGreaterThan(0);
  });

  it('has nothing to say about an offset the projection never copied', () => {
    const cached = cache('<article>hi</article>');

    expect(projectedOffset(cached, cached.source.length - 1)).toBeUndefined();
  });

  it('has nothing to say when the document carries no client projection', () => {
    const cached = cache('<article>hi</article>');
    const without = {
      ...cached,
      virtuals: cached.virtuals.filter((v) => v.fileName !== clientFileName(cached.path)),
    };

    expect(projectedOffset(without, 0)).toBeUndefined();
  });
});

/**
 * The shape questions, over a real program.
 *
 * The file is plain TypeScript rather than a projection: what `nodesInScope` and its two
 * siblings read is a source file and an offset, and building the shapes by hand here is what
 * keeps the test about the SHAPE test — a control is callable and carries `set`/`touch`, a form
 * carries `$touch`/`$validate` — and not about the emitter that usually writes them.
 */
describe('the checker half', () => {
  const FILE = '/p/model.ts';
  const MODEL = `
type Control<T> = { (): T; set(v: T): void; touch(): void };
type Group<S> = S & { $touch(): void; $validate(): Promise<boolean> };
declare const userForm: Group<{ alias: Control<string>; address: Group<{ street: Control<string> }> }>;
declare const maybe: Control<string> | undefined;
declare const plain: string;
declare const callable: () => string;
const here = userForm.alias;
`;

  /** A real language service over one file in memory. */
  const serviceOver = (text: string): ts.LanguageService => {
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [FILE],
      getScriptVersion: () => '1',
      getScriptSnapshot: (name) =>
        name === FILE ? ts.ScriptSnapshot.fromString(text) : undefined,
      getCurrentDirectory: () => '/',
      getCompilationSettings: () => ({ strict: true, target: ts.ScriptTarget.ES2022 }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (name) => name === FILE,
      readFile: (name) => (name === FILE ? text : undefined),
    };
    return ts.createLanguageService(host);
  };

  const service = serviceOver(MODEL);

  describe('nodesInScope', () => {
    it('keeps the names that hold a node, and says which kind each is', () => {
      const found = nodesInScope(service, FILE, MODEL.indexOf('userForm.alias'));

      expect(found.get('userForm')).toBe('group');
      expect(found.get('userForm.address')).toBeUndefined();
      // `Control<T> | undefined` is still a control: an optional prop is a prop of that shape.
      expect(found.get('maybe')).toBe('control');
    });

    it('drops everything that is not one, callable or not', () => {
      const found = nodesInScope(service, FILE, MODEL.indexOf('userForm.alias'));

      expect(found.has('plain')).toBe(false);
      // Callable is half of the control shape; without `set` and `touch` it is a function.
      expect(found.has('callable')).toBe(false);
      // And TypeScript's own globals, which are in scope at every offset of any file.
      expect(found.has('parseInt')).toBe(false);
    });

    it('drops the names the projection invented, which the author may not write', () => {
      const found = nodesInScope(serviceOver(`${MODEL}\ndeclare const $control: typeof userForm;`), FILE, 1);

      expect(found.has('$control')).toBe(false);
    });
  });

  describe('nodeMembersAt and nodeMembersBefore', () => {
    it('reads the fields of the node an expression names', () => {
      const found = nodeMembersAt(service, FILE, MODEL.indexOf('userForm.alias') + 2);

      expect(found.get('alias')).toBe('control');
      expect(found.get('address')).toBe('group');
      // A form's own API is not a node, so it fails the shape test like anything else.
      expect(found.has('$validate')).toBe(false);
      expect(found.has('$touch')).toBe(false);
    });

    it('reads them from one character past the dot, which is where the caret is', () => {
      const at = MODEL.indexOf('userForm.alias') + 'userForm.'.length;

      expect(nodeMembersBefore(service, FILE, at).get('alias')).toBe('control');
    });

    it('has nothing to read when there is no room for a dot behind the caret', () => {
      expect(nodeMembersBefore(service, FILE, 1).size).toBe(0);
    });

    it('has nothing to say about a type with no members of that shape', () => {
      expect(nodeMembersAt(service, FILE, MODEL.indexOf('plain') + 2).size).toBe(0);
    });
  });

  describe('and every way the answer can be absent', () => {
    /** A language service whose program is whatever the test hands it. */
    const serviceOf = (program: unknown): ts.LanguageService =>
      ({ getProgram: () => program }) as unknown as ts.LanguageService;

    it('answers nothing when no TypeScript is mounted at all', () => {
      expect(nodesInScope(undefined, FILE, 0).size).toBe(0);
      expect(nodeMembersAt(undefined, FILE, 0).size).toBe(0);
    });

    it('answers nothing while the program is not built', () => {
      expect(nodesInScope(serviceOf(undefined), FILE, 0).size).toBe(0);
      expect(nodeMembersAt(serviceOf(undefined), FILE, 0).size).toBe(0);
    });

    it('answers nothing for a file the program does not have', () => {
      expect(nodesInScope(service, '/p/ghost.ts', 0).size).toBe(0);
      expect(nodeMembersAt(service, '/p/ghost.ts', 0).size).toBe(0);
    });

    it('answers nothing for an offset the projection never copied', () => {
      // `projectedOffset` has nothing to say about one, and the members are asked for what it
      // answered: the absence travels as the offset rather than as a branch at the call site.
      expect(nodeMembersAt(service, FILE, undefined).size).toBe(0);
    });
  });
});
