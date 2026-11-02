/**
 * SDD-74 §4.5, criteria 18–20, in a real `vite build` with `"locales": ["es", "en"]`: the
 * `fudic:<id>` of a `.fudapi` is written once per locale with its texts translated, the handler
 * that throws `conflict(t(…))` is compiled once per locale too, and each locale's browser root
 * is a chunk of its own name (FUD0501).
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
    const r = await reservar.run(undefined as never);
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
`;

const SERVER = `import { conflict } from '@fudic/http';
import { t } from '@fudic/i18n';
import { load, reserve, subscribe } from 'fudic:routes/index';

load.handle(() => ({ alta: 'hoy' }));
subscribe.handle(() => undefined);
reserve.handle(() => {
  throw conflict(t('Ya no quedan plazas.'));
});
`;

const FILES = {
  'src/routes/index.fud': PAGE,
  'src/routes/index.fudapi': API,
  'src/server/index.ts': SERVER,
  'sw.json': JSON.stringify({ shell: [] }),
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

  // Not criterion 19: which of these servers answers a call is the open question of SDD-74 §4.5
  // (calls are served by the first locale's root). This only pins that each one is compiled.
  it('the handler that throws conflict(t(…)) is compiled into each locale’s edge server, with its text', () => {
    // The server's chunks are the edge pass's, written beside the app, not the browser output.
    const dir = join(root, '.fudic', 'edge', 'c');
    const servers = readdirSync(dir)
      .filter((f) => f.startsWith('server-') && f.endsWith('.js'))
      .map((f) => readFileSync(join(dir, f), 'utf8'));
    const english = servers.filter((s) => s.includes('No places left.'));
    const spanish = servers.filter((s) => s.includes('Ya no quedan plazas.'));
    expect(english).toHaveLength(1);
    expect(spanish).toHaveLength(1);
    expect(english[0]).not.toBe(spanish[0]);
    // And never in the browser: the handler is the server's.
    expect(carrying('No places left.')).toEqual([]);
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
