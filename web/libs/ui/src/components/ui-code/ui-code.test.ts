import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiCode from './ui-code.fud';

test('renders a copy button and no file name by default', async () => {
  const t = await mount(UiCode);
  expect(t.getByRole('button', { name: 'Copiar' })).toBeInTheDocument();
  expect(t.query('.path')).toBeNull();
});

test('shows the file the code belongs to', async () => {
  const t = await mount(UiCode, { props: { path: 'src/routes/index.fud' } });
  expect(t.getByText('src/routes/index.fud')).toBeInTheDocument();
});
