/**
 * The `VirtualCode` tree Volar routes requests through (SDD-24 §4.1).
 *
 * One root per `.fud` — the file as the editor sees it — with one embedded code per language
 * region: the client TypeScript, the server TypeScript, and one CSS per `<style>`. Volar owns
 * the routing; what this module owns is the shape it routes over, which is the projection of
 * SDD-23 plus the mapping table translated in `mappings.ts`.
 *
 * The client and the server codes are FIELDS, not lookups. SDD-23 emits both for every
 * document — the server virtual is emitted even when empty, because `typeof import(…)` over a
 * global script is not the same type — so making them optional would spread a "what if it is
 * missing" branch into every consumer. If a future projection stops emitting one, this module
 * substitutes an empty code and the server keeps working instead of dying.
 *
 * The parsed document travels attached to the root: the server's own services — `href`,
 * sections, semantic tokens, the `$` rule — work on the AST, not on the virtual text, and
 * re-parsing to find it again would defeat the cache.
 */

import type { IScriptSnapshot, VirtualCode } from '@volar/language-core';
import type { VirtualFile } from '@fudic/language-core';
import type { CachedDocument } from './document-cache.js';
import { identityMapping, toCodeMappings } from './mappings.js';

/** The `languageId` a `.fud` is registered under. */
export const FUD_LANGUAGE_ID = 'fud';

/** Embedded code ids. Stable strings: Volar uses them as map keys across updates. */
export const ROOT_CODE_ID = 'root';
export const CLIENT_CODE_ID = 'client_ts';
export const SERVER_CODE_ID = 'server_ts';
export const styleCodeId = (index: number): string => `style_${index}`;

/** The root code of a `.fud`, with the parse it was built from. */
export interface FudicVirtualCode extends VirtualCode {
  readonly document: CachedDocument;
  /** The projection TypeScript treats as this file's script. */
  readonly client: VirtualCode;
  /** The `@server` region as a file of its own. */
  readonly server: VirtualCode;
  /** One per `<style>`, in source order. */
  readonly styles: readonly VirtualCode[];
}

/** A snapshot over a string. Volar and TypeScript both consume this shape. */
export function snapshotOf(text: string): IScriptSnapshot {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

/** One virtual file of SDD-23 as one embedded code. */
function embeddedCode(id: string, virtual: VirtualFile): VirtualCode {
  return {
    id,
    languageId: virtual.languageId,
    snapshot: snapshotOf(virtual.text),
    mappings: toCodeMappings(virtual.mappings),
  };
}

/** The stand-in for a projection that was not emitted. Empty, mapped to nothing. */
function emptyCode(id: string, languageId: string): VirtualCode {
  return { id, languageId, snapshot: snapshotOf(''), mappings: [] };
}

/** The three kinds of projection, sorted out by what SDD-23 named them. */
function sortVirtuals(document: CachedDocument): {
  client: VirtualCode;
  server: VirtualCode;
  styles: VirtualCode[];
} {
  let client: VirtualCode | undefined;
  let server: VirtualCode | undefined;
  const styles: VirtualCode[] = [];

  for (const virtual of document.virtuals) {
    if (virtual.languageId === 'css') {
      styles.push(embeddedCode(styleCodeId(styles.length), virtual));
    } else if (virtual.fileName.endsWith('.server.ts')) {
      server = embeddedCode(SERVER_CODE_ID, virtual);
    } else {
      client = embeddedCode(CLIENT_CODE_ID, virtual);
    }
  }

  return {
    client: client ?? emptyCode(CLIENT_CODE_ID, 'typescript'),
    server: server ?? emptyCode(SERVER_CODE_ID, 'typescript'),
    styles,
  };
}

/** The root virtual code of a `.fud`. */
export function createFudicVirtualCode(document: CachedDocument): FudicVirtualCode {
  const { client, server, styles } = sortVirtuals(document);

  return {
    id: ROOT_CODE_ID,
    languageId: FUD_LANGUAGE_ID,
    snapshot: snapshotOf(document.source),
    mappings: [identityMapping(document.source.length)],
    embeddedCodes: [client, server, ...styles],
    document,
    client,
    server,
    styles,
  };
}
