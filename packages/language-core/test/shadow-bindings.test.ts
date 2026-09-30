/**
 * SDD-47 §4.5 — the `<template shadowrootmode>`'s events are projected.
 *
 * They listen on the shadow root, and they go through the same `$on` as the host's, so the
 * editor completes and checks them alike. What the template does NOT send is its own
 * attributes: `shadowrootmode` and `shadowrootadoptedstylesheets` are the DSD's, and checking
 * them against HTML's vocabulary would underline every component of the project.
 */
import { describe, expect, it } from 'vitest';
import { emitClient, registryOf } from './_support.js';

/** A component whose `<template>` carries `attrs`, and the projection of `$tpl`. */
const tpl = (attrs: string): string => {
  const text = emitClient(
    `<app-host>\n  <template shadowrootmode="open" shadowrootadoptedstylesheets="panel" ${attrs}>\n    <p>hi</p>\n  </template>\n</app-host>\n`,
    'x.fud',
    registryOf({}),
  ).text;
  return text.slice(text.indexOf('function $tpl()'));
};

describe('criterion 10 — what the template projects', () => {
  it('an event, through `$on` with its handler', () => {
    expect(tpl('@click=@onClick')).toContain("$on('click', onClick);");
  });

  it('a call with values, with `$event` in it', () => {
    expect(tpl('@click=@note("shadow", $event)')).toContain('note("shadow", $event)');
  });

  it('a custom event, given up on its type like anywhere else', () => {
    expect(tpl('@aviso-dentro=@onClick')).toContain("$on('aviso-dentro' as never, onClick);");
  });

  it('a `bus:` subscription, the host’s twin', () => {
    expect(tpl('bus:carrito=@onClick')).toContain("$on('carrito' as never, onClick);");
  });

  it('an `@` still being written, so the editor has a place to ask from', () => {
    expect(tpl('@')).toContain("$on(' ');");
  });

  it('none of the DSD’s own attributes', () => {
    const text = tpl('');
    expect(text).not.toContain('shadowrootmode');
    expect(text).not.toContain('shadowrootadoptedstylesheets');
  });

  it('nothing for an attribute of the author’s that is not an event', () => {
    // The template is not an element of the output: a plain attribute there lands nowhere,
    // so there is nothing to check it against.
    expect(tpl('data-x="1"')).not.toContain('data-x');
  });
});
