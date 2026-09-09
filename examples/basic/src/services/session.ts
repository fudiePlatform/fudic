import { inject, Service, token } from '@fudic/di';

/**
 * The value one REQUEST publishes so the browser can build the same session from it.
 *
 * The name is the key of the `fud-di` block, and the block belongs to one response: two
 * requests in flight at the same time publish two different names under this one token, and
 * neither may ever see the other's.
 */
export const USER = token<string>('user');

/**
 * The session of the request being rendered, built from the published value on the server
 * and rebuilt from the seed in the browser. Never sent: what crosses is the name.
 */
export class Session {
  readonly name = inject(USER, { optional: true }) ?? 'anónimo';
}
Service(Session);
