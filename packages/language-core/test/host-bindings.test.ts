/**
 * BUG-32 — the identity tag is projected too.
 *
 * `templateContent` used to return only `doc.template?.children`, so the component's own tag
 * was outside the projection entirely: `<app-host |>` answered "no suggestions", and an
 * attribute or an `@event` written there was checked against nothing at all.
 *
 * What goes out for it is narrower than for any other tag, and each exclusion has a reason:
 * HTML's own vocabulary (`$attrs<{}>`) because that is what the host takes, the gap anchors
 * (`$gap<{}>`) because that is where completion happens, and the events — but no props,
 * since nobody passes props to the component itself, and no classes, since a `class:` there
 * is FUD0720.
 */
import { describe, expect, it } from 'vitest';
import { emitClient, registryOf } from './_support.js';

const registry = registryOf({ 'app-badge': './app-badge.fud' });

/** A component whose identity tag carries `attrs` and whose shadow holds `markup`. */
const project = (attrs: string, markup = '<p>hi</p>'): string =>
  emitClient(
    `<app-host ${attrs}>\n  <template shadowrootmode="open">\n    ${markup}\n  </template>\n</app-host>\n`,
    'x.fud',
    registry,
  ).text;

/** The head of `$tpl`: everything the host contributes, before the template's own content. */
const hostPart = (text: string): string => text.slice(text.indexOf('function $tpl()'));

describe('the identity tag reaches the projection at all', () => {
  it('opens `$tpl` with the host’s literals, before the template content', () => {
    const text = project('');
    const head = hostPart(text);
    expect(head).toContain('$attrs<{}>(');
    expect(head).toContain('$gap<{}>(');
    // Before the content: the host is the first thing inside `$tpl`.
    expect(head.indexOf('$attrs<{}>(')).toBeLessThan(head.indexOf('}'));
  });

  it('emits the gap literal even on a bare tag, which is what `<app-host |>` needs', () => {
    // Without it the editor had nowhere to anchor completion and answered "no suggestions".
    expect(project('')).toContain('$gap<{}>({');
  });
});

describe('what the host’s literal accepts', () => {
  it('sends a plain attribute to HTML’s own vocabulary', () => {
    expect(project('role="group"')).toContain('role: "group",');
  });

  it('sends an interpolated attribute through with its expression intact', () => {
    // Quoted, because `data-state` is not a bare identifier — the literal keeps the name the
    // author wrote rather than a camel-cased invention of the emitter.
    expect(project('data-state="@(mode)"')).toContain(`'data-state': (mode),`);
  });

  it('projects an `@event` on the host, so the handler is checked', () => {
    const text = project('@click="@(toggle())"');
    expect(text).toContain('toggle()');
  });
});

describe('what it deliberately leaves out', () => {
  it('no props literal: nobody passes props to the component itself', () => {
    // `$props<$C…>` is the CHILD contract. The host is this file, and a contract against
    // itself would be asking the author to satisfy their own declaration twice.
    const head = hostPart(project(''));
    expect(head.slice(0, head.indexOf('$attrs<{}>(') + 40)).not.toContain('$props<');
  });

  it('a child component inside the shadow still gets its own contract', () => {
    // The narrowing is about the HOST, not about the file: the badge below is projected the
    // way it always was.
    const text = project('', '<app-badge .tone="@(t)"></app-badge>');
    expect(text).toContain('$props<$C0>(');
    expect(text).toContain('tone: (t),');
  });

  it('the host’s literal is `{}` — HTML’s vocabulary, not this component’s contract', () => {
    expect(hostPart(project('role="group"'))).toContain('$attrs<{}>({');
  });
});
