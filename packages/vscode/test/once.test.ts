/**
 * The at-most-once guard (SDD-25 §4.1).
 */

import { describe, expect, it } from 'vitest';
import { createOnce } from '../src/once.js';

describe('createOnce', () => {
  it('runs the first action and no later one', () => {
    const ran: string[] = [];
    const once = createOnce();

    once(() => ran.push('first'));
    once(() => ran.push('second'));

    expect(ran).toEqual(['first']);
  });

  it('is per guard, so two of them do not share a flag', () => {
    // The guard is created per activation and handed to the supervisor, which is what makes
    // three crashes produce one warning; two workspaces must still get one each.
    const ran: string[] = [];
    createOnce()(() => ran.push('a'));
    createOnce()(() => ran.push('b'));

    expect(ran).toEqual(['a', 'b']);
  });
});
