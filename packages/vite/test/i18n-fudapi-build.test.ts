/**
 * SDD-74 §4.5, criteria 18–20, in a real `vite build` with `"locales": ["es", "en"]`: the
 * `fudic:<id>` of a `.fudapi` is written once per locale with its texts translated — the text of
 * each `fails` code of a function included, which the page puts on the error the one server sends
 * by its code (decision 175) — and each locale's browser root is a chunk of its own name (FUD0501).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { writeI18nProject } from './helpers/i18n-project.js';

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

/** The page of `examples/i18n`, cut to what SDD-74 adds: the form and the reserve button. */
const PAGE = `<!DOCTYPE html>
<html>
<head>
<script src="fudic:runtime"></script>
<link rel="server" href="./index.fudapi">
<title>Inicio</title>
@code {
  import { signal, task } from '@fudic/core';
  const reservar = task(reserve);
  const motivo = signal("");
  async function reservarPlaza() {
    const r = await reservar.run();
    motivo.set(r.status === "failed" ? (r.error as Error).message : "");
  }
}
</head>
<body>
<form control=@newsletter form:=@subscribe>
  <input id="email" control=@newsletter.email type="email">
  <small error=@newsletter.email></small>
  <button type="submit">Apuntarme</button>
</form>
<button type="button" @click=@reservarPlaza>Reservar plaza</button>
@if (motivo() !== "") {
  <p role="alert">@motivo()</p>
}
</body>
</html>
`;

const API = `load ssg
  alta  str

form newsletter
  email  str = ""
    required  "Escribe tu email."

post subscribe
  form newsletter

post reserve
  catches 409
  fails full 409 "Ya no quedan plazas."
`;

const SERVER = `import { load, reserve, ReserveFails, subscribe } from 'fudic:routes/index';

load.handle(() => ({ alta: 'hoy' }));
subscribe.handle(() => undefined);
reserve.handle(() => {
  throw ReserveFails.full();
});
`;

const FILES = {
  'src/routes/index.fud': PAGE,
  'src/routes/index.fudapi': API,
  'src/server/index.ts': SERVER,
  'sw.json': JSON.stringify({ shell: [] }),
  // The example's: strict, as an app has it. Without one the check infers loose options.
  'tsconfig.json': JSON.stringify({
    compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', lib: ['ES2024', 'DOM', 'DOM.Iterable'], strict: true, skipLibCheck: true, noEmit: true },
    include: ['src/**/*.ts', 'src/**/*.fud', '.fudic/api/**/*.d.ts'],
  }),
};

const EN = {
  'Escribe tu email.': 'Write your email.',
  'Ya no quedan plazas.': 'No places left.',
  Apuntarme: 'Sign me up',
  'Reservar plaza': 'Book a place',
};

async function buildOf(root: string): Promise<OutFile[]> {
  const result = (await build({
    root,
    logLevel: 'silent',
    plugins: [fudic()],
    // Written: the edge pass that compiles the server once per locale runs after a written build.
    build: { write: true, minify: false },
  })) as unknown as { output: OutFile[] };
  return result.output;
}

const code = (o: OutFile): string => String(o.type === 'chunk' ? o.code : o.source);

describe('SDD-74: the texts of a .fudapi in a two-locale build', () => {
  let output: OutFile[];
  /** Every emitted text that carries `needle`, by file name. */
  const carrying = (needle: string): string[] => output.filter((o) => code(o).includes(needle)).map((o) => o.fileName);

  let root: string;

  beforeAll(async () => {
    root = writeI18nProject({ locales: ['es', 'en'], files: FILES, catalogs: { en: EN }, installed: ['forms'] });
    output = await buildOf(root);
  }, 240000);

  it('criterion 18/20: the `required` of the form is in English for en and in Spanish for es', () => {
    const english = carrying('Write your email.');
    const spanish = carrying('Escribe tu email.');
    expect(english.length).toBeGreaterThan(0);
    expect(spanish.length).toBeGreaterThan(0);
    // No file says both: each locale's graph has its own module.
    expect(english.filter((f) => spanish.includes(f))).toEqual([]);
  });

  it('criterion 19: the browser module of each locale carries the text of `full` in its language', () => {
    const english = output.filter((o) => code(o).includes('fails: { "full": "No places left." }')).map((o) => o.fileName);
    const spanish = output.filter((o) => code(o).includes('fails: { "full": "Ya no quedan plazas." }')).map((o) => o.fileName);
    expect(english.length).toBeGreaterThan(0);
    expect(spanish.length).toBeGreaterThan(0);
    expect(english.filter((f) => spanish.includes(f))).toEqual([]);
  });

  it('criterion 19: the server sends the code and never the English text: no edge chunk says it', () => {
    // The edge pass's chunks, written beside the app. Whatever locale's server answers, the words
    // of the page are the browser's: the server holds the code and the source text only.
    const dir = join(root, '.fudic', 'edge', 'c');
    const chunks = readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(dir, f), 'utf8'));
    expect(chunks.some((s) => /full: \[409, "Ya no quedan plazas\."\]/u.test(s))).toBe(true);
    expect(chunks.some((s) => s.includes('No places left.'))).toBe(false);
  });

  it('the pages of each locale paint their own words', () => {
    const page = (locale: string): string => code(output.find((o) => o.fileName === `${locale}/index.html`)!);
    expect(page('en')).toContain('Book a place');
    expect(page('es')).toContain('Reservar plaza');
  });

  it('each locale has its own browser root, named with its locale: no two chunks share a name', () => {
    const roots = output.map((o) => o.fileName).filter((f) => f.includes('fudic-root.browser'));
    expect(roots.filter((f) => f.endsWith('.js')).map((f) => f.replace(/-[A-Za-z0-9_-]{8}\.js$/u, '')).sort()).toEqual([
      'assets/en-fudic-root.browser',
      'assets/es-fudic-root.browser',
    ]);
    const names = output.map((o) => o.fileName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('a hydration chunk keeps the locale in its path, not as a prefix', () => {
    expect(output.map((o) => o.fileName).filter((f) => /^assets\/(?:en|es)-h\//u.test(f))).toEqual([]);
  });
});
