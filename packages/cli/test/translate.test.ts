/**
 * `fudic translate` (SDD-58 §3.5, §4.10; criteria 10–13): the plan that extracts every message
 * of the app and of its libraries and merges it into `src/locales/<locale>/`, one file per source
 * file, and the binary
 * that applies it, prints a line per locale and fails only on an error.
 */

import { describe, expect, it } from 'vitest';
import { compileMessage, $message } from '@fudic/i18n';
import { planTranslate } from '../src/plans/translate.js';
import { parseArgs } from '../src/args.js';
import { run, type RunDeps } from '../src/run.js';
import { apply } from '../src/apply.js';
import { MemoryFs, RecordingRunner, captureStreams } from './helpers.js';
import type { Catalog } from '@fudic/i18n';
import type { TranslateOptions, TranslatePlan } from '../src/types.js';

const CWD = '/project';
const OPTS: TranslateOptions = { cwd: CWD, force: false };
const CONFIG = JSON.stringify({ id: 'demo', kind: 'app', prefix: 'app', locales: ['es', 'en'] });

const CARD = `<app-card>
  <template shadowrootmode="open">
    <button>Cerrar</button>
    <button>Abrir</button>
  </template>
</app-card>
`;

const GREETING = `@code {
  const user = { name: 'Ana' };
}
<app-hello>
  <template shadowrootmode="open">
    <p>Hola @user.name</p>
  </template>
</app-hello>
`;

const SERVICE = `import { t } from '@fudic/i18n';
export const required = (): string => t('El nombre es obligatorio');
`;

function project(files: Readonly<Record<string, string>> = {}, config = CONFIG): MemoryFs {
  return new MemoryFs(
    {
      'fudic.json': config,
      'package.json': JSON.stringify({ name: 'demo' }),
      'src/components/app-card.fud': CARD,
      ...files,
    },
    CWD,
  );
}

async function translate(fs: MemoryFs): Promise<TranslatePlan> {
  const plan = await planTranslate(OPTS, fs);
  await apply(plan, OPTS, fs, new RecordingRunner());
  return plan;
}

/** The files of a locale's folder, by path. */
const files = (fs: MemoryFs, locale: string): string[] => fs.paths().filter((p) => p.startsWith(`src/locales/${locale}/`));

/** The whole catalog of a locale: every file of its folder, joined. */
const catalog = (fs: MemoryFs, locale: string): Catalog =>
  Object.assign({}, ...files(fs, locale).map((p) => JSON.parse(fs.at(p)) as Catalog)) as Catalog;

/** The one entry of `context` whose source is `source`. */
const entry = (fs: MemoryFs, locale: string, context: string, source: string) =>
  Object.values(catalog(fs, locale)[context] ?? {}).find((e) => e.source === source);

/** Set the translation of `source` in `locale`'s catalog, as a translator would. */
function translateTo(fs: MemoryFs, locale: string, translations: Readonly<Record<string, string>>): void {
  for (const path of files(fs, locale)) translateFile(fs, path, translations);
}

function translateFile(fs: MemoryFs, path: string, translations: Readonly<Record<string, string>>): void {
  const text = JSON.parse(fs.at(path)) as Catalog;
  const next = Object.fromEntries(
    Object.entries(text).map(([context, entries]) => [
      context,
      Object.fromEntries(
        Object.entries(entries).map(([key, e]) => [
          key,
          translations[e.source] === undefined ? e : { ...e, translation: translations[e.source] },
        ]),
      ),
    ]),
  );
  fs.write(`${CWD}/${path}`, `${JSON.stringify(next, null, 2)}\n`);
}

function deps(fs: MemoryFs): RunDeps & { capture: ReturnType<typeof captureStreams> } {
  const capture = captureStreams();
  return { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams, capture };
}

const codes = (plan: TranslatePlan): string[] => plan.diagnostics.map((d) => d.diagnostic.code);

