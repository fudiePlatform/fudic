import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0700`: what, in the layout's `@code`, is not its declaration of props. */
export type FUD0700Params = SourceInput &
  (
    | { readonly kind: 'server-region' | 'client-region' | 'statement' }
    | { readonly kind: 'reactive'; readonly name: string }
  );

/** A layout's `@code` contains something that is not its declaration of props (SDD-40). */
export const FUD0700 = (p: FUD0700Params): SourceDiagnostic =>
  source('FUD0700', 'error', message(p), p);

function message(p: FUD0700Params): string {
  switch (p.kind) {
    case 'server-region':
      return 'a layout has no `@server` region: it would be a second `load` with no route to call it. Its data comes from the route, which resolves its props in `export function layout(ctx, data)`';
    case 'client-region':
      return 'a layout has no `@client` region: there is no layout chunk for it to travel in, and a layout prop is a render value that never repaints';
    case 'statement':
      return 'the `@code` of a layout declares its props and nothing else: this statement would run in both renderers with nobody able to say when';
    case 'reactive':
      return `a layout declares no reactive state: \`${p.name}\` has no half of client that could repaint it`;
  }
}
