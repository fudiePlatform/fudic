/**
 * SDD-71 in a real `vite build`: criteria 9, 10 and 11 over the output a browser downloads.
 *
 * - 10: an app without pipes carries no `Intl.`; one with only `date` carries `DateTimeFormat`
 *   and no other formatter; a pipe of `src/pipes` nobody imports is not there; one a route
 *   imports is in that route's chunks only, and brings nothing of `src/browser`.
 * - 11: the one `src/pipes/truncar.ts` paints the prerendered page, the Service Worker's render
 *   and the client chunk, and its sources say so.
 * - 9: a module with pipes imports nothing of `@fudic/i18n`, and there is no `$format`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { fudic } from '../src/index.js';
import { writeI18nProject } from './helpers/i18n-project.js';

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
  readonly map?: { readonly sources: readonly string[] } | null;
}

async function buildOf(root: string): Promise<OutFile[]> {
  const result = (await build({ root, logLevel: 'silent', plugins: [fudic()], build: { write: false, minify: false, sourcemap: true } })) as unknown as {
    output: OutFile[];
  };
  return result.output;
}

const textOf = (o: OutFile): string => String(o.type === 'chunk' ? o.code : o.source);
/** Every JavaScript file of the output: what a browser, page or Service Worker, may download. */
const scripts = (output: readonly OutFile[]): OutFile[] => output.filter((o) => o.fileName.endsWith('.js'));
/** The script files whose text contains `needle`. */
const holding = (output: readonly OutFile[], needle: string): string[] =>
  scripts(output)
    .filter((o) => textOf(o).includes(needle))
    .map((o) => o.fileName)
    .sort();
const page = (output: readonly OutFile[], fileName: string): string => {
  const file = output.find((o) => o.fileName === fileName);
  if (file === undefined) throw new Error(`no ${fileName} in ${output.map((o) => o.fileName).join(', ')}`);
  return textOf(file);
};

const LAYOUT = `<!DOCTYPE html>
<html>
<head><script src="fudic:runtime"></script>@RenderHead()</head>
<body>@RenderBody()</body>
</html>
`;

const COUNTER = `@code {
  import { signal } from '@fudic/core';
  const n = signal(0);
  function mas(): void { n.set(n() + 1); }
}
<app-counter>
  <template shadowrootmode="open">
    <button @click="@mas">+</button><p>@n()</p>
  </template>
</app-counter>
`;

const HOME = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-counter.fud">
<head><title>Inicio</title></head>
<app-counter></app-counter>
`;

const BASE = {
  'src/layouts/_layout.fud': LAYOUT,
  'src/components/app-counter.fud': COUNTER,
  'src/routes/home.fud': HOME,
  'sw.json': JSON.stringify({ shell: [] }),
};

/** Every `Intl` formatter a preset could reach. */
const FORMATTERS = ['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'ListFormat'];

describe('criterion 10: an app without pipes', () => {
  let output: OutFile[];
  beforeAll(async () => {
    output = await buildOf(writeI18nProject({ files: BASE }));
  }, 240000);

  it('carries no Intl and no code of a preset', () => {
    expect(scripts(output).length).toBeGreaterThan(0);
    expect(holding(output, 'Intl.')).toEqual([]);
    for (const name of FORMATTERS) expect(holding(output, name), name).toEqual([]);
  });
});

describe('criterion 10: an app with only date', () => {
  const CLOCK = `@code {
  import { date, signal } from '@fudic/core';
  const hora = date({ timeStyle: 'short', timeZone: 'UTC' });
  const t = signal(0);
  function mas(): void { t.set(t() + 60000); }
}
<app-clock>
  <template shadowrootmode="open">
    <button @click="@mas">+</button><p>@(t() | hora)</p>
  </template>
</app-clock>
`;
  let output: OutFile[];
  beforeAll(async () => {
    output = await buildOf(
      writeI18nProject({
        files: {
          ...BASE,
          'src/components/app-clock.fud': CLOCK,
          'src/routes/home.fud': HOME.replace('app-counter', 'app-clock').replace('<app-counter></app-counter>', '<app-clock></app-clock>'),
        },
      }),
    );
  }, 240000);

  it('carries DateTimeFormat, and neither NumberFormat nor ListFormat nor RelativeTimeFormat', () => {
    expect(holding(output, 'DateTimeFormat').length).toBeGreaterThan(0);
    for (const name of ['NumberFormat', 'ListFormat', 'RelativeTimeFormat']) expect(holding(output, name), name).toEqual([]);
  });

  it('date is its own published piece of @fudic/core, and no other preset is published (task 16)', () => {
    const pieces = output.map((o) => o.fileName).filter((f) => f.startsWith('_fudic/') && f.includes('/core/'));
    expect(pieces.some((f) => /\/core\/date\.js$/u.test(f)), pieces.join(', ')).toBe(true);
    for (const other of ['number', 'list', 'relative-time']) {
      expect(pieces.some((f) => new RegExp(`/core/${other}\\.js$`, 'u').test(f)), other).toBe(false);
    }
  });

  it('the page is painted with the default locale (criterion 1)', () => {
    expect(page(output, 'home/index.html')).toContain('12:00');
    expect(page(output, 'home/index.html')).toMatch(/12:00\sAM/u);
  });
});

describe('criteria 9, 10 and 11: a pipe of the project', () => {
  const TRUNCAR_API = 'pipe truncar\n  on str\n  max u32\n';
  const TRUNCAR_TS = `import { truncar } from 'fudic:pipes/truncar';

