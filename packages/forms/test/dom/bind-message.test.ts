/**
 * @vitest-environment happy-dom
 *
 * BUG-42 §6.B, criterion 15 — the marker of a control that crosses into a control-component.
 */

import { describe, expect, it } from 'vitest';
import { bindMessage } from '../../src/dom/bind-message.js';
import { control, form, required } from '../../src/index.js';

describe('bindMessage (criterion 15)', () => {
  it('writes the message once the control is touched, and empties it when it is not', async () => {
    const f = form({ email: control('', [required], { messages: { required: () => 'Escribe tu email.' } }) });
    const slot = document.createElement('app-error');
    const off = bindMessage(slot, f.email);

    await f.email.validate();
    expect(slot.textContent).toBe('');
    f.email.touch();
    expect(slot.textContent).toBe('Escribe tu email.');
    f.$reset();
    expect(slot.textContent).toBe('');
    expect(slot.childNodes.length).toBe(0);

    off();
    f.email.touch();
    await f.email.validate();
    expect(slot.textContent).toBe('');
  });
});
