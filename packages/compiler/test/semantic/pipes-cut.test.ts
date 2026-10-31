/**
 * SDD-71 §3.5, decision 172 and criterion 8 (the part without types): the view imports the
 * `export default` of a module of the project's folder of pipes, or a library's `pipes/*`, and
 * fixes its arguments in a `const` with literals of data. Either may be read only to the right
 * of a `|`; anywhere else it is `FUD1150` on the use.
 */

import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/types/index.js';
import { analyze, type ProjectModule, type SemanticInput } from '../../src/semantic/index.js';
import { viewInput } from './_view.js';

const FUD = '/app/src/routes/page.fud';
const OWN = /^FUD09[01]\d$|^FUD114\d$|^FUD115[0-3]$/u;

const PIPE_TS = "import { truncar } from 'fudic:pipes/truncar';\nexport default truncar.implement((v, { max }) => v.slice(0, max));\n";

/** The project's modules: what is under `src/pipes/` the host marks as a pipe, as the index does. */
const MODULES: Readonly<Record<string, string>> = {
  '/app/src/pipes/truncar.ts': PIPE_TS,
  '/app/src/pipes/iniciales.ts': PIPE_TS,
  '/app/src/lib/util.ts': 'export default 42;\n',
};

function host(modules: Readonly<Record<string, string>>): Pick<SemanticInput, 'readModule' | 'path'> {
  return {
    path: FUD,
    readModule(specifier, importer) {
      const parts = importer.split('/').slice(0, -1);
      for (const part of specifier.split('/')) {
        if (part === '..') parts.pop();
        else if (part !== '.') parts.push(part);
      }
      const base = parts.join('/');
      const path = [base, `${base}.ts`].find((p) => modules[p] !== undefined);
      if (path === undefined) return undefined;
      const module: ProjectModule = { path, source: modules[path]!, ...(path.includes('/src/pipes/') ? { pipe: true } : {}) };
      return module;
    },
  };
}

function source(template: string, code: string): string {
  return `@code {\n${code}\n}\n<x-a><template shadowrootmode="open">${template}</template></x-a>`;
}

/** `CODE text` of each diagnostic of the cut, with the host that reads `MODULES` unless told otherwise. */
function cut(template: string, code: string, extra: Partial<SemanticInput> = host(MODULES)): readonly string[] {
  const text = source(template, code);
  return analyze({ ...viewInput(text), ...extra })
    .diagnostics.filter((d: Diagnostic) => OWN.test(d.code))
    .map((d) => `${d.code} ${text.slice(d.span.start, d.span.end)}`);
}

const IMPORTS = `import truncar from '../pipes/truncar';
  import iniciales from '../pipes/iniciales';
  import { currency } from '@fudic/core';
  const corto = truncar({ max: 40, sufijo: '…', dentro: [1, 2], nada: null });
  const euros = currency('EUR');
  const texto = 'fudic';
  const precio = 3.5;`;

