import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiNote from './ui-note.fud';

test('renders a note by default', async () => {
  const t = await mount(UiNote);
  expect(t.host).toHaveAttribute('role', 'note');
  expect(t.host).toHaveAttribute('kind', 'note');
  expect(t.getByText('Nota')).toBeInTheDocument();
});

test('labels a tip', async () => {
  const t = await mount(UiNote, { props: { kind: 'tip' } });
  expect(t.host).toHaveAttribute('kind', 'tip');
  expect(t.getByText('Consejo')).toBeInTheDocument();
});

test('labels something important', async () => {
  const t = await mount(UiNote, { props: { kind: 'important' } });
  expect(t.host).toHaveAttribute('kind', 'important');
  expect(t.getByText('Importante')).toBeInTheDocument();
});
