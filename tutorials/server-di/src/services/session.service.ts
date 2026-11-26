import { inject, token } from '@fudic/di';

// The name the server publishes for each request: the browser builds its Session from it.
export const USER = token<string>('user');

// A component provides it with provide(): that component and the ones under it share one.
export class Session {
  readonly name = inject(USER, { optional: true }) ?? 'guest';
}