describe('a pipe of the project in the view (decision 172)', () => {
  it('the three uses of §3.5 compile: fixed in @code, to the right of a |', () => {
    expect(cut('<p>@(texto | corto)</p><p>@(texto | iniciales)</p><p>@(precio | euros)</p>', IMPORTS)).toEqual([]);
  });

  it('chained, and inside a larger expression, still to the right of a |', () => {
    expect(cut('<p>@(texto | iniciales | corto)</p><p>@((texto | corto) + "!")</p>', IMPORTS)).toEqual([]);
  });

  it('what is right of a | but no name is no pipe read: the name inside it is judged as any read', () => {
    expect(cut('<p>@(texto | 0)</p>', IMPORTS)).toEqual([]);
    expect(cut('<p>@(texto | (0 || corto))</p>', IMPORTS)).toEqual(['FUD1150 corto']);
  });

  it('painted, read a member of, or handed on, it is FUD1150 on the use (criterion 8)', () => {
    expect(cut('<p>@(corto)</p>', IMPORTS)).toEqual(['FUD1150 corto']);
    expect(cut('<p>@(truncar)</p>', IMPORTS)).toEqual(['FUD1150 truncar']);
    expect(cut('<p>@(corto.options)</p>', IMPORTS)).toEqual(['FUD1150 corto']);
    // Calling its format is a call in the view, which the view never makes (SDD-61).
    expect(cut('<p>@(iniciales.format(texto, "en"))</p>', IMPORTS)).toEqual(['FUD1140 iniciales.format']);
  });

  it('FUD1150 relates to the use it was read at', () => {
    const text = source('<p>@(corto)</p>', IMPORTS);
    const [d] = analyze({ ...viewInput(text), ...host(MODULES) }).diagnostics.filter((x) => x.code === 'FUD1150');
    expect(d!.related!.map((r) => text.slice(r.span.start, r.span.end))).toEqual(['corto']);
  });

  it('a library\'s pipes/*, by the package, needs no module read', () => {
    const code = `import truncar from '@acme/ui/pipes/truncar';
      import plano from 'ui/pipes/plano';
      const corto = truncar({ max: 3 });
      const texto = 'x';`;
    expect(cut('<p>@(texto | corto)</p><p>@(texto | plano)</p>', code, {})).toEqual([]);
    expect(cut('<p>@(corto)</p><p>@(plano)</p>', code, {})).toEqual(['FUD1150 corto', 'FUD1150 plano']);
  });
});

describe('what is not a pipe keeps the rules it had (SDD-61 §3.9)', () => {
  it('a default import from outside the folder of pipes is judged as any module', () => {
    const pipes = cut('<p>@(util)</p>', "import util from '../lib/util';");
    expect(pipes).not.toContain('FUD1150 util');
  });

  it('a named import from the folder of pipes is no pipe', () => {
    expect(cut('<p>@(String(truncar))</p>', "import { truncar } from '../pipes/truncar';")).not.toContain('FUD1150 truncar');
  });

  it('a const that calls a pipe with something that is not data is no pipe either', () => {
    const code = `import truncar from '../pipes/truncar';
      const max = Math.max(1, 2);
      const corto = truncar({ max });`;
    expect(cut('<p>@(corto)</p>', code)).not.toEqual(['FUD1150 corto']);
  });

  it('a const that is no call of an imported pipe is no pipe', () => {
    const code = `import truncar from '../pipes/truncar';
      import * as todo from '../pipes/truncar';
      const local = (x) => x;
      const a = local(1);
      const b = todo.default({ max: 1 });
      const c = 5;
      let d;`;
    for (const name of ['a', 'b', 'c']) expect(cut(`<p>@(${name})</p>`, code)).not.toContain(`FUD1150 ${name}`);
    // A `let` the view reads is FUD1150 for being a `let` (SDD-61), not for being a pipe.
    expect(cut('<p>@(d)</p>', code)).toEqual(['FUD1150 d']);
  });

  it('a bare package that is no library pipe is judged as any package: outside the catalogue', () => {
    expect(cut('<p>@(lodash)</p>', "import lodash from 'lodash';", {})).toEqual(['FUD1150 lodash']);
    expect(cut('<p>@(x | lodash)</p>', "import lodash from 'lodash';\nconst x = 1;", {})).toEqual(['FUD1150 lodash']);
  });
});

describe('a host that cannot read the module says nothing about it', () => {
  it('without readModule, or without a path, a relative import is unknown: silent', () => {
    const code = "import truncar from '../pipes/truncar';";
    expect(cut('<p>@(truncar)</p>', code, {})).toEqual([]);
    expect(cut('<p>@(truncar)</p>', code, { readModule: host(MODULES).readModule! })).toEqual([]);
  });

  it('a module the host does not find is unknown too, and so is a const that calls it', () => {
    const code = "import ghost from '../pipes/ghost';\nconst g = ghost({ a: 1 });";
    expect(cut('<p>@(ghost)</p><p>@(g)</p>', code)).toEqual([]);
  });
});
