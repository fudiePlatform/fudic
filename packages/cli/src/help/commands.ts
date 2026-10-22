/**
 * The help of each command (BUG-50 §4.1, §6.6): what it does in a sentence, its arguments, its
 * options said as what they do for the user, and two examples. One record per command, rendered
 * by one function, so every help has the same shape.
 */

/** A command that has a help of its own: `fudic <topic> --help`. */
export type Topic =
  | 'new'
  | 'generate'
  | 'generate component'
  | 'generate page'
  | 'generate layout'
  | 'generate app'
  | 'generate lib'
  | 'generate service'
  | 'generate form'
  | 'generate style'
  | 'generate spec'
  | 'generate term'
  | 'generate snippet'
  | 'add'
  | 'dev'
  | 'preview'
  | 'test'
  | 'spec'
  | 'fmt'
  | 'translate';

interface CommandHelp {
  readonly usage: string;
  readonly alias?: string;
  /** Already wrapped. */
  readonly about: string;
  /** `[argument, what it is]`; a `\n` in the text continues under it. */
  readonly args: readonly (readonly [string, string])[];
  readonly options: readonly (readonly [string, string])[];
  readonly examples: readonly string[];
}

const DRY_RUN = ['--dry-run', 'show what it would create; writes nothing'] as const;
const FORCE = ['--force', 'overwrite files that already exist'] as const;
const IN_APP = ['--project <name>', 'the app to add it to   (default: the one you are in)'] as const;
const IN_PROJECT = ['--project <name>', 'the app or library to add it to   (default: the one you are in)'] as const;

