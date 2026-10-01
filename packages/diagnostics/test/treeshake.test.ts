/**
 * SDD-50 criterion 13 and invariant 5: `"sideEffects": false` and one file per code mean a
 * bundle keeps the codes it calls and nothing else.
 *
 * The spec names `FUD0050`, which is retired and has no function; `FUD0051` is the live code
 * beside it. The bundle is built from the package's entry, the way a consumer imports it, and
 * is then searched for the message of every OTHER code.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/**
 * The fixed text of a code's message: the longest run of plain words in its string literals,
 * between interpolations. Plain words, because a bundler may re-quote a string and re-escape
 * what is in it, but it never rewrites a sentence.
 */
function fingerprint(code: string): string | undefined {
  const ts = readFileSync(new URL(`../src/codes/${code}.ts`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
  const strings = [...ts.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/gu)].map((m) => m[1] ?? m[2] ?? m[3]!);
  const runs = strings.flatMap((s) => s.match(/[A-Za-z][A-Za-z ,;:()-]{14,}/gu) ?? []);
  return runs.sort((a, b) => b.length - a.length)[0]?.trim();
}

async function bundle(entry: string): Promise<string> {
  const build = await rolldown({
    input: 'entry',
    plugins: [
      {
        name: 'entry',
        resolveId: (id) => (id === 'entry' ? id : null),
        load: (id) => (id === 'entry' ? entry : null),
      },
    ],
    // The sources, as `tsc` would see them: `./x.js` in an import is `./x.ts` on disk.
    resolve: { alias: { '@fudic/diagnostics': `${SRC}index.ts` }, extensionAlias: { '.js': ['.ts', '.js'] } },
    logLevel: 'silent',
  });
  const { output } = await build.generate({ format: 'esm' });
  return output.map((chunk) => ('code' in chunk ? chunk.code : '')).join('\n');
}

describe('a bundle keeps only the codes it calls (criterion 13)', () => {
  it('importing FUD0051 brings FUD0051 and no other code', async () => {
    const code = await bundle(
      "import { FUD0051, span } from '@fudic/diagnostics';\nconsole.log(FUD0051({ span: span(0, 1), name: 'p' }));",
    );

    expect(code).toContain('matches no open element');
    const codes = readdirSync(new URL('../src/codes/', import.meta.url))
      .filter((f) => f.endsWith('.ts') && f !== 'FUD0051.ts')
      .map((f) => f.slice(0, -3));
    expect(codes.length).toBeGreaterThan(200);
    const leaked = codes.filter((c) => code.includes(`'${c}'`) || code.includes(`"${c}"`));
    expect(leaked).toEqual([]);
    const texts = codes.map((c) => [c, fingerprint(c)] as const).filter(([, t]) => t !== undefined);
    expect(texts.length).toBeGreaterThan(150);
    expect(texts.filter(([, t]) => code.includes(t!)).map(([c]) => c)).toEqual([]);
  }, 60000);

  it('and the search would see a second code if it were there', async () => {
    const code = await bundle(
      "import { FUD0051, FUD0443, span } from '@fudic/diagnostics';\n" +
        "console.log(FUD0051({ span: span(0, 1), name: 'p' }), FUD0443({ file: 'a', target: 'file' }));",
    );
    expect(code).toContain(fingerprint('FUD0443'));
  }, 60000);
});
