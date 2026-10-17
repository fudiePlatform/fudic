/**
 * BUG-50 §4.1 — the help a developer reads before running anything, and the error they read
 * after a typo. §6.1, §6.6 and §6.8 are exact: the help is interface, and a text that drifts
 * from the spec is a wrong help for whoever reads it.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { commandHelp, type Topic } from '../src/help/commands.js';
import { GENERAL_HELP } from '../src/help/general.js';
import { formatUsageError } from '../src/help/usage.js';
import { run, type RunDeps } from '../src/run.js';
import { suggestTag } from '../src/tag.js';
import { planComponent } from '../src/plans/component.js';
import { VERSION } from '../src/version.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';
import type { ComponentOptions } from '../src/types.js';

const CWD = '/project';

function deps(): RunDeps & { capture: ReturnType<typeof captureStreams>; fs: MemoryFs } {
  const fs = new MemoryFs({}, CWD);
  const capture = captureStreams();
  return { readIo: fs, writeIo: fs, runner: new RecordingRunner({}), streams: capture.streams, capture, fs };
}

/** What a command line prints, and where. */
async function output(argv: readonly string[]): Promise<{ code: number; out: string; err: string; written: readonly string[] }> {
  const d = deps();
  const code = await run(argv, d);
  return { code, out: d.capture.stdout(), err: d.capture.stderr(), written: d.fs.paths() };
}

const GENERAL = `fudic ${VERSION} — web apps from .fud components on Declarative Shadow DOM

Usage: fudic <command> [options]

Start
  new <name>                    create an app
  new <name> --workspace        create a workspace: several apps and libraries in one repo

Add to a project
  generate component <name>     a component in its own folder, with its unit test, spec and fixture
  generate page <route>         a page and its unit test
  generate layout <name>        a layout and its unit test
  generate app <name>           another app in the workspace
  generate lib <name>           a component library in the workspace
  generate service <name>       a service you can inject
  generate form <name>          a form and its unit test
  generate style <name>         a global stylesheet of the project
  generate term <kind> <name>   a step you can use in .fudspec criteria
  add <module>                  an optional module (di, forms, http, i18n) or a library of the workspace

Run
  dev                           serve every app on one port, each under its base URL
  preview                       the same, with each app's build
  test                          run the unit tests
  spec                          run the .fudspec criteria in a browser

Maintain
  fmt [path…]                   format .fud and .fudspec files
  translate                     extract the texts to translate into src/locales/

Words
  app         what you serve: it has pages and a base URL ("/", "/admin/")
  library     components your apps use; it is not served
  workspace   one repo with apps/ and libs/
  project     an app or a library; --project <name> picks one inside a workspace

Examples
  fudic new shop
  fudic new shop --workspace --app web
  fudic g lib ui
  fudic g component button --project ui

"fudic <command> --help" shows its options. g = generate.
`;

const COMPONENT = `fudic generate component <name>                         alias: fudic g c

Creates a folder under src/components with the component, its unit test, its
.fudspec criteria and their fixture.

<name>   "button" becomes <ui-button> with the project's prefix (ui-).
         A name with a hyphen, like "shop-button", is used as it is.

Options
  --project <name>   the app or library to add it to   (default: the one you are in)
  --dir <path>       another folder of the project, e.g. src/routes/blog/components
  --skip-test        no unit test
  --skip-spec        no .fudspec and no fixture
  --slot             put a <slot> in the markup
  --no-style         no <style>
  --in <file>        also link it from that page or layout; repeatable
  --dry-run          show what it would create; writes nothing
  --force            overwrite files that already exist

Examples
  fudic g component button --project ui
  fudic g c card --in src/routes/index.fud
`;

/** §6.8, from the line after the command that was typed. */
const GENERATE_TEST = `
error  fudic does not generate "test" on its own
       a component comes with its unit test:   fudic g component button
       it generates: component, page, layout, app, lib, service, form, style, term

"fudic generate --help" for more.
`;

