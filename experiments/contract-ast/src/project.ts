/**
 * The files of one simulation. Each is read and parsed by Oxc exactly once (golden rule of the
 * repo), and every issue is anchored to a file and an offset turned into line and column.
 */

import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { parseSync } from 'oxc-parser';
import type { Node } from './ast.ts';
import type { Issue } from './model.ts';

export interface Parsed {
  readonly path: string;
  /** Relative to the simulation, with `/`. */
  readonly rel: string;
  readonly program: Node;
  /** Oxc's own summary of imports and exports. */
  readonly module: unknown;
  readonly comments: unknown;
  readonly errors: readonly unknown[];
  readonly lines: readonly number[];
}

export class Project {
  readonly root: string;
  readonly issues: Issue[] = [];
  readonly #files = new Map<string, Parsed | null>();

  constructor(root: string) {
    this.root = root;
  }

  /** The parsed file, or `null` when it does not exist. */
  parse(path: string): Parsed | null {
    const known = this.#files.get(path);
    if (known !== undefined) return known;
    if (!existsSync(path)) {
      this.#files.set(path, null);
      return null;
    }
    const source = readFileSync(path, 'utf8');
    const result = parseSync(path, source, { lang: 'ts', sourceType: 'module', preserveParens: false });
    const parsed: Parsed = {
      path,
      rel: this.rel(path),
      program: result.program as unknown as Node,
      module: result.module,
      comments: result.comments,
      errors: result.errors,
      lines: lineStarts(source),
    };
    this.#files.set(path, parsed);
    for (const error of result.errors) {
      const label = error.labels[0];
      this.report('error', 'parse-error', error.message, parsed, label === undefined ? null : label.start);
    }
    return parsed;
  }

  files(): Parsed[] {
    return [...this.#files.values()].filter((p): p is Parsed => p !== null);
  }

  rel(path: string): string {
    return relative(this.root, path).replaceAll('\\', '/');
  }

  report(severity: Issue['severity'], code: string, message: string, file: Parsed | string, at: Node | number | null): void {
    const offset = at === null ? 0 : typeof at === 'number' ? at : at.start;
    const [line, col] = typeof file === 'string' ? [0, 0] : position(file.lines, offset);
    this.issues.push({ severity, code, message, file: typeof file === 'string' ? file : file.rel, line, col });
  }
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** 1-based line and column of an offset. */
function position(lines: readonly number[], offset: number): [number, number] {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((lines[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return [lo + 1, offset - (lines[lo] ?? 0) + 1];
}
