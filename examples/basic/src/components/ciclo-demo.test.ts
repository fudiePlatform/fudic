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
  await mount(CicloDemo, { props: { name: 'uno' } });
  expect(said()).toEqual(['uno · beforeHydrate', 'uno · afterHydrate', 'uno · onConnect']);
});

test("via 'client': beforeCreate, afterCreate, onConnect — and nothing of hydrating", async () => {
  await mount(CicloDemo, { via: 'client', props: { name: 'dos' } });
  expect(said()).toEqual(['dos · beforeCreate', 'dos · afterCreate', 'dos · onConnect']);
});

test('unmount: onDisconnect at once, onDispose once it has settled', async () => {
  const t = await mount(CicloDemo, { props: { name: 'tres' } });
  clearRecord();
  t.unmount();
  expect(said()).toEqual(['tres · onDisconnect']);
  await t.settled();
  expect(said()).toEqual(['tres · onDisconnect', 'tres · onDispose']);
});

test('the prop state is reflected on the host, from the server and when created', async () => {
  const ssr = await mount(CicloDemo, { props: { name: 'a', state: 'active' } });
  expect(ssr.host.getAttribute('state')).toBe('active');
  const client = await mount(CicloDemo, { via: 'client', props: { name: 'b' } });
  expect(client.host.getAttribute('state')).toBe('inactive');
});
