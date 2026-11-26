import { expect, test } from 'vitest';
import { createRoot, injectFrom, provideIn } from '@fudic/di';
import { Session } from './session.service';

test('takes its name from what the server published', () => {
  const root = createRoot({ user: 'Ana' });
  provideIn(root, Session, () => new Session());
  expect(injectFrom(root, Session).name).toBe('Ana');
});

test('is a guest when nothing was published', () => {
  const root = createRoot();
  provideIn(root, Session, () => new Session());
  expect(injectFrom(root, Session).name).toBe('guest');
});
