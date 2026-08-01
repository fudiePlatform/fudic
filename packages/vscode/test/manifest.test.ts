/**
 * The declarative contributions (SDD-25 §3.1, §3.2, §3.3).
 *
 * Everything asserted here is data VS Code reads directly: nothing in `src/` can fail if it
 * is wrong, and nothing in `src/` can fix it. A typo in a scope name or a default costs a
 * silent loss of behaviour that only shows up by opening the editor and noticing — which is
 * exactly the class of bug a manifest test exists to catch.
 *
 * Covers the declarative half of criteria 1, 5, 6 and 12.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readJson = (relative: string): Record<string, unknown> => {
  const text = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
  // The manifest is data, not a typed module: one cast at the boundary, and every access
  // below goes through a narrowing helper.
  return JSON.parse(text) as Record<string, unknown>;
};

const exists = (relative: string): boolean =>
  existsSync(fileURLToPath(new URL(relative, import.meta.url)));

const manifest = readJson('../package.json');
const languageConfig = readJson('../language-configuration.json');

const at = (root: unknown, ...path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null
        ? (node as Record<string | number, unknown>)[key]
        : undefined,
    root,
  );

describe('identity', () => {
  it('is the id the default formatter setting points at', () => {
    // §3.1 hardcodes `fudic.fudic-vscode` as the default formatter, and that string *is*
    // `publisher.name`. If the two ever drift, every user's `[fudic]` block silently stops
    // resolving to this extension.
    const id = `${String(manifest['publisher'])}.${String(manifest['name'])}`;
    expect(id).toBe('fudic.fudic-vscode');
    expect(at(manifest, 'contributes', 'configurationDefaults', '[fudic]', 'editor.defaultFormatter')).toBe(
      id,
    );
  });

  it('is private and targets the declared VS Code baseline', () => {
    expect(manifest['private']).toBe(true);
    expect(at(manifest, 'engines', 'vscode')).toBe('^1.90.0');
    expect(manifest['main']).toBe('./dist/extension.cjs');
  });
});

describe('activation', () => {
  it('activates on a workspace that merely contains a .fud', () => {
    // Criterion 12. Without this the extension would only wake on opening a `.fud`, and a
    // project entered through a `.ts` would have no inter-file diagnostics until then.
    expect(manifest['activationEvents']).toContain('workspaceContains:**/*.fud');
  });

  it('leaves `onLanguage:fudic` implicit', () => {
    // VS Code >=1.74 derives it from the `contributes.languages` entry, and declaring it
    // by hand is flagged as redundant by the manifest linter.
    expect(manifest['activationEvents']).not.toContain('onLanguage:fudic');
  });
});

describe('language contribution', () => {
  const language = at(manifest, 'contributes', 'languages', 0);

  it('claims .fud under the id the server and the grammar both use', () => {
    expect(at(language, 'id')).toBe('fudic');
    expect(at(language, 'extensions')).toEqual(['.fud']);
    expect(at(language, 'aliases')).toEqual(['Fudic', 'fud']);
  });

  it('points at files that exist', () => {
    // Criterion 1 in its declarative half: a manifest can reference a missing icon and VS
    // Code will just show nothing, with no error anywhere.
    expect(exists('../language-configuration.json')).toBe(true);
    expect(exists('../icons/fud-light.svg')).toBe(true);
    expect(exists('../icons/fud-dark.svg')).toBe(true);
  });
});

describe('grammar contribution', () => {
  const grammar = at(manifest, 'contributes', 'grammars', 0);

  it('registers the scope the grammar file declares', () => {
    expect(at(grammar, 'scopeName')).toBe('text.html.fudic');
    expect(exists('../syntaxes/fudic.tmLanguage.json')).toBe(true);
    expect(at(readJson('../syntaxes/fudic.tmLanguage.json'), 'scopeName')).toBe('text.html.fudic');
  });

  it('declares the three embedded languages', () => {
    // These are what make VS Code apply TypeScript and CSS behaviour — comment toggling,
    // bracket matching — inside the embedded regions.
    expect(at(grammar, 'embeddedLanguages')).toEqual({
      'source.ts': 'typescript',
      'source.css': 'css',
      'text.html': 'html',
    });
  });
});

