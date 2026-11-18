import { beforeEach, expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as CicloDemo from './ciclo-demo.fud';
import { clearRecord, record } from '../store/ciclo.js';

// SDD-86, criterion 13: `mount` runs the hooks of hydrating (`via: 'ssr'`) or of creating
// (`via: 'client'`), and `unmount` the ones of leaving. Every hook of `ciclo-demo` writes itself
// down in the page's record, so the record is the order they ran in.

const said = (): string[] => record().map((e) => e.text);

beforeEach(() => {
  clearRecord();
});

test("via 'ssr': beforeHydrate, afterHydrate, onConnect — and nothing of creating", async () => {
  await mount(CicloDemo, { props: { nombre: 'uno' } });
  expect(said()).toEqual(['uno · beforeHydrate', 'uno · afterHydrate', 'uno · onConnect']);
});

test("via 'client': beforeCreate, afterCreate, onConnect — and nothing of hydrating", async () => {
  await mount(CicloDemo, { via: 'client', props: { nombre: 'dos' } });
  expect(said()).toEqual(['dos · beforeCreate', 'dos · afterCreate', 'dos · onConnect']);
});

test('unmount: onDisconnect at once, onDispose once it has settled', async () => {
  const t = await mount(CicloDemo, { props: { nombre: 'tres' } });
  clearRecord();
  t.unmount();
  expect(said()).toEqual(['tres · onDisconnect']);
  await t.settled();
  expect(said()).toEqual(['tres · onDisconnect', 'tres · onDispose']);
});

test('the prop estado is reflected on the host, from the server and when created', async () => {
  const ssr = await mount(CicloDemo, { props: { nombre: 'a', estado: 'activo' } });
  expect(ssr.host.getAttribute('estado')).toBe('activo');
  const client = await mount(CicloDemo, { via: 'client', props: { nombre: 'b' } });
  expect(client.host.getAttribute('estado')).toBe('inactivo');
});
