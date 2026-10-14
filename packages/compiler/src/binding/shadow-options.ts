/**
 * The options of a component's shadow root that its author writes on the root `<template>`
 * (SDD-57 §6.9): `shadowrootdelegatesfocus`, `shadowrootclonable` and `shadowrootserializable`.
 *
 * The server writes them on the template the parser reads, and the client opens the same shadow
 * root with them when it creates the component at runtime: one reading, both roads. A
 * form-associated component delegates focus whether its author writes it or not (SDD-34 §4.5);
 * that is the emit's to add, not this reading's.
 */

import type { ElementNode } from '../html/index.js';

export interface ShadowOptions {
  readonly delegatesFocus: boolean;
  readonly clonable: boolean;
  readonly serializable: boolean;
}

function has(template: ElementNode, name: string): boolean {
  return template.attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);
}

/** What the root `<template>` asks of the shadow root it declares. */
export function shadowOptionsOf(template: ElementNode): ShadowOptions {
  return {
    delegatesFocus: has(template, 'shadowrootdelegatesfocus'),
    clonable: has(template, 'shadowrootclonable'),
    serializable: has(template, 'shadowrootserializable'),
  };
}
