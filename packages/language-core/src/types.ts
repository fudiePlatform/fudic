/**
 * Public contracts of the virtual emitter (SDD-23 §3.1).
 *
 * Types only, no behaviour: the emitter, the server and the tests all depend on these
 * shapes without depending on each other.
 */

/**
 * A synthetic file handed to a language service, plus the mapping back to the `.fud`.
 *
 * Three per document at most: the client `.fud.ts`, the server `.fud.server.ts`, and one
 * `.fud.<n>.css` per `<style>` (§4.1).
 */
export interface VirtualFile {
  /** Virtual path, derived from the `.fud` path (§4.1). */
  readonly fileName: string;
  readonly languageId: 'typescript' | 'css';
  readonly text: string;
  readonly mappings: readonly Mapping[];
}

/** One stretch of generated text and the source stretch it stands for. */
export interface Mapping {
  /** Offset in the `.fud`. */
  readonly sourceOffset: number;
  /** Offset in the generated virtual file. */
  readonly generatedOffset: number;
  /** Length in the generated file. */
  readonly length: number;
  /**
   * Length in the `.fud`. Equal to `length` for verbatim copies, which is the overwhelming
   * majority — user text is copied 1:1 precisely so that columns survive.
   *
   * The two differ only where a stretch *stands for* source it does not reproduce: a tag
   * projected as `$C_app_missing` is 14 characters standing for the 11 of `app-missing`.
   * Carrying one length for both sides would make that diagnostic underline three
   * characters of whatever follows the tag. Volar models the two sides separately for the
   * same reason.
   */
  readonly sourceLength: number;
  readonly caps: MappingCaps;
}

/**
 * Which LSP capabilities travel through this stretch of mapping.
 *
 * These are exactly Volar's six `CodeInformation` flags, under their own names: the server
 * forwards them as-is, with no translation. Inventing a private vocabulary here (`hover`,
 * `rename`, `definition`) would force a lossy 6→6 mapping at the boundary, and the loss
 * always falls on the same side — scaffolding becoming visible to the user.
 *
 * A stretch emitted from user code carries every flag `true` (except `format`); a stretch
 * of scaffolding — `function $tpl() {`, the synthetic `import type`s, `declare const data`
 * — carries them all `false` and is therefore invisible: no rename, no diagnostic, no
 * hover. This is the piece that separates a correct LSP from one that offers to rename
 * `$tpl`.
 */
export interface MappingCaps {
  /** Completion inside the stretch. */
  readonly completion: boolean;
  /** Diagnostics: reported back onto the source, or dropped. */
  readonly verification: boolean;
  /** Hover, inlay hints, signature help, semantic tokens. */
  readonly semantic: boolean;
  /** Definition, references, rename, highlight. */
  readonly navigation: boolean;
  /** Document symbols, folding, linked editing. */
  readonly structure: boolean;
  /**
   * Whether the stretch takes part in formatting. Always `false`: formatting is SDD-26,
   * over the source. A virtual file is never formatted — its layout *is* the mapping.
   */
  readonly format: boolean;
}

/**
 * Resolves what the current file's `<link>` elements point at (SDD-23 §2).
 *
 * A narrow port with no I/O, deliberately: the emitter must not read the filesystem, and
 * the semantic pass's `ComponentRegistry` (`has(tag)`) only answers yes/no. The workspace
 * index that feeds this lives in the language server (SDD-24 §4.5); in tests it is a map.
 */
export interface FileRegistry {
  /** Path of the `.fud` a tag resolves to, or `undefined` when it is not declared. */
  component(tag: string): string | undefined;
  /** Path of this file's layout, when it declares `<link rel="layout">`. */
  layout(): string | undefined;
}
