/**
 * `spread-target` (props-spec §5): `...item` goes on a component, where it hands over props,
 * or on a native element, where it writes attributes. It does not go on the component's own
 * host wrapper, nor on its `<template shadowrootmode>`: the first declares the component and
 * the second becomes its shadow root, and neither is an element the view writes attributes on.
 * A spread on either is `FUD0992`.
 *
 * A hyphenated tag the registry does not know is left alone: `FUD0191` already says the tag is
 * not a component, and that is the one fact to fix.
 */

import { FUD0992 } from '@fudic/diagnostics';
import { classifyAttribute } from '../../binding/index.js';
import type { Analyzer } from '../model.js';

export const spreadTarget: Analyzer = {
  name: 'spread-target',
  run(input, report) {
    const document = input.document;
    if (document.type !== 'component-document') return;
    for (const el of [document.host, document.template]) {
      for (const attr of el?.attributes ?? []) {
        if (classifyAttribute(attr, input.source).value.type === 'spread') report(FUD0992({ span: attr.span }));
      }
    }
  },
};
