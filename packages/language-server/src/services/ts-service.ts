/**
 * The TypeScript language service of the project, reached the one way Volar allows.
 *
 * A plugin is handed its own reply and never another's, so the program is reached through what
 * the TypeScript service PUBLISHES rather than by mounting a second one. It lives in a module
 * of its own because two services now ask for it — the root plugin, for the card and the
 * repairs, and the completion decorator, for the shape of a `control` — and a helper reached by
 * importing a thousand-line neighbour is an import cycle waiting to be written.
 *
 * Nothing when TypeScript failed to load (SDD-24 §6.1), which is the same absence as a program
 * that has not been built yet: every caller degrades to the answer it had before it asked.
 */

import type { LanguageServiceContext } from '@volar/language-service';
import type * as ts from 'typescript';

/** What `volar-service-typescript` publishes for whoever needs the program itself. */
interface TypeScriptProvide {
  readonly 'typescript/languageService': () => ts.LanguageService;
}

export function typeScriptService(context: LanguageServiceContext): ts.LanguageService | undefined {
  return context.inject<TypeScriptProvide>('typescript/languageService');
}
