/**
 * The two hosts of a localized compile (SDD-58 §3.3, §4.6): `translateScript` for a `.ts`/`.js`
 * module of the app, and `localizedIo` for the files a `.fud` graph reads.
 */

import { describe, expect, it } from 'vitest';
import { localizedIo, translateScript, type ResolveIo } from '../../src/index.js';
import { i18nOf } from './_compile.js';

/** `mappings` decoded to `[generatedLine, generatedColumn, sourceLine, sourceColumn]`, 0-based. */
function decode(mappings: string): [number, number, number, number][] {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out: [number, number, number, number][] = [];
  let srcLine = 0;
  let srcCol = 0;
  mappings.split(';').forEach((line, genLine) => {
    let genCol = 0;
    for (const segment of line.split(',').filter((s) => s !== '')) {
      const values: number[] = [];
      let value = 0;
      let shift = 0;
      for (const ch of segment) {
        const digit = B64.indexOf(ch);
        value += (digit & 31) << shift;
        if (digit & 32) shift += 5;
        else {
          values.push(value & 1 ? -(value >> 1) : value >> 1);
          value = 0;
          shift = 0;
        }
      }
      genCol += values[0]!;
      srcLine += values[2]!;
      srcCol += values[3]!;
      out.push([genLine, genCol, srcLine, srcCol]);
    }
  });
  return out;
}

const T = "import { t, format, locale, currency } from '@fudic/i18n';\n";

describe('translateScript', () => {
  it('t() as a literal or a template literal, translated', () => {
    const source = `${T}export const a = t('Hola');\nexport const b = (name: string) => t('Hola {name}', { name });\n`;
    const { value, diagnostics } = translateScript(source, 'src/lib/greet.ts', i18nOf({ Hola: 'Hello', 'Hola {name}': 'Hi {name}' }));

    expect(diagnostics).toEqual([]);
    expect(value.code).toBe(
      `${T}export const a = (\`Hello\`);\nexport const b = (name: string) => (\`Hi \${(name)}\`);\n`,
    );
  });

  it('a plural is $message, imported at the head of the module', () => {
    const source = `${T}export const m = (n: number) => t('{n} mensajes', { n });\n`;
    const { value } = translateScript(source, 'src/lib/m.ts', i18nOf({ '{n} mensajes': '{n, plural, one {# message} other {# messages}}' }));

    expect(value.code.startsWith("import { $message } from '@fudic/i18n';\n")).toBe(true);
    expect(value.code).toContain('$message(');
    expect(value.code).toContain(',`en`))');
  });

  it('format() is $format, and locale is "en"', () => {
    const source = `${T}export const s = format(3.5, currency('EUR'));\nexport const l = locale;\nexport const o = { locale };\n`;
    const { value } = translateScript(source, 'src/lib/f.ts', i18nOf({}));

    expect(value.code).toBe(
      `import { $format } from '@fudic/i18n';\n${T}export const s = ($format((currency('EUR')),(3.5),\`en\`));\nexport const l = (\`en\`);\nexport const o = { locale:\`en\` };\n`,
    );
  });

  it('a | in a module is the OR of bits', () => {
    const source = `${T}export const m = 1 | 2;\n`;
    expect(translateScript(source, 'src/lib/x.ts', i18nOf({})).value.code).toBe(source);
  });

  it('a module that does not import @fudic/i18n comes out identical', () => {
    const source = "export const t = (s: string) => s;\nexport const a = t('Hola');\n";
    expect(translateScript(source, 'src/lib/x.ts', i18nOf({ Hola: 'Hello' })).value.code).toBe(source);
  });

  it('asks with the context of the module, through relative() when given', () => {
    const plain = i18nOf({});
    translateScript(`${T}t('Hola');\n`, 'src/lib/a.ts', plain);
    expect(plain.asked.map((m) => m.context)).toEqual(['lib/a.ts']);

    const base = i18nOf({});
    translateScript(`${T}t('Hola');\n`, '/abs/app/src/lib/a.ts', { ...base, relative: (p) => p.replace('/abs/app/', '') });
    expect(base.asked.map((m) => m.context)).toEqual(['lib/a.ts']);
  });

  it('reports FUD1020 and FUD0170 with spans in the module, and never throws', () => {
    const source = `${T}t(v);\nconst x = ;\n`;
    const { diagnostics } = translateScript(source, 'src/lib/x.ts', i18nOf({}));

    expect(diagnostics.map((d) => d.code).sort()).toEqual(['FUD0170']);
    const good = `${T}t(v);\n`;
    expect(translateScript(good, 'src/lib/x.ts', i18nOf({})).diagnostics.map((d) => [d.code, good.slice(d.span!.start, d.span!.end)])).toEqual([
      ['FUD1020', 'v'],
    ]);
  });

  it('parses .js as JavaScript', () => {
    const { value, diagnostics } = translateScript(`${T}export const a = t('Hola');\n`, 'src/lib/a.js', i18nOf({ Hola: 'Hello' }));
    expect(diagnostics).toEqual([]);
    expect(value.code).toContain('(`Hello`)');
  });

  it('the source map names the module, carries its text, and maps every line back', () => {
    const source = `${T}export const a = t('Hola');\nexport const b = 1;\n\nexport const c = format(1, p);\n`;
    const { value } = translateScript(source, 'src/lib/a.ts', i18nOf({ Hola: 'Hello there' }));
    const { map, code } = value;

    expect(map.sources).toEqual(['src/lib/a.ts']);
    expect(map.sourcesContent).toEqual([source]);
    const segments = decode(map.mappings);
    const lines = code.split('\n');
    // Every non-empty generated line starts with a mapping.
    lines.forEach((line, i) => {
      if (line !== '') expect(segments.some(([l, c]) => l === i && c === 0)).toBe(true);
    });
    // `export const b = 1;` is line 2 in both, and so is its mapping.
    const b = lines.indexOf('export const b = 1;');
    expect(segments.find(([l, c]) => l === b && c === 0)).toEqual([b, 0, 2, 0]);
    // `export const c` comes after an inserted import: its line maps to the original line 4.
    const c = lines.findIndex((l) => l.startsWith('export const c'));
    expect(segments.find(([l, col]) => l === c && col === 0)?.[2]).toBe(4);
  });
});

