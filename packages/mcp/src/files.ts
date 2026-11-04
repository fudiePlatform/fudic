/**
 * `fudic_files`, `fudic_read` and `fudic_write`: the project's folder as a chat sees it over
 * HTTP, where it has no tools of its own. Everything goes through `locate`, and nothing is run.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { FUD1401, FUD1402, type FileDiagnostic } from '@fudic/diagnostics';
import { locate } from './locate.js';
import type { Git } from './project.js';

/** Folders a listing never shows: what nobody writes by hand. */
const HIDDEN: ReadonlySet<string> = new Set(['node_modules', 'dist', '.git', '.fudic']);

/** The most lines a read answers unless asked. */
export const READ_LIMIT = 400;

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** Every file under a folder, relative to `root`, the hidden folders left out. */
function walk(root: string, dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (HIDDEN.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(root, path));
    else if (entry.isFile()) out.push(posix(relative(root, path)));
  }
  return out;
}

/**
 * The files of the project, relative and sorted: what git tracks or would track, so what it
 * ignores is left out; without git, every file outside the hidden folders.
 */
export function listFiles(root: string, git: Git): readonly string[] {
  let listed: string[];
  try {
    listed = git(root, ['ls-files', '--cached', '--others', '--exclude-standard'])
      .split('\n')
      .filter((line) => line !== '')
      .filter((path) => existsSync(join(root, path)));
  } catch {
    listed = walk(root, root);
  }
  return [...new Set(listed)].filter((path) => !path.split('/').some((segment) => HIDDEN.has(segment))).sort();
}

/** The files under `under`, or the refusal. */
export function filesUnder(
  root: string,
  git: Git,
  under?: string,
): { readonly files: readonly string[] } | { readonly error: FileDiagnostic } {
  const all = listFiles(root, git);
  if (under === undefined) return { files: all };
  const located = locate(root, under);
  if ('error' in located) return located;
  const prefix = posix(relative(root, located.path));
  return { files: prefix === '' ? all : all.filter((path) => path === prefix || path.startsWith(`${prefix}/`)) };
}

/** A file's text, or why it cannot be read. */
function textOf(path: string, shown: string): { readonly text: string } | { readonly error: FileDiagnostic } {
  if (!existsSync(path)) return { error: FUD1401({ file: shown, reason: 'missing' }) };
  const bytes = readFileSync(path);
  // A NUL in the first bytes is what git takes for a binary file too.
  if (bytes.subarray(0, 8000).includes(0)) return { error: FUD1401({ file: shown, reason: 'binary' }) };
  return { text: bytes.toString('utf8') };
}

export interface ReadInput {
  readonly path: string;
  /** 1-based. */
  readonly offset: number;
  readonly limit: number;
}

/** The lines of a file, numbered from 1, from `offset` on. */
export function readLines(
  root: string,
  input: ReadInput,
): { readonly body: Readonly<Record<string, unknown>> } | { readonly error: FileDiagnostic } {
  const located = locate(root, input.path);
  if ('error' in located) return located;
  const shown = posix(relative(root, located.path));
  const read = textOf(located.path, shown);
  if ('error' in read) return read;
  const lines = read.text.split(/\r\n|\r|\n/u);
  if (lines.at(-1) === '') lines.pop();
  const from = Math.max(1, input.offset);
  const slice = lines.slice(from - 1, from - 1 + input.limit);
  const width = String(from + slice.length - 1).length;
  const text = slice.map((line, i) => `${String(from + i).padStart(width + 2)}→${line}`).join('\n');
  const to = from + slice.length - 1;
  return { body: { path: shown, lines: slice.length === 0 ? 0 : `${from}-${to}`, total: lines.length, text } };
}

export interface Edit {
  readonly old: string;
  readonly new: string;
}

export type WriteInput = { readonly path: string } & ({ readonly content: string } | { readonly edits: readonly Edit[] });

/** How many times `part` is in `text`, without overlaps. */
function count(text: string, part: string): number {
  if (part === '') return 0;
  let n = 0;
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + part.length)) n++;
  return n;
}

/**
 * Write a whole file, or apply edits to one: every edit or none. Answers the absolute path
 * written, for the check that follows.
 */
export function writeFile(root: string, input: WriteInput): { readonly path: string; readonly shown: string } | { readonly error: FileDiagnostic } {
  const located = locate(root, input.path);
  if ('error' in located) return located;
  const shown = posix(relative(root, located.path));
  let text: string;
  if ('content' in input) {
    text = input.content;
  } else {
    const read = textOf(located.path, shown);
    if ('error' in read) return read;
    text = read.text;
    for (const edit of input.edits) {
      const found = count(text, edit.old);
      if (found !== 1) return { error: FUD1402({ file: shown, old: edit.old, found }) };
      text = text.replace(edit.old, () => edit.new);
    }
  }
  mkdirSync(dirname(located.path), { recursive: true });
  writeFileSync(located.path, text);
  return { path: located.path, shown };
}