describe('fudic · fudic --help (§6.1)', () => {
  it('prints the general help, exactly, on stdout and exits 0', async () => {
    for (const argv of [[], ['--help']]) {
      const { code, out, err } = await output(argv);
      expect(code).toBe(0);
      expect(out).toBe(GENERAL);
      expect(err).toBe('');
    }
  });

  it('is the text GENERAL_HELP exports', () => {
    expect(GENERAL_HELP).toBe(GENERAL);
  });
});

describe('fudic <command> --help (§6.6)', () => {
  it('prints the help of g component, exactly, under either spelling', async () => {
    for (const argv of [
      ['generate', 'component', '--help'],
      ['g', 'c', '--help'],
      ['g', 'component', 'button', '--help'],
      ['--help', 'g', 'c'],
    ]) {
      const { code, out, err, written } = await output(argv);
      expect(code).toBe(0);
      expect(out).toBe(COMPONENT);
      expect(err).toBe('');
      expect(written).toEqual([]);
    }
  });

  it('prints the help of the command typed before --help', () => {
    const cases: readonly (readonly [readonly string[], Topic | null])[] = [
      [['new', '--help'], 'new'],
      [['new', 'shop', '--workspace', '--help'], 'new'],
      [['g', '--help'], 'generate'],
      [['generate', '--help'], 'generate'],
      [['g', 'widget', '--help'], 'generate'],
      [['g', 'p', '--help'], 'generate page'],
      [['g', 'l', '--help'], 'generate layout'],
      [['g', 'a', '--help'], 'generate app'],
      [['g', 'lib', '--help'], 'generate lib'],
      [['g', 's', '--help'], 'generate spec'],
      [['g', 't', '--help'], 'generate term'],
      [['fmt', '--help'], 'fmt'],
      [['translate', '--help'], 'translate'],
      [['frobnicate', '--help'], null],
    ];
    for (const [argv, topic] of cases) {
      expect(parseArgs(argv), argv.join(' ')).toEqual({ kind: 'help', topic });
    }
  });

  it('prints the general help for a command that has none', async () => {
    expect((await output(['frobnicate', '--help'])).out).toBe(GENERAL);
  });

  const TOPICS: readonly Topic[] = [
    'new',
    'generate',
    'generate component',
    'generate page',
    'generate layout',
    'generate app',
    'generate lib',
    'generate spec',
    'generate term',
    'fmt',
    'translate',
  ];

  it('gives every command the same shape: usage, what it does, and two examples', () => {
    for (const topic of TOPICS) {
      const help = commandHelp(topic);
      const [head = ''] = help.split('\n');
      expect(head.startsWith(`fudic ${topic}`), topic).toBe(true);
      expect(help, topic).toMatch(/\n\nExamples\n {2}fudic .+\n {2}fudic .+\n$/u);
    }
  });

  it('puts the alias on the usage line only for a command that has one', () => {
    expect(commandHelp('generate page').split('\n')[0]).toMatch(/^fudic generate page <route> +alias: fudic g p$/u);
    expect(commandHelp('generate lib').split('\n')[0]).toBe('fudic generate lib <name>');
    expect(commandHelp('new').split('\n')[0]).toBe('fudic new <name>');
  });

  it('leaves out the sections a command has nothing for', () => {
    // `generate` takes no option of its own; `fmt` and `translate` take no argument.
    expect(commandHelp('generate')).not.toContain('Options');
    expect(commandHelp('fmt')).toContain('Options\n  --check');
    expect(commandHelp('fmt').split('\n\n')).toHaveLength(4);
    expect(commandHelp('translate').split('\n\n')).toHaveLength(4);
  });

  it('continues a long argument text under the argument, aligned', () => {
    expect(commandHelp('generate page')).toContain(
      '<route>   "about" is /about, "blog/:slug" is /blog/anything and "/" is the home page.\n          The file is',
    );
  });
});

