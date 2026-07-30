/**
 * The entry point (SDD-25 §4.1, §5).
 *
 * There is almost nothing here yet, and that is the point: a package that starts at 100 %
 * needs something to measure from its first commit, and the shape of the entry point — two
 * exported functions, no host required to call them — is what the later phases hang off.
 */

import { describe, expect, it } from 'vitest';
import { activate, deactivate } from '../src/extension.js';
import type { ExtensionContext } from 'vscode';

describe('activate', () => {
  it('is callable without an extension host', () => {
    // The context is never read yet; the cast is the seam the ports will replace.
    expect(() => activate({} as ExtensionContext)).not.toThrow();
  });
});

describe('deactivate', () => {
  it('is callable when the extension was never activated', () => {
    // VS Code calls it on shutdown regardless of how activation went, so it has to be
    // safe on an extension that failed to start.
    expect(() => deactivate()).not.toThrow();
  });
});
