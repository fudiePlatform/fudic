import { forbidden } from '@fudic/http';
import { Service } from '@fudic/di';

export interface User {
  readonly name: string;
}

/** The cookie the session travels in: `HttpOnly`, so no script of the page reads it. */
export const SESSION_COOKIE = 'fudic-session';

/** Who each session is. A demo: the session IS the user's name, and only two are valid. */
const KNOWN: Readonly<Record<string, User>> = {
  ana: { name: 'Ana' },
  luis: { name: 'Luis' },
};

export class Sessions {
  verify(session: string): User {
    const user = KNOWN[session];
    if (user === undefined) throw forbidden('sesión desconocida');
    return user;
  }

  /** Who the session is, or `undefined` for none or one nobody knows. */
  find(session: string | undefined): User | undefined {
    return session === undefined ? undefined : KNOWN[session];
  }
}
Service(Sessions);