describe('a usage error (§6.8)', () => {
  it('fudic g test button: its line, how to go on, and where the help is — exactly', async () => {
    const { code, out, err, written } = await output(['g', 'test', 'button']);
    expect(code).toBe(1);
    expect(err).toBe(GENERATE_TEST);
    expect(out).toBe('');
    expect(written).toEqual([]);
  });

  it('says the name it was given, and a name of its own without one', () => {
    const hints = (argv: readonly string[]): readonly string[] => {
      const parsed = parseArgs(argv);
      return parsed.kind === 'error' ? parsed.hints : [];
    };
    expect(hints(['g', 'test', 'card'])[0]).toBe('a component comes with its unit test:   fudic g component card');
    expect(hints(['g', 'test'])[0]).toBe('a component comes with its unit test:   fudic g component button');
  });

  it('never prints the whole help after an error', async () => {
    for (const argv of [['g'], ['frobnicate'], ['new'], ['g', 'c', 'x', '--level', '3'], ['fmt', '--quote', 'back']]) {
      const { code, out, err } = await output(argv);
      expect(code, argv.join(' ')).toBe(1);
      expect(out).toBe('');
      expect(err).not.toContain('Usage: fudic');
      expect(err).not.toContain('Options\n');
      expect(err).toMatch(/^\nerror {2}.+\n( {7}.+\n)+\n".+ --help" for more\.\n$/u);
    }
  });

  it('points an unknown command at the general help', () => {
    const parsed = parseArgs(['frobnicate']);
    expect(parsed.kind === 'error' && formatUsageError(parsed)).toBe(
      '\nerror  unknown command "frobnicate"\n       the commands are: new, generate (g), add, dev, preview, test, spec, fmt, translate\n\n"fudic --help" for more.\n',
    );
  });

  /** The message, the lines under it and the help it points at, for one command line. */
  function usage(argv: readonly string[]): { message: string; hints: readonly string[]; topic: Topic | null } {
    const parsed = parseArgs(argv);
    if (parsed.kind !== 'error') throw new Error(`${argv.join(' ')} parsed as ${parsed.kind}`);
    return { message: parsed.error.message, hints: parsed.hints, topic: parsed.topic };
  }

  it('gives every usage error a line that says how to go on', () => {
    const cases: readonly (readonly [readonly string[], Topic | null, string, string])[] = [
      [['g', 'c', 'x', '--dir'], 'generate component', 'flag --dir needs a value', 'write it as --dir <value>'],
      [['frobnicate', '--cwd'], null, 'flag --cwd needs a value', 'write it as --cwd <value>'],
      [['fmt', '--quote', 'back'], 'fmt', 'unknown quote style "back"', 'use --quote double or --quote single'],
      [['fmt', '--end-of-line', 'cr'], 'fmt', 'unknown line terminator "cr"', 'use --end-of-line lf, crlf or auto'],
      [['fmt', '--print-width', 'wide'], 'fmt', '--print-width needs a number', 'e.g. --print-width 100'],
      [['fmt', '--tab-width', 'x'], 'fmt', '--tab-width needs a number', 'e.g. --tab-width 2'],
      [['translate', 'es'], 'translate', 'fudic translate takes no argument: "es"', 'it translates the app you are in, or the one --project names'],
      [['new'], 'new', 'fudic new needs a project name', 'e.g. fudic new shop'],
      [['new', 'shop', '--pm', 'bun'], 'new', 'unknown package manager "bun"', 'use --pm pnpm, npm or yarn'],
      [['g'], 'generate', 'fudic generate needs to know what to generate', 'it generates: component, page, layout, app, lib, service, form, style, term'],
      [['g', 'widget', 'x'], 'generate', 'fudic does not generate "widget"', 'it generates: component, page, layout, app, lib, service, form, style, term'],
      [['g', 'c'], 'generate component', 'fudic generate component needs a name', 'e.g. fudic g component button'],
      [['g', 'p'], 'generate page', 'fudic generate page needs a name', 'e.g. fudic g page about'],
      [['g', 'l'], 'generate layout', 'fudic generate layout needs a name', 'e.g. fudic g layout docs'],
      [['g', 'a'], 'generate app', 'fudic generate app needs a name', 'e.g. fudic g app admin'],
      [['g', 'lib'], 'generate lib', 'fudic generate lib needs a name', 'e.g. fudic g lib ui'],
      [['g', 's'], 'generate spec', 'fudic generate spec needs a name', 'e.g. fudic g spec button'],
      [['g', 't'], 'generate term', 'fudic generate term needs a name', 'e.g. fudic g term then cart-has'],
      [['g', 't', 'when'], 'generate term', 'fudic generate term needs a name', 'e.g. fudic g term when cart-has'],
    ];
    for (const [argv, topic, message, hint] of cases) {
      expect(usage(argv), argv.join(' ')).toEqual({ message: expect.stringContaining(message), hints: [hint], topic });
    }
  });

  it('resolves the type before asking for a name: g foo is an unknown type', () => {
    expect(usage(['g', 'foo']).message).toBe('fudic does not generate "foo"');
  });

  it('lists the flags the command takes under an unknown one', () => {
    const cases: readonly (readonly [readonly string[], Topic, string])[] = [
      [['g', 'c', 'x', '--zz'], 'generate component', '--project, --dir, --in, --no-style, --slot, --skip-test, --skip-spec, --dry-run, --force'],
      [['g', 'p', 'x', '--zz'], 'generate page', '--project, --dir, --layout, --no-layout, --server, --sections, --skip-test, --dry-run, --force'],
      [['g', 'l', 'x', '--zz'], 'generate layout', '--project, --dir, --sections, --no-head, --skip-test, --dry-run, --force'],
      [['g', 'a', 'x', '--zz'], 'generate app', '--dir, --id, --prefix, --no-sw, --uses, --base, --dry-run, --force'],
      [['g', 'lib', 'x', '--zz'], 'generate lib', '--dir, --prefix, --uses, --dry-run, --force'],
      [['g', 's', 'x', '--zz'], 'generate spec', '--project, --dry-run, --force'],
      [['g', 't', 'then', 'x', '--zz'], 'generate term', '--project, --param, --dry-run, --force'],
      [['fmt', '--zz'], 'fmt', '--check, --print-width, --tab-width, --use-tabs, --quote, --end-of-line, --dry-run, --force'],
      [['translate', '--zz'], 'translate', '--project, --dry-run, --force'],
      [['new', 'x', '--zz'], 'new', '--pm, --no-install, --no-git, --no-sw, --layout, --target, --id, --prefix, --workspace, --app, --uses, --dry-run, --force'],
    ];
    for (const [argv, topic, flags] of cases) {
      expect(usage(argv), argv.join(' ')).toEqual({ message: expect.stringContaining('unknown flag --zz'), hints: [`it takes: ${flags}`], topic });
    }
  });
});

