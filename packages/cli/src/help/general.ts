/**
 * What `fudic` and `fudic --help` print (BUG-50 §6.1): where to start, what each command is for
 * in the user's words, the four words the rest of the help uses, and a way to the help of each
 * command. Options are not here: they belong to the command that takes them.
 */

import { VERSION } from '../version.js';

export const GENERAL_HELP = `fudic ${VERSION} — web apps from .fud components on Declarative Shadow DOM

Usage: fudic <command> [options]

Start
  new <name>                      create an app
  new <name> --workspace          create a workspace: several apps and libraries in one repo

Add to a project
  generate component <name>       a component in its own folder, with its unit test, spec and fixture
  generate page <route>           a page and its unit test
  generate layout <name>          a layout and its unit test
  generate app <name>             another app in the workspace
  generate lib <name>             a component library in the workspace
  generate service <name>         a service you can inject
  generate form <name>            a form and its unit test
  generate style <name>           a global stylesheet of the project
  generate snippet <file> <name>  a snippet in a file of snippets, and its unit test
  generate term <kind> <name>     a step you can use in .fudspec criteria
  add <module>                    an optional module (di, forms, http, i18n) or a library of the workspace

Run
  dev                             serve every app on one port, each under its base URL
  preview                         the same, with each app's build
  test                            run the unit tests
  spec                            run the .fudspec criteria in a browser

Maintain
  fmt [path…]                     format .fud and .fudspec files
  translate                       extract the texts to translate into src/locales/

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
