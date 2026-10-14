import { provide, token } from '@fudic/di';

export const GREETING = token<string>('greeting');

provide(GREETING, () => 'from the real service');