describe('the catalogs it writes', () => {
  it('criterion 2: Cerrar and Abrir in the context app-card, at 0 and 1', async () => {
    const fs = project();
    await translate(fs);
    const card = catalog(fs, 'es')['app-card']!;
    expect(Object.values(card).map((e) => [e.source, e.at])).toEqual([
      ['Cerrar', 0],
      ['Abrir', 1],
    ]);
  });

  it('criterion 12: in the first locale every new message is translated as itself', async () => {
    const fs = project();
    await translate(fs);
    expect(entry(fs, 'es', 'app-card', 'Cerrar')?.translation).toBe('Cerrar');
    expect(entry(fs, 'en', 'app-card', 'Cerrar')?.translation).toBeUndefined();
  });

  it('where is the file, never the line, and holes keep their expression', async () => {
    const fs = project({ 'src/components/app-hello.fud': GREETING });
    await translate(fs);
    const hello = entry(fs, 'en', 'app-hello', 'Hola {name}');
    expect(hello?.where).toBe('src/components/app-hello.fud');
    // A line added above the message does not touch the catalog.
    fs.write(`${CWD}/src/components/app-hello.fud`, `\n\n${GREETING}`);
    expect((await translate(fs)).changes).toEqual([]);
    expect(hello?.holes).toEqual({ name: 'user.name' });
  });

  it('a .ts and a .js of src give their t(), and a .d.ts is not read', async () => {
    const fs = project({
      'src/lib/validation.ts': SERVICE,
      'src/lib/other.js': "import { t } from '@fudic/i18n';\nexport const x = t('Otro');\n",
      'src/types.d.ts': "declare const t: (s: string) => string;\nexport const y = t('Nunca');\n",
    });
    await translate(fs);
    expect(entry(fs, 'en', 'lib/validation.ts', 'El nombre es obligatorio')).toBeDefined();
    expect(entry(fs, 'en', 'lib/other.js', 'Otro')).toBeDefined();
    expect(JSON.stringify(catalog(fs, 'en'))).not.toContain('Nunca');
  });

  it('the .fud of a fudic library the app depends on are translated in the app’s catalog', async () => {
    const fs = project({
      'package.json': JSON.stringify({ name: 'demo', dependencies: { '@acme/ui': '*' } }),
      'node_modules/@acme/ui/package.json': JSON.stringify({ name: '@acme/ui' }),
      'node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui' }),
      'node_modules/@acme/ui/src/ui-badge.fud': '<ui-badge><template shadowrootmode="open"><b>Nuevo</b></template></ui-badge>\n',
    });
    await translate(fs);
    expect(entry(fs, 'en', 'ui-badge', 'Nuevo')).toBeDefined();
    expect(files(fs, 'en')).toContain('src/locales/en/@acme/ui/src/ui-badge.json');
  });

  it('criterion 10: twice over the same code, the same bytes, and the second plan changes nothing', async () => {
    const fs = project({ 'src/lib/validation.ts': SERVICE });
    const first = await translate(fs);
    expect(first.changes.map((c) => [c.kind, c.path])).toEqual([
      ['create', 'src/locales/es/components/app-card.json'],
      ['create', 'src/locales/es/lib/validation.json'],
      ['create', 'src/locales/en/components/app-card.json'],
      ['create', 'src/locales/en/lib/validation.json'],
    ]);
    const en = fs.at('src/locales/en/components/app-card.json');
    const second = await translate(fs);
    expect(second.changes).toEqual([]);
    expect(second.deletions).toBeUndefined();
    expect(fs.at('src/locales/en/components/app-card.json')).toBe(en);
    expect(en.endsWith('}\n')).toBe(true);
  });

  it('criterion 11: a changed text keeps its translation, to review, and the old entry goes', async () => {
    const fs = project();
    await translate(fs);
    translateTo(fs, 'en', { Cerrar: 'Close', Abrir: 'Open' });
    fs.write(`${CWD}/src/components/app-card.fud`, CARD.replace('Cerrar', 'Cerrar panel'));
    const plan = await translate(fs);
    expect(plan.changes.map((c) => c.path)).toEqual(['src/locales/es/components/app-card.json', 'src/locales/en/components/app-card.json']);
    expect(entry(fs, 'en', 'app-card', 'Cerrar panel')).toMatchObject({ translation: 'Close', review: 'Cerrar' });
    expect(entry(fs, 'en', 'app-card', 'Cerrar')).toBeUndefined();
    // In the first locale the text IS the translation: no review there.
    expect(entry(fs, 'es', 'app-card', 'Cerrar panel')).toMatchObject({ translation: 'Cerrar panel' });
    expect(entry(fs, 'es', 'app-card', 'Cerrar panel')?.review).toBeUndefined();
  });

  it('one file per source file: a change to one component touches only its catalog', async () => {
    const fs = project({ 'src/components/app-hello.fud': GREETING });
    await translate(fs);
    expect(files(fs, 'en')).toEqual(['src/locales/en/components/app-card.json', 'src/locales/en/components/app-hello.json']);
    fs.write(`${CWD}/src/components/app-hello.fud`, GREETING.replace('Hola', 'Buenas'));
    expect((await translate(fs)).changes.map((c) => c.path)).toEqual([
      'src/locales/es/components/app-hello.json',
      'src/locales/en/components/app-hello.json',
    ]);
  });

  it('the catalog of a source that no longer has a message is removed', async () => {
    const fs = project({ 'src/components/app-hello.fud': GREETING });
    await translate(fs);
    fs.remove(`${CWD}/src/components/app-hello.fud`);
    const plan = await translate(fs);
    expect(plan.deletions).toEqual(['src/locales/es/components/app-hello.json', 'src/locales/en/components/app-hello.json']);
    expect(files(fs, 'en')).toEqual(['src/locales/en/components/app-card.json']);
  });

  it('criterion 12: a plural written in the first locale’s catalog says 1 mensaje', () => {
    const plural = compileMessage('{count, plural, one {# mensaje} other {# mensajes}}', 'es');
    expect(plural.diagnostics).toEqual([]);
    expect($message(plural.value, { count: 1 }, 'es')).toBe('1 mensaje');
    expect($message(plural.value, { count: 3 }, 'es')).toBe('3 mensajes');
  });
});

