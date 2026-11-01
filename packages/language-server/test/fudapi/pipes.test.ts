/**
 * SDD-71 criterion 15 and §5, inside the `.fudapi`: completion under `pipe` and after `on`,
 * hover and definition of a pipe's types, its semantic tokens, and `pipeDefinition` — the step
 * from the implementation a view imports to the `pipe` written next to it. The view's side,
 * through the TypeScript service, is `acceptance/pipes-editor.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { MarkupContent } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { apiCompletions } from '../../src/fudapi/completion.js';
import { apiDefinition, apiHover, pipeDefinition } from '../../src/fudapi/navigation.js';
import { apiSemanticTokens } from '../../src/fudapi/semantic-tokens.js';
import { APP, FILES, ROOT, SRC, apiDocument, cursor, world } from './_api.js';

const PRIMITIVES = ['str', 'html', 'bool', 'date', 'uuid', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64'];
const TYPES = [...PRIMITIVES, 'DevOnly', 'Person', 'Role'];
const PIPES = `${SRC}/pipes`;

const labels = (marked: string): readonly string[] | undefined => {
  const { text, offset } = cursor(marked);
  const { host } = world();
  return apiCompletions(apiDocument(host, text, `${PIPES}/x.fudapi`), offset)?.items.map((i) => i.label);
};

describe('completion under pipe (criterion 15)', () => {
  it('`pipe` is a declaration at column 0', () => {
    expect(labels('|')).toContain('pipe');
  });

  it('the first word under `pipe` is `on`', () => {
    expect(labels('pipe p\n  |')).toEqual(['on']);
    expect(labels('pipe p\n  on str\n  |')).toEqual(['on']);
  });

  it('after `on`, the types — again after the first, for a union', () => {
    expect(labels('pipe p\n  on |')).toEqual(TYPES);
    expect(labels('pipe p\n  on date |')).toEqual(TYPES);
  });

  it('after a parameter name, the types', () => {
    expect(labels('pipe p\n  on str\n  max |')).toEqual(TYPES);
  });

  it('a rule\'s `on` still offers its targets, not types', () => {
    expect(labels('rule r\n  on |')).toEqual(['field', 'group', 'form']);
  });
});

describe('hover, definition and tokens of a pipe\'s names', () => {
  const marked = (m: string) => {
    const { text, offset } = cursor(m);
    const { host } = world();
    return { doc: apiDocument(host, text, `${PIPES}/x.fudapi`), offset, host, text };
  };

  it('hover over a type after `on` and of a parameter shows that type', () => {
    for (const m of ['pipe p\n  on Pers|on', 'pipe p\n  on str\n  who  Pers|on']) {
      const { doc, offset, host } = marked(m);
      expect((apiHover(doc, offset, host)?.contents as MarkupContent).value).toContain('type Person\n  name  str');
    }
  });

  it('definition of a type after `on` opens the file that declares it', () => {
    const { doc, offset, host } = marked('pipe p\n  on str Ro|le');
    const [link] = apiDefinition(doc, offset, host) ?? [];
    expect(URI.parse(link!.targetUri).path).toBe(`${SRC}/types/person.fudapi`);
  });

  it('the pipe keyword, its name as a declaration, and its types', () => {
    const text = 'pipe p\n  on Person str\n  r  Role';
    const { host } = world();
    const tokens = apiSemanticTokens(apiDocument(host, text, `${PIPES}/x.fudapi`)).map((t) => [
      text.slice(t.span.start, t.span.end),
      t.type,
      t.modifiers.join(','),
    ]);
    expect(tokens).toEqual([
      ['pipe', 'keyword', ''],
      ['p', 'function', 'declaration'],
      ['Person', 'type', ''],
      ['Role', 'enum', ''],
    ]);
  });
});

describe('pipeDefinition: from an implementation to its pipe (criterion 15)', () => {
  const CONTRACT = ['# Cuts a text at `max` characters.', 'pipe truncar', '  on str', '  max u32', ''].join('\n');
  const files: Readonly<Record<string, string | undefined>> = {
    ...FILES,
    [`${PIPES}/truncar.fudapi`]: CONTRACT,
    [`${PIPES}/truncar.ts`]: "import { truncar } from 'fudic:pipes/truncar';\n\nexport default truncar.implement((value, { max }) => value.slice(0, max));\n",
    [`${PIPES}/nombre-corto.fudapi`]: 'pipe otro\n  on str\n\npipe nombre-corto\n  on str\n',
    [`${PIPES}/nombre-corto.ts`]: "import { nombreCorto } from 'fudic:pipes/nombre-corto';\nexport default nombreCorto.implement((v) => v);\n",
    [`${PIPES}/ghost.ts`]: "import { ghost } from 'fudic:pipes/ghost';\nexport default ghost.implement((v) => v);\n",
    [`${PIPES}/ghost.fudapi`]: 'pipe other\n  on str\n',
    [`${PIPES}/lonely.ts`]: "export default lonely.implement((v) => v);\n",
    [`${PIPES}/plain.ts`]: 'export default 42;\n',
    [`${PIPES}/plain.fudapi`]: 'pipe plain\n  on str\n',
  };
  const { host } = world({ files });
  const lines = CONTRACT.split('\n');

  it('the default export of `truncar.ts` opens `pipe truncar` in `truncar.fudapi`, its name selected', () => {
    const target = pipeDefinition(host, `${PIPES}/truncar.ts`)!;
    expect(URI.parse(target.link.targetUri).path).toBe(`${PIPES}/truncar.fudapi`);
    const { start, end } = target.link.targetSelectionRange;
    expect(lines[start.line]!.slice(start.character, end.character)).toBe('truncar');
    expect(target.link.targetRange.start).toEqual({ line: 1, character: 0 });
    expect(target.signature).toBe('pipe truncar\n  on str\n  max u32');
    expect(target.doc).toBe('Cuts a text at `max` characters.');
  });

  it('a camelCase value finds its kebab-case pipe; one without documentation has none', () => {
    const target = pipeDefinition(host, `${PIPES}/nombre-corto.ts`)!;
    expect(target.signature).toBe('pipe nombre-corto\n  on str');
    expect(target).not.toHaveProperty('doc');
  });

  it('nothing for a file that is no script, implements nothing, has no contract beside it, or names no pipe of it', () => {
    expect(pipeDefinition(host, `${PIPES}/truncar.fudapi`)).toBeUndefined();
    expect(pipeDefinition(host, `${PIPES}/plain.ts`)).toBeUndefined();
    expect(pipeDefinition(host, `${PIPES}/lonely.ts`)).toBeUndefined();
    expect(pipeDefinition(host, `${PIPES}/ghost.ts`)).toBeUndefined();
    expect(pipeDefinition(host, `${PIPES}/missing.ts`)).toBeUndefined();
  });
});

describe('the pipes of a library, in the editor (SDD-71 §4.5)', () => {
  const PIPE = 'pipe iniciales\n  on str\n';
  const APP_FILES = (dependency: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> => ({
    [`${APP}/package.json`]: JSON.stringify({ name: 'app', dependencies: { '@acme/ui': '0.0.1', plain: '1.0.0' } }),
    [`${APP}/node_modules/plain/index.js`]: '',
    ...dependency,
  });
  const ids = (files: Record<string, string | undefined>): readonly string[] => {
    const { host } = world({ files });
    return host.load(`${SRC}/components/x.fudapi`, '').index.all('pipe').map((d) => `${d.source.id} ${d.decl.name.text}`);
  };

  it('an app reads the folder of pipes of each dependency, by the package', () => {
    expect(ids(APP_FILES({ [`${APP}/node_modules/@acme/ui/src/pipes/iniciales.fudapi`]: PIPE }))).toEqual(['@acme/ui/pipes/iniciales iniciales']);
  });

  it('the folder the dependency\'s fudic.json names; a broken one is the convention', () => {
    expect(
      ids(
        APP_FILES({
          [`${APP}/node_modules/@acme/ui/fudic.json`]: JSON.stringify({ kind: 'lib', pipes: 'src/format' }),
          [`${APP}/node_modules/@acme/ui/src/format/iniciales.fudapi`]: PIPE,
          [`${APP}/node_modules/@acme/ui/src/pipes/otro.fudapi`]: 'pipe otro\n  on str\n',
        }),
      ),
    ).toEqual(['@acme/ui/format/iniciales iniciales']);
    expect(
      ids(
        APP_FILES({
          [`${APP}/node_modules/@acme/ui/fudic.json`]: '{',
          [`${APP}/node_modules/@acme/ui/src/pipes/iniciales.fudapi`]: PIPE,
        }),
      ),
    ).toEqual(['@acme/ui/pipes/iniciales iniciales']);
  });

  describe('inside the library itself', () => {
    const LIB = `${ROOT}/ui`;
    const own = (files: Record<string, string | undefined>, path = `${LIB}/src/pipes/iniciales.fudapi`): string => {
      const { host } = world({ files: { [path]: PIPE, ...files } });
      return host.load(path, PIPE).source.id;
    };

    it('its own pipe carries its package name, as its apps know it', () => {
      expect(own({ [`${LIB}/fudic.json`]: JSON.stringify({ kind: 'lib' }), [`${LIB}/package.json`]: JSON.stringify({ name: '@acme/ui' }) })).toBe(
        '@acme/ui/pipes/iniciales',
      );
    });

    it('any other .fudapi of the library does not', () => {
      const files = { [`${LIB}/fudic.json`]: JSON.stringify({ kind: 'lib' }), [`${LIB}/package.json`]: JSON.stringify({ name: '@acme/ui' }) };
      expect(own(files, `${LIB}/src/types/person.fudapi`)).toBe('types/person');
    });

    it('a package.json without a name, or one being written, names nothing yet', () => {
      expect(own({ [`${LIB}/fudic.json`]: JSON.stringify({ kind: 'lib' }), [`${LIB}/package.json`]: '{}' })).toBe('pipes/iniciales');
      expect(own({ [`${LIB}/fudic.json`]: JSON.stringify({ kind: 'lib' }), [`${LIB}/package.json`]: '{' })).toBe('pipes/iniciales');
    });

    it('an app\'s pipe is its path inside src/, with no prefix', () => {
      expect(own({ [`${LIB}/fudic.json`]: JSON.stringify({ kind: 'app' }), [`${LIB}/package.json`]: JSON.stringify({ name: 'shop' }) })).toBe(
        'pipes/iniciales',
      );
    });
  });
});

describe('a library opened as a root with no package.json yet (SDD-71 §4.5)', () => {
  it('names nothing: its pipe is its path inside src/', () => {
    const lib = `${ROOT}/ui`;
    const path = `${lib}/src/pipes/iniciales.fudapi`;
    const { host } = world({ files: { [path]: 'pipe iniciales\n  on str\n', [`${lib}/fudic.json`]: JSON.stringify({ kind: 'lib' }) }, roots: [lib] });
    expect(host.load(path, 'pipe iniciales\n  on str\n').source.id).toBe('pipes/iniciales');
  });
});
