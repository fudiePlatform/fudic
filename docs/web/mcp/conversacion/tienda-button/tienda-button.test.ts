import { describe, expect, test } from 'vitest';
import { mount, shadowOf } from '@fudic/testing';
import * as TiendaButton from './tienda-button.fud';

// Lo que el usuario no ve y no aprueba: el tipo del botón de dentro, cómo se anuncia el trabajo
// en marcha y cómo está creado el shadow root. Lo que se ve y se toca está en el .fudspec.

describe.each(['ssr', 'client'] as const)('via %s', (via) => {
  test('el shadow root entrega el foco al botón de dentro y adopta su hoja', async () => {
    const t = await mount(TiendaButton, { via });
    expect(shadowOf(t.host)).toEqual({
      mode: 'open',
      delegatesFocus: true,
      clonable: false,
      serializable: false,
      referenceTarget: null,
      adoptedStyleSheets: ['base', 'button', 'self'],
    });
  });
});

test('por defecto no envía el formulario en el que está', async () => {
  const t = await mount(TiendaButton);
  expect(t.query('button')).not.toBeNull();
  expect(t.query('button')).toHaveAttribute('type', 'button');
});

test('con type submit, envía el formulario en el que está', async () => {
  const t = await mount(TiendaButton, { props: { type: 'submit' } });
  expect(t.query('button')).not.toBeNull();
  expect(t.query('button')).toHaveAttribute('type', 'submit');
});

test('sin stock, el botón de dentro está deshabilitado', async () => {
  const t = await mount(TiendaButton, { props: { disabled: true } });
  expect(t.query('button')).not.toBeNull();
  expect(t.query('button')).toBeDisabled();
});

test('sin stock, un clic no sale del componente', async () => {
  const t = await mount(TiendaButton, { props: { disabled: true } });
  expect(t.query('button')).not.toBeNull();
  let clicks = 0;
  const count = () => {
    clicks += 1;
  };
  t.host.addEventListener('click', count);
  try {
    await t.click(t.query('button')!);
  } finally {
    t.host.removeEventListener('click', count);
  }
  expect(clicks).toBe(0);
});

test('mientras trabaja, no se puede pulsar y lo anuncia', async () => {
  const t = await mount(TiendaButton, { props: { busy: true } });
  expect(t.query('button')).not.toBeNull();
  expect(t.query('button')).toBeDisabled();
  expect(t.query('button')).toHaveAttribute('aria-busy', 'true');
});

test('en reposo no anuncia trabajo ni pone indicador', async () => {
  const t = await mount(TiendaButton);
  expect(t.query('button')).not.toBeNull();
  expect(t.query('[role="progressbar"]')).toBeNull();
  expect(t.query('button')).not.toHaveAttribute('aria-busy');
});
