import { expect, test, vi } from 'vitest';
import { login } from 'fudic:routes/index';

vi.mock('../server/status', () => ({ isClosed: () => true }));

test('while the app is closed, every function answers 503, even login', async () => {
  await expect(login({ user: 'ana' })).rejects.toMatchObject({ status: 503, message: 'Back in five minutes.' });
});
