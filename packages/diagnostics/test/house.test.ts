/**
 * SDD-50 invariant 1, criteria 5 and 12: this package is the only house of a code and of the
 * address its explanation lives at.
 *
 * Outside `packages/diagnostics/src`, no source file writes a `'FUDnnnn'` string: a diagnostic
 * is made by calling its code. Comments do not count — they are references — and neither do
 * the three tables that READ a code already emitted to decide something.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOCS_BASE } from '../src/index.js';

const PACKAGES = fileURLToPath(new URL('../../', import.meta.url));

/** The tables of invariant 1: a file, and the `const` whose initializer may hold codes. */
const READERS: Readonly<Record<string, string>> = {
  'language-server/src/services/actions.ts': 'REPAIRS',
  'formatter/src/format.ts': 'KEY_RULES',
  'cli/src/run.ts': 'BROKEN_SOURCE',
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|mts|js|mjs)$/u.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Every `src` file of every package but this one, keyed `pkg/src/...` with `/`. */
const FILES = readdirSync(PACKAGES)
  .filter((pkg) => pkg !== 'diagnostics' && statSync(join(PACKAGES, pkg, 'src'), { throwIfNoEntry: false })?.isDirectory())
  .flatMap((pkg) => sources(join(PACKAGES, pkg, 'src')))
  .map((path) => ({ key: relative(PACKAGES, path).replace(/\\/gu, '/'), text: readFileSync(path, 'utf8') }));

interface Literal {
  /** 1-based line the string starts on. */
  readonly line: number;
  readonly text: string;
}

/**
 * The string literals of a module, comments left out: quotes, and templates with the `${ }`
 * holes they nest. Enough of a lexer for this repo's sources, which is what it has to read.
 */
function literals(source: string): Literal[] {
  const found: Literal[] = [];
  const holes: number[] = []; // brace depth at which each open `${` closes
  let depth = 0;
  let line = 1;
  let i = 0;

  const string = (quote: string): void => {
    const startLine = line;
    let text = '';
    i += 1;
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') {
        text += source[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
        found.push({ line: startLine, text });
        holes.push(depth);
        depth += 1;
        i += 2;
        return;
      }
      if (source[i] === '\n') line += 1;
      text += source[i];
      i += 1;
    }
    found.push({ line: startLine, text });
    i += 1;
  };

  /** Skip a regular expression literal: to its closing `/`, classes and escapes included. */
  const regex = (): void => {
    let inClass = false;
    i += 1;
    while (i < source.length && source[i] !== '\n') {
      const c = source[i]!;
      if (c === '\\') i += 1;
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
      i += 1;
    }
    i += 1;
  };

  // The last significant character: after one of these, a `/` starts a regex, not a division.
  let last = '';
  const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      for (const c of source.slice(i, end)) if (c === '\n') line += 1;
      i = end + 2;
      continue;
    }
    const before = last;
    if (ch.trim() !== '') last = ch;
    if (ch === '/' && (REGEX_AFTER.has(before) || /\b(return|typeof)\s*$/u.test(source.slice(Math.max(0, i - 8), i)))) {
      regex();
    } else if (ch === "'" || ch === '"' || ch === '`') {
      string(ch);
    } else if (ch === '{') {
      depth += 1;
      i += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (holes.length > 0 && holes[holes.length - 1] === depth) {
        holes.pop();
        string('`'); // resume the template after its hole: `string` steps over the `}`
      } else {
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return found;
}

/** Lines `[from, to]` of `const NAME … ;`, the table a reader file is allowed to write. */
function tableLines(source: string, name: string): readonly [number, number] {
  const lines = source.split('\n');
  const from = lines.findIndex((l) => new RegExp(`^(export )?const ${name}\\b`, 'u').test(l));
  const to = lines.findIndex((l, n) => n >= from && /;\s*$/u.test(l));
  return [from + 1, to + 1];
}

const FUD = /FUD\d{4}/u;

/**
 * Whether a string writes a code. A string that is itself source — the `.d.ts` the editor
 * generates — has comments of its own, and those are references like any other.
 */
const CODE = {
  test: (text: string): boolean =>
    FUD.test(text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')),
};

describe('one house (invariant 1, criterion 5)', () => {
  it('reads the sources it guards', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(Object.keys(READERS).every((key) => FILES.some((f) => f.key === key))).toBe(true);
  });

  it('finds a code written in a string, and none written in a comment', () => {
    const sample = [
      '/** `FUD0001` in a doc comment */',
      '// FUD0002 in a line comment',
      "const a = 'FUD0003';",
      'const b = `x ${f({ y: "FUD0004" })} FUD0005`;',
    ].join('\n');
    expect(literals(sample).filter((l) => CODE.test(l.text)).map((l) => [l.line, l.text])).toEqual([
      [3, 'FUD0003'],
      [4, 'FUD0004'],
      [4, ' FUD0005'],
    ]);
  });

  it('no source outside @fudic/diagnostics writes a code, but the three tables that read one', () => {
    const strays: string[] = [];
    for (const { key, text } of FILES) {
      const table = READERS[key];
      const [from, to] = table === undefined ? [0, -1] : tableLines(text, table);
      for (const literal of literals(text)) {
        if (!CODE.test(literal.text)) continue;
        if (literal.line >= from && literal.line <= to) continue;
        strays.push(`${key}:${literal.line} ${literal.text}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it('each table holds codes, so the exception is not a blank cheque for an empty one', () => {
    for (const [key, table] of Object.entries(READERS)) {
      const text = FILES.find((f) => f.key === key)!.text;
      const [from, to] = tableLines(text, table);
      const inside = literals(text).filter((l) => CODE.test(l.text) && l.line >= from && l.line <= to);
      expect(inside.length, `${key} ${table}`).toBeGreaterThan(0);
    }
  });
});

describe('one address (criterion 12)', () => {
  it('no source file of any package writes the explanations’ URL', () => {
    const all = [
      ...FILES,
      ...sources(fileURLToPath(new URL('../src/', import.meta.url))).map((path) => ({
        key: relative(PACKAGES, path),
        text: readFileSync(path, 'utf8'),
      })),
    ];
    expect(all.filter((f) => f.text.includes(DOCS_BASE)).map((f) => f.key)).toEqual([]);
  });
});