describe('FUD0440 suggests a tag of the project (§6.6)', () => {
  it('builds it from the prefix, or the project\'s name when it declares none', () => {
    expect(suggestTag('ui', 'libs-ui', 'card')).toBe('ui-card');
    expect(suggestTag('ui-', 'ui', 'Card')).toBe('ui-card');
    expect(suggestTag('', 'shop', 'Big Card')).toBe('shop-big-card');
    expect(suggestTag('', '', 'card')).toBe('app-card');
    expect(suggestTag('ui', 'ui', '__')).toBe('ui-card');
  });

  const options: ComponentOptions = { cwd: CWD, force: false, dir: 'components', wireInto: [], style: true, slot: false, test: false, spec: false };

  it('says the project\'s prefix in the message', async () => {
    const fs = new MemoryFs({ 'fudic.json': JSON.stringify({ id: 'shop', prefix: 'ui' }) }, CWD);
    const plan = await planComponent('Card', options, fs);
    expect(plan.errors.map((e) => e.code)).toEqual(['FUD0440']);
    expect(plan.errors[0]?.message).toContain('(e.g. "ui-card")');
  });

  it('says the project\'s folder name when it has no prefix', async () => {
    const fs = new MemoryFs({ 'fudic.json': JSON.stringify({ id: 'shop' }) }, CWD);
    const plan = await planComponent('card', options, fs);
    expect(plan.errors[0]?.message).toContain('(e.g. "project-card")');
  });
});
