/**
 * SDD-64 §3.1: a `FilePosition` is the place a report names, written the way an editor and a
 * terminal link it: `file:line:column`, 1-based, the path as given.
 */

import { describe, expect, it } from 'vitest';
import { formatPosition, type FilePosition } from '../src/index.js';

describe('formatPosition', () => {
  it('writes file, line and column joined by colons', () => {
    const at: FilePosition = { file: 'src/components/acme-button/acme-button.fud', line: 22, column: 3 };
    expect(formatPosition(at)).toBe('src/components/acme-button/acme-button.fud:22:3');
  });

  it('keeps a path outside the project as it comes', () => {
    expect(formatPosition({ file: '../../libs/ui/src/components/ui-card/ui-card.fud', line: 1, column: 1 })).toBe(
      '../../libs/ui/src/components/ui-card/ui-card.fud:1:1',
    );
  });
});