describe('localizedIo', () => {
  const files: Record<string, string> = {
    '/a.fud': '<app-a><template shadowrootmode="open"><p>Hola</p></template></app-a>',
  };

  function host(): ResolveIo & { reads: string[]; extra: () => string; name: string } {
    const reads: string[] = [];
    return {
      reads,
      name: 'host',
      read(path) {
        reads.push(path);
        return files[path]!;
      },
      resolve(from, href) {
        return `${from}|${href}`;
      },
      extra() {
        return this.name;
      },
    };
  }

  it('read() answers the file rewritten for the locale', () => {
    const io = localizedIo(host(), i18nOf({ Hola: 'Hello' }));
    expect(io.read('/a.fud')).toBe('<app-a><template shadowrootmode="open"><p>Hello</p></template></app-a>');
  });

  it('origin() answers the text on disk and the map back to it', () => {
    const io = localizedIo(host(), i18nOf({ Hola: 'Hello' }));
    const origin = io.origin!('/a.fud')!;
    expect(origin.source).toBe(files['/a.fud']);
    expect(origin.map.entryOffset(io.read('/a.fud').indexOf('</p>'))).toBe(files['/a.fud']!.indexOf('</p>'));
  });

  it('each file is read and rewritten once', () => {
    const inner = host();
    const io = localizedIo(inner, i18nOf({}));
    io.read('/a.fud');
    io.origin!('/a.fud');
    io.read('/a.fud');
    expect(inner.reads).toEqual(['/a.fud']);
  });

  it('every other member is the host\'s, bound to it, and values pass through', () => {
    const io = localizedIo(host(), i18nOf({}));
    const { resolve, extra } = io;
    expect(resolve('/a.fud', './b.fud')).toBe('/a.fud|./b.fud');
    expect(extra()).toBe('host');
    expect(io.name).toBe('host');
  });
});