export default truncar.implement((value, { max }, locale) => \`\${value.slice(0, max)}·TRK·\${locale}\`);
`;
  const UNUSED_API = 'pipe sin-uso\n  on str\n';
  const UNUSED_TS = `import { sinUso } from 'fudic:pipes/sin-uso';

export default sinUso.implement((value) => \`\${value}·UNUSED_PIPE\`);
`;
  /** A route with a client half that imports the pipe: its own chunk. */
  const BLOG = `<link rel="layout" href="../layouts/_layout.fud">
@code {
  import truncar from '../pipes/truncar';
  import { signal } from '@fudic/core';
  const corto = truncar({ max: 3 });
  const titulo = signal('fudic');
  function cambia(): void { titulo.set('framework'); }
}
<head><title>Blog</title></head>
<button @click="@cambia">cambia</button>
<p>@(titulo() | corto)</p>
`;
  let output: OutFile[];
  beforeAll(async () => {
    output = await buildOf(
      writeI18nProject({
        files: {
          ...BASE,
          'src/routes/blog.fud': BLOG,
          'src/pipes/truncar.fudapi': TRUNCAR_API,
          'src/pipes/truncar.ts': TRUNCAR_TS,
          'src/pipes/sin-uso.fudapi': UNUSED_API,
          'src/pipes/sin-uso.ts': UNUSED_TS,
          'src/browser/extra.ts': "export const extra = 'BROWSER_EXTRA_MARK';\n",
        },
      }),
    );
  }, 240000);

  it('the prerendered page is painted by the implementation, with the app\'s locale (criterion 11)', () => {
    expect(page(output, 'blog/index.html')).toContain('fud·TRK·en');
  });

  it('the pipe nobody imports is nowhere', () => {
    expect(holding(output, 'UNUSED_PIPE')).toEqual([]);
  });

  it('the pipe a route imports is in that route\'s chunks only: its client chunk and its Service Worker render', () => {
    const found = holding(output, '·TRK·');
    expect(found.length).toBeGreaterThan(0);
    const swRender = found.filter((f) => f.startsWith('sw/'));
    const client = found.filter((f) => !f.startsWith('sw/'));
    expect(swRender.length, found.join(', ')).toBeGreaterThan(0);
    expect(client.length, found.join(', ')).toBeGreaterThan(0);
    // Nothing that the page of /home loads: its route chunk, its components', the coordinator.
    const home = page(output, 'home/index.html');
    for (const file of found) expect(home, file).not.toContain(file);
  });

  it('one implementation: every chunk with the pipe maps it back to src/pipes/truncar.ts (criterion 11)', () => {
    for (const fileName of holding(output, '·TRK·')) {
      const map = output.find((o) => o.fileName === `${fileName}.map`);
      const sources = map === undefined ? [] : (JSON.parse(textOf(map)) as { sources: string[] }).sources;
      expect(sources.some((s) => s.replace(/\\/gu, '/').endsWith('src/pipes/truncar.ts')), `${fileName}: ${sources.join(', ')}`).toBe(true);
      expect(sources.some((s) => /src[\\/](server|browser)[\\/]/u.test(s)), `${fileName}: ${sources.join(', ')}`).toBe(false);
    }
  });

  it('a pipe brings nothing of src/browser: its module needs no root', () => {
    expect(holding(output, 'BROWSER_EXTRA_MARK')).toEqual([]);
  });

  it('a module with pipes imports nothing of @fudic/i18n, and there is no $format (criterion 9)', () => {
    expect(holding(output, '$format')).toEqual([]);
    for (const fileName of holding(output, '·TRK·')) expect(page(output, fileName)).not.toMatch(/@fudic\/i18n|\/i18n\//u);
    expect(holding(output, 'corto.format(')).not.toEqual([]);
  });
});
