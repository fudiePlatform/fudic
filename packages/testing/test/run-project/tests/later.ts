import { expect } from 'vitest';

// Not a test file: what it throws has no line of any test in its stack, since it throws from a
// timer of its own.

/** An assertion that says no, later. */
export function assertLater(): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        expect('late').toBe('on time');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** Code that throws, later. */
export function throwLater(): Promise<void> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new TypeError('nothing here')));
  });
}