describe('criterion 13: what it reports', () => {
  it('a message with no translation in en is FUD1022, a warning, on the message in its .fud', async () => {
    const fs = project();
    const plan = await planTranslate(OPTS, fs);
    const missing = plan.diagnostics.filter((d) => d.diagnostic.code === 'FUD1022');
    expect(missing).toHaveLength(2);
    expect(missing[0]!.file).toBe('src/components/app-card.fud');
    expect(missing[0]!.diagnostic.severity).toBe('warning');
    expect(CARD.slice(missing[0]!.diagnostic.span.start, missing[0]!.diagnostic.span.end)).toBe('Cerrar');
  });

  it('an empty translation is a missing one', async () => {
    const fs = project();
    await translate(fs);
    translateTo(fs, 'en', { Cerrar: '', Abrir: 'Open' });
    expect(codes(await planTranslate(OPTS, fs))).toEqual(['FUD1022']);
  });

  it('a translation without the {name} of the original is FUD1024, an error', async () => {
    const fs = project({ 'src/components/app-hello.fud': GREETING });
    await translate(fs);
    translateTo(fs, 'en', { Cerrar: 'Close', Abrir: 'Open', 'Hola {name}': 'Hello' });
    const plan = await planTranslate(OPTS, fs);
    const bad = plan.diagnostics.find((d) => d.diagnostic.code === 'FUD1024')!;
    expect(bad.file).toBe('src/components/app-hello.fud');
    expect(bad.diagnostic.severity).toBe('error');
    expect(bad.diagnostic.message).toContain('it has no holes or tags where the original has {name}');
  });

  it('a translation with invalid ICU is FUD1024, with the ICU error', async () => {
    const fs = project();
    await translate(fs);
    translateTo(fs, 'en', { Cerrar: 'Close {', Abrir: 'Open' });
    const plan = await planTranslate(OPTS, fs);
    expect(codes(plan)).toEqual(['FUD1024']);
  });

  it('holes and tags in another order are valid', async () => {
    const fs = project({
      'src/components/app-two.fud':
        "@code {\n  const user = { name: 'Ana' };\n  const count = 3;\n}\n<app-two><template shadowrootmode=\"open\"><p>Hola <b>@user.name</b>, tienes @count mensajes</p></template></app-two>\n",
    });
    await translate(fs);
    translateTo(fs, 'en', {
      Cerrar: 'Close',
      Abrir: 'Open',
      'Hola <0>{name}</0>, tienes {count} mensajes': '{count} messages for <0>{name}</0>',
    });
    expect(codes(await planTranslate(OPTS, fs))).toEqual([]);
    translateTo(fs, 'en', { 'Hola <0>{name}</0>, tienes {count} mensajes': '{count} messages for {name}' });
    const lost = (await planTranslate(OPTS, fs)).diagnostics.find((d) => d.diagnostic.code === 'FUD1024');
    expect(lost?.diagnostic.message).toContain('it has {count}, {name} where the original has {count}, {name}, <0>');
  });

  it('a catalog with a comma too many is FUD1023, and its locale is not rewritten', async () => {
    const fs = project();
    await translate(fs);
    const path = 'src/locales/en/components/app-card.json';
    fs.write(`${CWD}/${path}`, fs.at(path).replace(/\n\}\n$/u, ',\n}\n'));
    fs.write(`${CWD}/src/components/app-card.fud`, CARD.replace('Abrir', 'Abrir ya'));
    const plan = await planTranslate(OPTS, fs);
    expect(plan.errors.map((e) => [e.code, 'file' in e ? e.file : ''])).toEqual([['FUD1023', path]]);
    expect(plan.changes.some((c) => c.path.startsWith('src/locales/en/'))).toBe(false);
  });

  it('two t() with the same text and a different number of holes is FUD1025', async () => {
    const fs = project({
      'src/lib/x.ts': "import { t } from '@fudic/i18n';\nexport const a = t('Hola {name}', { name: 'a' });\nexport const b = t('Hola {name}', { name: 'a', extra: 1 });\n",
    });
    const plan = await planTranslate(OPTS, fs);
    expect(plan.diagnostics.filter((d) => d.diagnostic.code === 'FUD1025').map((d) => d.file)).toEqual(['src/lib/x.ts']);
  });

  it('a broken .fud gives what could be read, and its parse errors are not this command’s to say', async () => {
    const fs = project({
      'src/components/app-rota.fud': '<app-rota><template shadowrootmode="open"><p>Hola</p><div>@(</div></template></app-rota>\n',
      'src/lib/y.ts': "import { t } from '@fudic/i18n';\nexport const v = t(name);\n",
    });
    const plan = await planTranslate(OPTS, fs);
    expect(plan.diagnostics.filter((d) => d.file !== 'src/components/app-card.fud').map((d) => d.diagnostic.code)).toEqual(['FUD1022']);
  });

  it('an app without locales is FUD1026, and with no project at all FUD0781', async () => {
    const plan = await planTranslate(OPTS, project({}, JSON.stringify({ id: 'demo', kind: 'app' })));
    expect(plan.errors.map((e) => e.code)).toEqual(['FUD1026']);
    expect((await planTranslate(OPTS, new MemoryFs({}, CWD))).errors.map((e) => e.code)).toEqual(['FUD0781']);
  });

  it('the summary per locale: messages, new, to review and untranslated', async () => {
    const fs = project();
    expect((await translate(fs)).summary).toEqual([
      { locale: 'es', total: 2, added: 2, review: 0, missing: 0 },
      { locale: 'en', total: 2, added: 2, review: 0, missing: 2 },
    ]);
    translateTo(fs, 'en', { Cerrar: 'Close', Abrir: 'Open' });
    fs.write(`${CWD}/src/components/app-card.fud`, CARD.replace('Cerrar', 'Cerrar panel'));
    expect((await planTranslate(OPTS, fs)).summary[1]).toEqual({ locale: 'en', total: 2, added: 1, review: 1, missing: 0 });
  });
});

