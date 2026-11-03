/**
 * SDD-62 §4.5, criteria 11–14 — the React reflexes an LLM brings, each with its own code.
 *
 * `className`/`htmlFor` are `FUD1160` on the name; a `{…}` value is `FUD1161` instead of
 * `FUD0056`; JSX in the markup is `FUD1162`, a warning, except where code is shown; and `props`
 * and `children` read in the view are `FUD0907` with a reason that says what fudic does instead.
 */

import { describe, expect, it } from 'vitest';
import { atConstructs } from '../../src/constructs.js';
import { parseDocument } from '../../src/html/index.js';
import { viewDiagnostics } from './_view.js';

const component = (inner: string): string =>
  `<app-test>\n  <template shadowrootmode="open">${inner}</template>\n</app-test>\n`;

/** Every diagnostic, parse and semantic, as `CODE text-under-it`. */
function said(inner: string): readonly string[] {
  const source = component(inner);
  const parsed = parseDocument(source, { atConstructs }).diagnostics;
  return [...parsed, ...viewDiagnostics(source)].map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);
}

describe('FUD1160 — React’s attribute names (criterion 11)', () => {
  it('className and htmlFor, on the name', () => {
    expect(said('<div className="card"></div>')).toEqual(['FUD1160 className']);
    expect(said('<label htmlFor="email"></label>')).toEqual(['FUD1160 htmlFor']);
  });

  it('in any case, and on a component, whose prop would be .className', () => {
    expect(said('<div CLASSNAME="card"></div>')).toEqual(['FUD1160 CLASSNAME']);
    expect(said('<app-card className="card"></app-card>')).toEqual(['FUD1160 className']);
  });

  it('says which HTML name to write', () => {
    const source = component('<label htmlFor="email"></label>');
    const [diagnostic] = viewDiagnostics(source);
    expect(diagnostic?.message).toContain('for');
  });

  it('the HTML names themselves are fine', () => {
    expect(said('<label class="card" for="email"></label>')).toEqual([]);
  });
});

describe('FUD1161 — a JSX expression as a value (criterion 12)', () => {
  it('onClick={save} is FUD0909 on the name and FUD1161 on the value, never FUD0056', () => {
    expect([...said('<button onClick={save}>Save</button>')].sort()).toEqual(['FUD0909 onClick', 'FUD1161 {save}']);
  });

  it('a bare value that is not in braces is still FUD0056', () => {
    expect(said('<div title=hello></div>')).toEqual(['FUD0056 hello']);
  });
});

describe('FUD1162 — JSX in the markup (criterion 13)', () => {
  it('a .map loop and an && condition, from the { to its }', () => {
    expect(said('<ul>{items.map(i => <li>{i}</li>)}</ul>')).toEqual(['FUD1162 {items.map(i => <li>{i}</li>)}']);
    expect(said('<div>{open && <p>Hi</p>}</div>')).toEqual(['FUD1162 {open && <p>Hi</p>}']);
  });

  it('is a warning', () => {
    const [diagnostic] = viewDiagnostics(component('<div>{open && <p>Hi</p>}</div>'));
    expect(diagnostic?.severity).toBe('warning');
  });

  it('nothing inside <code> or <pre>, however deep', () => {
    expect(said('<code>{items.map(i => <li>{i}</li>)}</code>')).toEqual([]);
    expect(said('<pre>{open && <p>Hi</p>}</pre>')).toEqual([]);
    expect(said('<pre><code><b>{open && <i>Hi</i>}</b></code></pre>')).toEqual([]);
  });

  it('nothing for braces that hold no loop or condition', () => {
    expect(said('<p>{ name }</p>')).toEqual([]);
  });

  it('nothing for a { that never closes', () => {
    expect(said('<p>{items.map(i => i</p>')).toEqual([]);
  });

  it('what one report covers is not reported again', () => {
    expect(said('<ul>{items.map(i => <li>x</li>) && {y}}</ul>')).toEqual([
      'FUD1162 {items.map(i => <li>x</li>) && {y}}',
    ]);
  });

  it('two in one element, each on its own', () => {
    expect(said('<div>{a && <b>x</b>} and {c && <i>y</i>}</div>')).toEqual([
      'FUD1162 {a && <b>x</b>}',
      'FUD1162 {c && <i>y</i>}',
    ]);
  });
});

describe('FUD0907 — props and children read in the view (criterion 14)', () => {
  it('@props.title says that props is a function in @code', () => {
    const [diagnostic] = viewDiagnostics(component('<h1>@props.title</h1>'));
    expect(diagnostic?.code).toBe('FUD0907');
    expect(diagnostic?.message).toContain('`props` is a function in `@code`: read the destructured name');
  });

  it('@children says to use a <slot>', () => {
    const [diagnostic] = viewDiagnostics(component('<div>@children</div>'));
    expect(diagnostic?.code).toBe('FUD0907');
    expect(diagnostic?.message).toContain('use a `<slot>` for the content between the tags');
  });

  it('any other unknown name keeps the general reason', () => {
    const [diagnostic] = viewDiagnostics(component('<div>@nope</div>'));
    expect(diagnostic?.message).toContain('the only global is `undefined`');
  });
});
