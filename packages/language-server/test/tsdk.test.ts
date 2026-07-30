/**
 * Which TypeScript the server uses (SDD-24 §2, §6.1).
 *
 * The order is the contract: the project's copy, then the bundled one, then nothing — and the
 * last case must still leave a server running, because a dead server leaves the file with no
 * colour and no errors.
 */

import { describe, expect, it } from 'vitest';
import type * as ts from 'typescript';
import { hasTypeScript, loadTypeScript, DEFAULT_LOADERS, type TsdkLoaders } from '../src/tsdk.js';
import type { Logger } from '../src/types.js';

const PROJECT = { version: 'project' } as unknown as typeof ts;
const BUNDLED = { version: 'bundled' } as unknown as typeof ts;

function recorder(): Logger & { info: (m: string) => void; readonly lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (message) => lines.push(`info: ${message}`),
    error: (message) => lines.push(`error: ${message}`),
  };
}

const loaders = (over: Partial<TsdkLoaders> = {}): TsdkLoaders => ({
  fromPath: () => ({ typescript: PROJECT, diagnosticMessages: { a: 'b' } }),
  bundled: () => BUNDLED,
  ...over,
});

describe('loadTypeScript', () => {
  it('prefers the project copy, messages included', () => {
    const log = recorder();
    const source = loadTypeScript('/p/node_modules/typescript/lib', 'es', log, loaders());

    expect(source).toEqual({
      typescript: PROJECT,
      diagnosticMessages: { a: 'b' },
      origin: 'project',
    });
    expect(log.lines).toEqual([]);
  });

  it('omits the messages when the tsdk shipped none', () => {
    const source = loadTypeScript(
      '/tsdk',
      undefined,
      recorder(),
      loaders({ fromPath: () => ({ typescript: PROJECT, diagnosticMessages: undefined }) }),
    );

    expect(source).toEqual({ typescript: PROJECT, origin: 'project' });
    expect('diagnosticMessages' in source).toBe(false);
  });

  it('falls back to the bundled copy when the tsdk is empty, and says so', () => {
    const log = recorder();
    const source = loadTypeScript('', undefined, log, loaders());

    expect(source).toEqual({ typescript: BUNDLED, origin: 'bundled' });
    expect(log.lines).toEqual(['info: Using the bundled TypeScript: the client sent no usable tsdk']);
  });

  it('falls back when the tsdk cannot be loaded, and logs the reason', () => {
    const log = recorder();
    const source = loadTypeScript(
      '/broken',
      undefined,
      log,
      loaders({
        fromPath: () => {
          throw new Error('nope');
        },
      }),
    );

    expect(source.origin).toBe('bundled');
    expect(log.lines[0]).toBe('error: Cannot load the project TypeScript from /broken');
  });

  it('degrades to nothing at all rather than dying (§6.1)', () => {
    const log = recorder();
    const source = loadTypeScript(
      '',
      undefined,
      log,
      loaders({
        bundled: () => {
          throw new Error('no typescript here');
        },
      }),
    );

    expect(source).toEqual({ origin: 'none' });
    expect(log.lines).toEqual(['error: No TypeScript at all: degrading to HTML and CSS']);
  });
});

describe('hasTypeScript', () => {
  it('separates the degraded mode from every other outcome', () => {
    expect(hasTypeScript({ origin: 'none' })).toBe(false);
    expect(hasTypeScript({ typescript: BUNDLED, origin: 'bundled' })).toBe(true);
  });
});

describe('DEFAULT_LOADERS', () => {
  it('really does load the TypeScript this package depends on', () => {
    const typescript = DEFAULT_LOADERS.bundled();

    expect(typeof typescript.createLanguageService).toBe('function');
    expect(typescript.version).toMatch(/^5\.9\./);
  });
});
