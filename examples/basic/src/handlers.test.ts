import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// SDD-72 criterion 27, read as its §8.1.13 says: no handler of `fudic:result`, `fudic:error` or
// `bus:` in this example unwraps an event. They receive the datum, so none reads `detail` or
// types a `CustomEvent`. The example's own CustomEvents (`app-eventos.fud`), the `detail` of an
// error page and the `<details>` element are other things and stay.

const SRC = fileURLToPath(new URL('.', import.meta.url));

function fudFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return fudFiles(full);
    return entry.endsWith('.fud') ? [full] : [];
  });
}

/** Every `@fudic:result`, `@fudic:error` and `bus:` binding of `source`: its name and value. */
function bindings(source: string): { name: string; value: string }[] {
  const found = source.matchAll(/(@fudic:result|@fudic:error|bus:(?:[\w-]+|\([^)]*\)))=("[^"]*"|@[^\s>]+)/gu);
  return [...found].map((m) => ({ name: m[1]!, value: m[2]!.replace(/^"|"$/gu, '') }));
}

/** The text of `function name(…) { … }` in `source`, braces balanced, or undefined. */
function functionText(source: string, name: string): string | undefined {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return undefined;
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return undefined;
}

const handlers = fudFiles(SRC).flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  return bindings(source).map((b) => {
    const reference = /^@([A-Za-z_$][\w$]*)$/u.exec(b.value)?.[1];
    return { file: file.slice(SRC.length), ...b, body: reference === undefined ? undefined : functionText(source, reference) };
  });
});

test('the migrated handlers are found: user-form, usuarios, shopping-cart and bus-log', () => {
  const names = handlers.map((h) => `${h.name}=${h.value}`);
  expect(names).toEqual(expect.arrayContaining(['@fudic:result=@hecho', 'bus:alta=@alta', 'bus:carrito=@onCarrito', 'bus:picked=@onPicked']));
});

test('no handler of the three reads detail or types a CustomEvent', () => {
  const offending = handlers.filter((h) => /detail|CustomEvent/u.test(`${h.value} ${h.body ?? ''}`));
  expect(offending.map((h) => `${h.file} ${h.name}=${h.value}`)).toEqual([]);
});

test('and every one is a reference or a lambda, so it is handed the datum', () => {
  const calls = handlers.filter((h) => h.body === undefined && !/=>/u.test(h.value));
  expect(calls.map((h) => `${h.file} ${h.name}=${h.value}`)).toEqual([]);
});
