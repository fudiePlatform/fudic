import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiCommand from './ui-command.fud';

test('shows the command on a button that names it', async () => {
  const t = await mount(UiCommand, { props: { command: 'npx @fudic/cli new mi-app' } });
  const button = t.getByRole('button', { name: 'npx @fudic/cli new mi-app Copiar' });
  expect(button).toHaveTextContent('npx @fudic/cli new mi-app');
  expect(button).toHaveTextContent('Copiar');
});
