import { describe, expect, test } from 'vitest';
import { mount, shadowOf, type ShadowShape } from '@fudic/testing';
import * as AppForm from './app-form.fud';

// app-input is a control: its `ctrl` is a node of a form, not a value, and it always lives
// inside one. So it is tested where it lives, in app-form, by the two roads a shadow root is
// born by — the server's HTML, and a parent that builds it at runtime.

const INPUT: ShadowShape = {
  mode: 'open',
  delegatesFocus: true,
  clonable: false,
  serializable: false,
  referenceTarget: 'campo',
  // `theme` is the project's sheet (`fudic.json`), adopted by every component before its own.
  adoptedStyleSheets: ['theme', 'self'],
};

describe.each(['ssr', 'client'] as const)('app-input inside app-form, via %s', (via) => {
  test('each instance has the shadow root its template asks for', async () => {
    const t = await mount(AppForm, { via });
    const inputs = [...t.root.querySelectorAll('app-input')];
    expect(inputs.map((input) => input.id)).toEqual(['ali', 'email']);
    for (const input of inputs) expect(shadowOf(input)).toEqual(INPUT);
  });
});
