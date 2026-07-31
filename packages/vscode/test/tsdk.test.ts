/**
 * Choosing the TypeScript the server typechecks with (SDD-25 §4.1, criterion 9).
 *
 * The order is the contract, and the degraded state is not "no TypeScript" but "not the
 * project's TypeScript" — see the note in `src/tsdk.ts`. Both halves are asserted here
 * because the difference is exactly what criterion 9 asks a person to look at.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { degradedMessage, resolveTsdk } from '../src/tsdk.js';
import type { FileSystemPort } from '../src/ports.js';

const fsWith = (...dirs: readonly string[]): FileSystemPort => {
  const files = dirs.map((dir) => join(dir, 'typescript.js'));
  return { exists: (path) => files.includes(path) };
};

const PROJECT = join('/work', 'app');
const PROJECT_TSDK = join(PROJECT, 'node_modules', 'typescript', 'lib');
const VSCODE_TSDK = join('/vscode', 'extensions', 'node_modules', 'typescript', 'lib');

describe('resolveTsdk', () => {
  it('prefers an absolute typescript.tsdk', () => {
    const resolved = resolveTsdk({
      configured: '/custom/lib',
      folders: [PROJECT],
      vscodeTsdk: VSCODE_TSDK,
      fs: fsWith('/custom/lib', PROJECT_TSDK, VSCODE_TSDK),
    });

    expect(resolved).toEqual({ path: '/custom/lib', source: 'setting', degraded: false });
  });

  it('resolves a relative typescript.tsdk against the workspace folders', () => {
    // `node_modules/typescript/lib` is what the setting says in nearly every project that
    // sets it at all, and it is relative.
    const resolved = resolveTsdk({
      configured: 'node_modules/typescript/lib',
      folders: ['/other', PROJECT],
      vscodeTsdk: VSCODE_TSDK,
      fs: fsWith(PROJECT_TSDK, VSCODE_TSDK),
    });

    expect(resolved.path).toBe(PROJECT_TSDK);
    expect(resolved.source).toBe('setting');
  });

  it('falls through when the setting points nowhere', () => {
    const resolved = resolveTsdk({
      configured: '/custom/lib',
      folders: [PROJECT],
      vscodeTsdk: VSCODE_TSDK,
      fs: fsWith(PROJECT_TSDK, VSCODE_TSDK),
    });

    expect(resolved.source).toBe('workspace');
    expect(resolved.path).toBe(PROJECT_TSDK);
  });

  it('falls through when a relative setting matches no folder', () => {
    const resolved = resolveTsdk({
      configured: 'vendor/ts',
      folders: [PROJECT],
      vscodeTsdk: VSCODE_TSDK,
      fs: fsWith(VSCODE_TSDK),
    });

    expect(resolved.source).toBe('vscode');
  });

  it.each([
    ['not a string', 7],
    ['blank', '   '],
    ['absent', undefined],
  ])('ignores a typescript.tsdk that is %s', (_name, configured) => {
    const resolved = resolveTsdk({
      configured,
      folders: [PROJECT],
      vscodeTsdk: VSCODE_TSDK,
      fs: fsWith(PROJECT_TSDK),
    });

    expect(resolved.source).toBe('workspace');
  });

  it("uses VS Code's own TypeScript last, and calls that degraded", () => {
    // It works — the server starts and types resolve — but not against the version the
    // build uses, which is the one §5 says has to win. Saying so is the difference between
    // a puzzling diagnostic and an obvious one.
    const resolved = resolveTsdk({
      configured: undefined,
      folders: [PROJECT],
      vscodeTsdk: VSCODE_TSDK,
      fs: fsWith(VSCODE_TSDK),
    });

    expect(resolved).toEqual({ path: VSCODE_TSDK, source: 'vscode', degraded: true });
  });

  it('degrades to nothing at all rather than throwing', () => {
    // Criterion 9. There is no TypeScript anywhere; the extension still has to come up.
    const resolved = resolveTsdk({
      configured: undefined,
      folders: [],
      vscodeTsdk: null,
      fs: fsWith(),
    });

    expect(resolved).toEqual({ path: '', source: 'none', degraded: true });
  });

  it('ignores a VS Code tsdk path that is not really one', () => {
    const resolved = resolveTsdk({
      configured: undefined,
      folders: [],
      vscodeTsdk: VSCODE_TSDK,
      fs: fsWith(),
    });

    expect(resolved.source).toBe('none');
  });
});

describe('degradedMessage', () => {
  it('distinguishes running on the wrong TypeScript from running on none', () => {
    expect(degradedMessage('vscode')).toContain("VS Code's");
    expect(degradedMessage('none')).toContain('HTML and CSS keep working');
  });
});