const HELP: Readonly<Record<Topic, CommandHelp>> = {
  new: {
    usage: 'fudic new <name>',
    about: `Creates an app in a new folder <name>, installs its dependencies and makes the
first commit. With --workspace it creates a workspace instead: one repo with
apps/ and libs/, empty or with the app and the libraries you name.`,
    args: [['<name>', 'the folder, and the name of the app or the workspace']],
    options: [
      ['--workspace', 'a workspace: apps/ and libs/, empty unless --app or --lib'],
      ['--app <name>', 'with --workspace: its first app, served at /'],
      ['--lib <name>', 'with --workspace: a library in libs/; repeatable'],
      ['--uses <lib>', 'with --app: also create that library, used by the app; repeatable'],
      ['--id <id>', 'the identity of the app for its caches; never change it   (default: its name)'],
      ['--prefix <p>', 'what turns "button" into <p-button>   (default: the app\'s name)'],
      ['--layout <name|href>', "a name: the app's own layout   (default: _layout). An href: a library's, e.g. @shop/ui/layouts/main.fud"],
      ['--no-layout', 'no layout: the home page is a whole document'],
      ['--target <name>', 'where you deploy it   (default: static)'],
      ['--pm <pnpm|npm|yarn>', 'the package manager   (default: pnpm)'],
      ['--no-install', 'do not install the dependencies'],
      ['--no-git', 'no git repository and no first commit'],
      ['--no-sw', 'no Service Worker'],
      DRY_RUN,
    ],
    examples: ['fudic new shop', 'fudic new shop --workspace --lib ui'],
  },
  generate: {
    usage: 'fudic generate <type> <name>',
    alias: 'fudic g',
    about: `Adds a piece to a project: the app or library you are in, or the one
--project names.`,
    args: [
      ['component', 'a component in its own folder, with its unit test, spec and fixture   (c)'],
      ['page', 'a page and its unit test   (p)'],
      ['layout', 'a layout and its unit test   (l)'],
      ['app', 'another app in the workspace   (a)'],
      ['lib', 'a component library in the workspace'],
      ['service', 'a service you can inject'],
      ['form', 'a form and its unit test'],
      ['style', 'a global stylesheet of the project'],
      ['snippet', 'a snippet in a file of snippets, and its unit test'],
      ['spec', 'the .fudspec criteria of a component   (s)'],
      ['term', 'a step you can use in .fudspec criteria   (t)'],
    ],
    options: [],
    examples: ['fudic g component button --project ui', 'fudic g page about'],
  },
  'generate component': {
    usage: 'fudic generate component <name>',
    alias: 'fudic g c',
    about: `Creates a folder under src/components with the component, its unit test, its
.fudspec criteria and their fixture.`,
    args: [
      [
        '<name>',
        `"button" becomes <ui-button> with the project's prefix (ui-).
A name with a hyphen, like "shop-button", is used as it is.`,
      ],
    ],
    options: [
      IN_PROJECT,
      ['--dir <path>', 'another folder of the project, e.g. src/routes/blog/components'],
      ['--skip-test', 'no unit test'],
      ['--skip-spec', 'no .fudspec and no fixture'],
      ['--slot', 'put a <slot> in the markup'],
      ['--no-style', 'no <style>'],
      ['--in <file>', 'also link it from that page or layout; repeatable'],
      DRY_RUN,
      FORCE,
    ],
    examples: ['fudic g component button --project ui', 'fudic g c card --in src/routes/index.fud'],
  },
  'generate page': {
    usage: 'fudic generate page <route>',
    alias: 'fudic g p',
    about: `Creates the page that answers <route> under src/routes, inside the nearest
layout, and its unit test.`,
    args: [
      [
        '<route>',
        `"about" is /about, "blog/:slug" is /blog/anything and "/" is the home page.
The file is src/routes/about.fud, src/routes/blog/[slug].fud, src/routes/index.fud.`,
      ],
    ],
    options: [
      IN_APP,
      ['--dir <path>', 'another folder for the routes   (default: src/routes)'],
      ['--layout <path|href>', "this layout instead of the nearest one; a library's by its href, e.g. @shop/ui/layouts/main.fud"],
      ['--no-layout', 'a whole document of its own, with no layout'],
      ['--server', 'with a load() that reads its data on the server'],
      ['--sections <a,b>', 'fill only these sections of the layout   (default: all)'],
      ['--skip-test', 'no unit test'],
      DRY_RUN,
      FORCE,
    ],
    examples: ['fudic g page about', 'fudic g p blog/:slug --server'],
  },
  'generate layout': {
    usage: 'fudic generate layout <name>',
    alias: 'fudic g l',
    about: `Creates a layout under src/layouts, the frame the pages under it are written
into, and its unit test. In a library, the apps that use it link it by the package
name: <link rel="layout" href="@shop/ui/layouts/main.fud">.`,
    args: [['<name>', '"docs" becomes src/layouts/docs.fud']],
    options: [
      IN_PROJECT,
      ['--dir <path>', 'another folder for the layouts   (default: src/layouts)'],
      ['--sections <a,b>', 'the named sections its pages can fill'],
      ['--no-head', 'its pages cannot add to the <head>'],
      ['--skip-test', 'no unit test'],
      DRY_RUN,
      FORCE,
    ],
    examples: ['fudic g layout docs', 'fudic g l docs --sections nav,aside'],
  },
  'generate app': {
    usage: 'fudic generate app <name>',
    alias: 'fudic g a',
    about: `Creates another app in the workspace, under apps/, served at its own base URL,
and installs its dependencies.`,
    args: [['<name>', 'the folder and the name of the app']],
    options: [
      ['--base <path>', 'the URL it is served at   (default: /<name>/)'],
      ['--uses <lib>', 'a library of the workspace it uses; repeatable'],
      ['--prefix <p>', 'what turns "button" into <p-button>   (default: <name>)'],
      ['--layout <name|href>', "a name: its own layout   (default: _layout). An href: a library's, which it then uses"],
      ['--no-layout', 'no layout: the home page is a whole document'],
      ['--id <id>', 'the identity of the app for its caches; never change it   (default: <name>)'],
      ['--dir <path>', 'another folder of the workspace   (default: apps)'],
      ['--no-sw', 'no Service Worker'],
      DRY_RUN,
    ],
    examples: ['fudic g app admin --uses ui', 'fudic g app admin --layout @shop/ui/layouts/main.fud'],
  },
  'generate lib': {
    usage: 'fudic generate lib <name>',
    about: `Creates a library in the workspace, under libs/: components your apps use,
with what it needs to test them. It is not served.`,
    args: [['<name>', 'the folder and the name of the library']],
    options: [
      ['--prefix <p>', 'what turns "button" into <p-button>   (default: <name>)'],
      ['--uses <lib>', 'another library of the workspace it uses; repeatable'],
      ['--styles-only', 'a library with a global stylesheet and no components'],
      ['--dir <path>', 'another folder of the workspace   (default: libs)'],
      DRY_RUN,
    ],
    examples: ['fudic g lib ui', 'fudic g lib guia --styles-only'],
  },
  'generate service': {
    usage: 'fudic generate service <name>',
    about: `Creates a service in src/services, a class your components get with inject(), and
its unit test. It adds @fudic/di to the project if it is not there.`,
    args: [['<name>', '"cart" becomes class Cart in src/services/cart.service.ts']],
    options: [
      IN_PROJECT,
      ['--provided', 'not one for the whole app: a component provides it with provide()'],
      ['--skip-test', 'no unit test'],
      DRY_RUN,
      FORCE,
    ],
    examples: ['fudic g service cart --project web', 'fudic g service wizard --provided'],
  },
  'generate form': {
    usage: 'fudic generate form <name>',
    about: `Creates a form in src/forms, with a required name field, and its unit test. It adds
@fudic/forms to the project if it is not there.`,
    args: [['<name>', '"person" becomes personForm in src/forms/person.form.ts']],
    options: [
      IN_PROJECT,
      ['--binary', 'typed controls (str, u8, bool…): the upload travels in binary'],
      ['--skip-test', 'no unit test'],
      DRY_RUN,
      FORCE,
    ],
    examples: ['fudic g form person --project web', 'fudic g form person --binary'],
  },
  'generate style': {
    usage: 'fudic generate style <name>',
    about: `Creates <name>.css in the project and lists it in the globalStyles of fudic.json:
every component of the project adopts it, after the sheets of its libraries.`,
    args: [['<name>', 'letters, digits and _, no hyphen: "theme" becomes theme.css']],
    options: [IN_PROJECT, DRY_RUN, FORCE],
    examples: ['fudic g style ui --project ui', 'fudic g style theme'],
  },
  'generate spec': {
    usage: 'fudic generate spec <component>',
    alias: 'fudic g s',
    about: `Writes the .fudspec criteria of a component next to it, and the fixture with
the props they mount it with. A component that does not exist is created too.`,
    args: [['<component>', 'its tag, or its name without the prefix: "button" or "ui-button"']],
    options: [IN_PROJECT, DRY_RUN, FORCE],
    examples: ['fudic g spec button --project ui', 'fudic g s ui-button'],
  },
  'generate snippet': {
    usage: 'fudic generate snippet <file> <name>',
    about: `Adds a snippet to src/snippets/<file>.fud — creating the file with the first one —
and its unit test to <file>.test.ts. In a library, apps link the file by the package
name: <link rel="snippet" href="@shop/ui/snippets/ui.fud">.`,
    args: [
      ['<file>', 'the file of snippets, in kebab-case: "ui" is src/snippets/ui.fud'],
      ['<name>', 'what @render calls: letters, digits and _, e.g. "productCard"'],
    ],
    options: [
      IN_PROJECT,
      ['--dir <path>', 'another folder for the file   (default: src/snippets)'],
      ['--skip-test', 'no unit test'],
      DRY_RUN,
    ],
    examples: ['fudic g snippet ui productCard --project ui', 'fudic g snippet fields textField'],
  },
  'generate term': {
    usage: 'fudic generate term <kind> <name>',
    alias: 'fudic g t',
    about: `Writes a step of your own for .fudspec criteria in fudic/terms/<kind>/<name>.js,
for what the stock steps do not say.`,
    args: [
      ['<kind>', 'given (how it starts), when (what the user does) or then (what is checked)'],
      ['<name>', 'what the criteria write, in kebab-case: "cart-has"'],
    ],
    options: [
      ['--param <name>:<type>', 'a parameter, in order; repeatable. <type>: element, number, string, token'],
      IN_PROJECT,
      DRY_RUN,
      FORCE,
    ],
    examples: ['fudic g term then cart-has --param count:number', 'fudic g t when log-in'],
  },
  add: {
    usage: 'fudic add <module>',
    about: `Adds to a project you already have an optional module of fudic, or a library of the
workspace, and installs it.`,
    args: [
      [
        '<module>',
        `di (services), forms, http (a chain for the server functions, in src/http.ts),
i18n (translations), or the name of a library of the workspace`,
      ],
    ],
    options: [
      IN_PROJECT,
      ['--locales <a,b>', 'with i18n: the languages of the app, the first one that of the code'],
      DRY_RUN,
    ],
    examples: ['fudic add ui --project web', 'fudic add i18n --locales es,en'],
  },
  dev: {
    usage: 'fudic dev',
    about: `Serves every app of the workspace on one port, each under its base URL, while you
work on them: "/" is one app, "/admin/" another. In an app, that app alone.`,
    args: [],
    options: [
      ['--project <name>', 'only that app'],
      ['--port <n>', 'the port   (default: 5173)'],
    ],
    examples: ['fudic dev', 'fudic dev --project admin', 'fudic dev --port 3000'],
  },
  preview: {
    usage: 'fudic preview',
    about: `The same as fudic dev, with each app's build: what you would deploy. Build first
with pnpm build.`,
    args: [],
    options: [
      ['--project <name>', 'only that app'],
      ['--port <n>', 'the port   (default: 4173)'],
    ],
    examples: ['fudic preview', 'pnpm build && fudic preview', 'fudic preview --port 8080'],
  },
  test: {
    usage: 'fudic test',
    about: `Runs the unit tests (src/**/*.test.ts) of the project you are in, or of every
project from the root of the workspace.`,
    args: [],
    options: [['--project <name>', 'only that app or library']],
    examples: ['fudic test', 'fudic test --project ui'],
  },
  spec: {
    usage: 'fudic spec',
    about: `Runs the .fudspec criteria of the project you are in in a browser, or those of
every project from the root of the workspace.`,
    args: [],
    options: [['--project <name>', 'only that app or library']],
    examples: ['fudic spec', 'fudic spec --project ui'],
  },
  fmt: {
    usage: 'fudic fmt [path…]',
    about: `Formats .fud, .fudspec and .fudapi files in place: the ones under each path, or
under the folder you are in.`,
    args: [],
    options: [
      ['--check', 'write nothing; fail when a file is not formatted (for CI)'],
      ['--print-width <n>', 'the column lines wrap at   (default: 100)'],
      ['--tab-width <n>', 'spaces per indentation level   (default: 2)'],
      ['--use-tabs', 'indent with tabs'],
      ['--quote <double|single>', 'the quote around attributes   (default: double)'],
      ['--end-of-line <lf|crlf|auto>', 'the line ending   (default: lf)'],
    ],
    examples: ['fudic fmt', 'fudic fmt src --check'],
  },
  translate: {
    usage: 'fudic translate',
    about: `Extracts the texts of the app to translate into src/locales/<locale>/, one file
per source file, for each locale of fudic.json. What you translated is kept.`,
    args: [],
    options: [IN_APP],
    examples: ['fudic translate', 'fudic translate --project web'],
  },
};

/** The column the alias starts at, and the one an option's description starts at. */
const ALIAS_COLUMN = 56;
const OPTION_COLUMN = 17;

export function commandHelp(topic: Topic): string {
  const help = HELP[topic];
  const head = help.alias === undefined ? help.usage : `${help.usage.padEnd(ALIAS_COLUMN)}alias: ${help.alias}`;
  const sections = [head, help.about];

  if (help.args.length > 0) {
    const width = Math.max(...help.args.map(([name]) => name.length)) + 3;
    sections.push(help.args.map(([name, text]) => `${name.padEnd(width)}${text.split('\n').join(`\n${' '.repeat(width)}`)}`).join('\n'));
  }
  if (help.options.length > 0) {
    sections.push(['Options', ...help.options.map(([flag, text]) => `  ${flag.padEnd(OPTION_COLUMN)}  ${text}`)].join('\n'));
  }
  sections.push(['Examples', ...help.examples.map((example) => `  ${example}`)].join('\n'));
  return `${sections.join('\n\n')}\n`;
}
