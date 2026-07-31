/**
 * Which TypeScript the server typechecks with (SDD-24 §2, §6.1).
 *
 * The project's copy always wins. A server that checks with a different version than the build
 * produces diagnostics CI cannot reproduce, which is worse than no diagnostics: the user stops
 * trusting the ones that are right.
 *
 * If the client sent no usable `tsdk`, the bundled copy takes over — the LSP still works in a
 * project that never ran the scaffolding. If even that cannot be loaded, the server reports it
 * and carries on with HTML and CSS only: a dead server leaves the file with no colour and no
 * errors, which is the worst possible failure.
 */

import { createRequire } from 'node:module';
import { loadTsdkByPath } from '@volar/language-server/node.js';
import type * as ts from 'typescript';
import type { Logger } from './types.js';

/** The TypeScript module plus the localized messages that came with it. */
export interface TypeScriptSource {
  readonly typescript: typeof ts;
  readonly diagnosticMessages?: ts.MapLike<string>;
  /** Where it came from. `none` is the degraded mode of §6.1. */
  readonly origin: 'project' | 'bundled' | 'none';
}

/** The two ways of getting hold of TypeScript. Injected so the failures can be tested. */
export interface TsdkLoaders {
  fromPath(tsdk: string, locale: string | undefined): {
    typescript: typeof ts;
    diagnosticMessages: ts.MapLike<string> | undefined;
  };
  bundled(): typeof ts;
}

/** The real loaders: Volar's `tsdk` resolution, and the copy this package depends on. */
export const DEFAULT_LOADERS: TsdkLoaders = {
  fromPath: loadTsdkByPath,
  bundled: () => createRequire(import.meta.url)('typescript') as typeof ts,
};

/** Whatever TypeScript can be had, in order of preference. Never throws. */
export function loadTypeScript(
  tsdk: string,
  locale: string | undefined,
  logger: Logger,
  loaders: TsdkLoaders = DEFAULT_LOADERS,
): TypeScriptSource | { readonly origin: 'none' } {
  if (tsdk !== '') {
    try {
      const loaded = loaders.fromPath(tsdk, locale);
      return {
        typescript: loaded.typescript,
        ...(loaded.diagnosticMessages === undefined
          ? {}
          : { diagnosticMessages: loaded.diagnosticMessages }),
        origin: 'project',
      };
    } catch (cause) {
      logger.error(`Cannot load the project TypeScript from ${tsdk}`, cause);
    }
  }

  try {
    const typescript = loaders.bundled();
    logger.info('Using the bundled TypeScript: the client sent no usable tsdk');
    return { typescript, origin: 'bundled' };
  } catch (cause) {
    logger.error('No TypeScript at all: degrading to HTML and CSS', cause);
    return { origin: 'none' };
  }
}

/** Whether a load produced something to typecheck with. */
export function hasTypeScript(
  source: TypeScriptSource | { readonly origin: 'none' },
): source is TypeScriptSource {
  return source.origin !== 'none';
}
