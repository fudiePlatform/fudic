import { file, source } from '../make.js';
import type { FileDiagnostic, SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1500` on a `page` header. */
export interface FUD1500Params extends SourceInput {
  /** The route as the header writes it: `/usuarios`, `/blog/[slug]`. */
  readonly route: string;
}

/** Parameters of `FUD1500` from `fudic g spec /<route>`: about the routes folder, with nothing in it to point at. */
export interface FUD1500FileParams {
  /** The routes folder. */
  readonly file: string;
  readonly route: string;
}

const message = (route: string): string => `no page \`${route}\`: the routes folder has no page by that path`;

/** `page <route>` (`.fudspec`) or `fudic g spec <route>` names a route the project does not have (SDD-82). */
export function FUD1500(p: FUD1500Params): SourceDiagnostic;
export function FUD1500(p: FUD1500FileParams): FileDiagnostic;
export function FUD1500(p: FUD1500Params | FUD1500FileParams): SourceDiagnostic | FileDiagnostic {
  return 'span' in p ? source('FUD1500', 'error', message(p.route), p) : file('FUD1500', 'error', message(p.route), p);
}
