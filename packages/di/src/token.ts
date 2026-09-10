import type { Token } from './types.js';

/**
 * A token for a value that is not a class. Identity is the object and never the name:
 * `token('x') !== token('x')`, and the name exists so an error can say what was missing.
 */
export function token<T>(name: string): Token<T> {
  return { name };
}
