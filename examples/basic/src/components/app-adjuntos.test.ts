import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import { adjuntosForm } from 'fudic:components/app-adjuntos';
import * as AppAdjuntos from './app-adjuntos.fud';

/** A document of `size` bytes. */
const doc = (name: string, size: number): File => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

test('SDD-81 criterion 32: four files with max-length 3 say so, and nothing is sent', async () => {
  adjuntosForm.$reset();
  const t = await mount(AppAdjuntos);
  await t.upload(t.getByLabelText('Documentos'), [doc('a.pdf', 1), doc('b.pdf', 1), doc('c.pdf', 1), doc('d.pdf', 1)]);
  expect(t.errorOf('Documentos')).toBe('Como mucho 3 ficheros.');
  await t.submit();
  expect(t.query('.aviso')?.textContent).toBe('');
});

test('SDD-81 §4.5: what arrived, as the server saw it', async () => {
  adjuntosForm.$reset();
  const t = await mount(AppAdjuntos);
  await t.submit();
  expect(t.errorOf('Documentos')).toBe('Elige al menos un fichero.');
  await t.upload(t.getByLabelText('Documentos'), [doc('a.pdf', 10), doc('b.pdf', 20)]);
  await t.submit();
  expect(t.query('.aviso')?.textContent).toBe('Llegaron 2 (30 bytes): a.pdf, b.pdf.');
  expect(adjuntosForm.docs()).toEqual([]);
});
