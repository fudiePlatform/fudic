import { provide, token } from '@fudic/di';

export const NOW = token<string>('now');

provide(NOW, () => 'the real clock');
