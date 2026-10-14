import { Service } from '@fudic/di';

/** The data a middleware's server half reads, registered at the top level, as `@Service` does. */
export class Tokens {
  verify(token: string): string {
    return token === 'good' ? 'ana' : 'nobody';
  }
}

Service(Tokens);
