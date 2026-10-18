import { forbidden } from '@fudic/http';
import { Service } from '@fudic/di';

export interface User {
  readonly name: string;
}

/** Who each token is. A demo: the token IS the user's name, and only two are valid. */
const KNOWN: Readonly<Record<string, User>> = {
  ana: { name: 'Ana' },
  luis: { name: 'Luis' },
};

export class Tokens {
  verify(token: string): User {
    const user = KNOWN[token];
    if (user === undefined) throw forbidden('token desconocido');
    return user;
  }
}
Service(Tokens);