describe('settings', () => {
  const properties = at(manifest, 'contributes', 'configuration', 'properties');

  it('contributes exactly the five settings of §3.2', () => {
    // Deliberately short. Each setting is a branch of behaviour that has to be tested; the
    // option zoo of other extensions is debt, and a sixth one must be a decision, not a
    // drift.
    expect(Object.keys(properties as object)).toEqual([
      'fudic.server.path',
      'fudic.trace.server',
      'fudic.templateDiagnostics',
      'fudic.format.enable',
      'fudic.exposeVirtualFiles',
    ]);
  });

  it('defaults to the safe end of every switch', () => {
    expect(at(properties, 'fudic.server.path', 'default')).toBe(null);
    expect(at(properties, 'fudic.trace.server', 'default')).toBe('off');
    expect(at(properties, 'fudic.trace.server', 'enum')).toEqual(['off', 'messages', 'verbose']);
    expect(at(properties, 'fudic.templateDiagnostics', 'default')).toBe(true);
    expect(at(properties, 'fudic.format.enable', 'default')).toBe(true);
    expect(at(properties, 'fudic.exposeVirtualFiles', 'default')).toBe(false);
  });
});

describe('commands', () => {
  it('contributes the four commands of §4.3 with their titles', () => {
    expect(at(manifest, 'contributes', 'commands')).toEqual([
      { command: 'fudic.restartServer', title: 'Fudic: Reiniciar el servidor de lenguaje' },
      { command: 'fudic.showVirtualFiles', title: 'Fudic: Ver ficheros virtuales' },
      { command: 'fudic.showRegistry', title: 'Fudic: Ver registro de componentes' },
      { command: 'fudic.formatDocument', title: 'Fudic: Formatear documento' },
    ]);
  });
});

describe('language configuration', () => {
  it('offers a block comment and no line comment', () => {
    // Criterion 5. There is no line comment in the grammar, so offering `//` would make
    // Ctrl+/ produce files that do not compile.
    expect(at(languageConfig, 'comments', 'blockComment')).toEqual(['@*', '*@']);
    expect(at(languageConfig, 'comments', 'lineComment')).toBeUndefined();
  });

  it('folds the directive blocks by their braces', () => {
    // Criterion 6. The markers are asserted against real lines from the corpus rather than
    // invented ones: a regex that only matches the example in someone's head is not a test.
    const start = new RegExp(String(at(languageConfig, 'folding', 'markers', 'start')));
    const end = new RegExp(String(at(languageConfig, 'folding', 'markers', 'end')));

    expect(start.test('@code {')).toBe(true);
    expect(start.test('  @server {')).toBe(true);
    expect(start.test('  @client {')).toBe(true);
    expect(start.test('@if (data.found) {')).toBe(true);
    expect(start.test('@foreach (const p of posts) {')).toBe(true);
    expect(start.test('@section nav {')).toBe(true);
    expect(end.test('}')).toBe(true);
    expect(end.test('  }')).toBe(true);
  });

  it('closes an @if before opening its else, so a fold can never run away', () => {
    // `} else {` has to read as an *end*: if it read as a start, the @if above it would
    // never be popped and its fold would swallow the rest of the file.
    const start = new RegExp(String(at(languageConfig, 'folding', 'markers', 'start')));
    const end = new RegExp(String(at(languageConfig, 'folding', 'markers', 'end')));

    expect(start.test('} else {')).toBe(false);
    expect(end.test('} else {')).toBe(true);
  });

  it('does not break a word on @ or on :', () => {
    // §3.3: double-clicking has to select `@foreach` and `class:foo` whole. Both are single
    // tokens to a reader, and a word pattern that splits them makes every rename-by-hand a
    // two-step operation.
    const word = new RegExp(String(at(languageConfig, 'wordPattern')), 'g');
    expect('@foreach (const p of posts) {'.match(word)?.[0]).toBe('@foreach');
    expect('class:success="@(tone)"'.match(word)?.[0]).toBe('class:success');
  });
});