describe('the binary', () => {
  it('fudic translate writes the catalogs, prints a line per locale and exits 0 on warnings', async () => {
    const fs = project();
    const d = deps(fs);
    expect(await run(['translate', '--cwd', CWD], d)).toBe(0);
    expect(fs.paths()).toContain('src/locales/en/components/app-card.json');
    expect(d.capture.stdout()).toContain('  en  2 messages · 2 new · 0 to review · 2 untranslated');
    expect(d.capture.stdout()).toContain('FUD1022');
  });

  it('exits non-zero on an error, with the catalogs written all the same', async () => {
    const fs = project();
    await translate(fs);
    translateTo(fs, 'en', { Cerrar: 'Close {', Abrir: 'Open' });
    fs.write(`${CWD}/src/components/app-card.fud`, CARD.replace('Abrir', 'Abrir ya'));
    const d = deps(fs);
    expect(await run(['translate', '--cwd', CWD], d)).toBe(1);
    expect(entry(fs, 'en', 'app-card', 'Abrir ya')).toBeDefined();
  });

  it('--dry-run writes nothing and still says the summary', async () => {
    const fs = project();
    const d = deps(fs);
    expect(await run(['translate', '--cwd', CWD, '--dry-run'], d)).toBe(0);
    expect(fs.paths()).not.toContain('src/locales/en/components/app-card.json');
    expect(d.capture.stdout()).toContain('  es  2 messages');
  });

  it('an unreadable catalog stops it: exit 1, nothing written', async () => {
    const fs = project({ 'src/locales/en/x.json': '{ "x": ' });
    const d = deps(fs);
    expect(await run(['translate', '--cwd', CWD], d)).toBe(1);
    expect(fs.paths()).not.toContain('src/locales/es/components/app-card.json');
  });

  it('says what it removes, and --dry-run lists it without removing', async () => {
    const fs = project({ 'src/components/app-hello.fud': GREETING });
    await translate(fs);
    fs.remove(`${CWD}/src/components/app-hello.fud`);
    const dry = deps(fs);
    expect(await run(['translate', '--cwd', CWD, '--dry-run'], dry)).toBe(0);
    expect(dry.capture.stdout()).toContain('  delete  src/locales/en/components/app-hello.json');
    expect(fs.paths()).toContain('src/locales/en/components/app-hello.json');
    const d = deps(fs);
    expect(await run(['translate', '--cwd', CWD], d)).toBe(0);
    expect(d.capture.stdout()).toContain('  delete  src/locales/en/components/app-hello.json');
    expect(fs.paths()).not.toContain('src/locales/en/components/app-hello.json');
  });

  it('takes --project, and no argument nor any other flag', () => {
    expect(parseArgs(['translate', '--project', 'shop'])).toMatchObject({ kind: 'translate', opts: { project: 'shop' } });
    expect(parseArgs(['translate'])).toMatchObject({ kind: 'translate', opts: { cwd: '.', force: false } });
    expect(parseArgs(['translate', 'x'])).toMatchObject({ kind: 'error', error: { code: 'FUD0448' } });
    expect(parseArgs(['translate', '--check'])).toMatchObject({ kind: 'error', error: { code: 'FUD0448' } });
  });
});
