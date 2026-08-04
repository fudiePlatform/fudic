/**
 * Reading the code a build published.
 *
 * Since SDD-27 §5.1 the render chunks of `sw/c` are the only render code in `dist` — the
 * `page` pass is pruned — and the link pass emits them as ASSETS, not chunks. So a test
 * that joins `type === 'chunk'` no longer sees any render code at all. This joins both.
 */

interface OutFile {
  readonly type: string;
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

/** Every piece of JavaScript the build published, chunks and emitted `.js` assets alike. */
export function allCode(output: readonly OutFile[]): string {
  return output
    .filter((o) => o.fileName.endsWith('.js'))
    .map((o) => o.code ?? String(o.source ?? ''))
    .join('\n');
}
