import { project, source } from '../make.js';
import type { ProjectDiagnostic, SourceDiagnostic, SourceInput } from '../types.js';

/** The build found it: the `<link>` that brought in a second file under a tag already taken. */
export interface FUD0761LinkParams extends SourceInput {
  readonly kind: 'link';
  readonly tag: string;
  /** The file that defined the tag first. */
  readonly defined: string;
  /** The second file, the one this link brings in. */
  readonly path: string;
}

/** The CLI found it: generating a component whose tag a library of the graph already defines. */
export interface FUD0761LibraryParams {
  readonly kind: 'library';
  readonly tag: string;
  readonly library: string;
  /** The library's file that defines the tag. */
  readonly file: string;
}

/**
 * Two components of one graph under one tag (SDD-43). One mistake, one code, wherever it is
 * caught: at a `<link>` in the build (with its span), or before the file exists in the CLI
 * (with no place to point at). Each form returns the shape its place allows.
 */
export interface FUD0761Code {
  (p: FUD0761LinkParams): SourceDiagnostic;
  (p: FUD0761LibraryParams): ProjectDiagnostic;
}

export const FUD0761 = ((p: FUD0761LinkParams | FUD0761LibraryParams) =>
  p.kind === 'link'
    ? source(
        'FUD0761',
        'error',
        `two files define the tag "${p.tag}": ${p.defined} and ${p.path}. customElements is one registry per document, so the second define() throws`,
        p,
      )
    : project(
        'FUD0761',
        'error',
        `the library "${p.library}" already defines "${p.tag}" (${p.file}). ` +
          'customElements is one registry per document, so the second define() throws: give this ' +
          "one another name, or a prefix of this project's own",
      )) as FUD0761Code;
