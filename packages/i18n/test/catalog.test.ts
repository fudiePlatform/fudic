import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  catalogPathOf,
  joinCatalogs,
  splitCatalog,
  mergeCatalog,
  messageKey,
  parseCatalog,
  printCatalog,
  type Catalog,
  type ExtractedMessage,
} from '../src/index.js';

const FILE = 'src/locales/en.json';

function extracted(context: string, source: string, at: number, extra: Partial<ExtractedMessage> = {}): ExtractedMessage {
  return {
    context,
    key: messageKey(context, source),
    source,
    holes: {},
    where: `src/components/${context}.fud:44`,
    at,
    ...extra,
  };
}

describe('one file per source file (§4.10)', () => {
  it('catalogPathOf: the source path under the locale folder, without src/ and the extension', () => {
    expect(catalogPathOf('src/components/app-card.fud:44')).toBe('components/app-card.json');
    expect(catalogPathOf('src/routes/blog/[slug].fud:3')).toBe('routes/blog/[slug].json');
    expect(catalogPathOf('src/services/posts.ts:25')).toBe('services/posts.json');
    expect(catalogPathOf('node_modules/@acme/ui/src/x-card.fud:1')).toBe('@acme/ui/src/x-card.json');
    expect(catalogPathOf('../../libs/ui/src/x.fud')).toBe('libs/ui/src/x.json');
  });

  it('splitCatalog and joinCatalogs: one file per source, and back to the whole', () => {
    const at = (where: string) => ({ source: 'x', where, at: 0 });
    const whole: Catalog = {
      'app-card': { a: at('src/components/app-card.fud:1'), b: { ...at('src/components/app-card.fud:2'), at: 1 } },
      'lib/x.ts': { c: at('src/lib/x.ts:9') },
    };
    const files = splitCatalog(whole);
    expect([...files.keys()]).toEqual(['components/app-card.json', 'lib/x.json']);
    expect(files.get('components/app-card.json')).toEqual({ 'app-card': whole['app-card'] });
    expect(joinCatalogs([...files.values()])).toEqual(whole);
    expect(joinCatalogs([{ k: { a: at('a') } }, { k: { b: at('b') } }])).toEqual({ k: { a: at('a'), b: at('b') } });
  });
});

describe('messageKey (§4.9)', () => {
  it('is the first 8 hex of SHA-1 over context + NUL + source', () => {
    const expected = createHash('sha1').update('app-card\0Cerrar', 'utf8').digest('hex').slice(0, 8);

    expect(messageKey('app-card', 'Cerrar')).toBe(expected);
    expect(messageKey('app-card', 'Cerrar')).toMatch(/^[0-9a-f]{8}$/u);
  });

  it('depends on the context and on the text', () => {
    expect(messageKey('app-card', 'Cerrar')).not.toBe(messageKey('app-menu', 'Cerrar'));
    expect(messageKey('app-card', 'Cerrar')).not.toBe(messageKey('app-card', 'Abrir'));
  });

  it('the NUL keeps context and text apart', () => {
    expect(messageKey('ab', 'c')).not.toBe(messageKey('a', 'bc'));
  });
});

describe('parseCatalog (FUD1023)', () => {
  const valid: Catalog = {
    'app-card': {
      a1f3c09e: { source: 'Cerrar', translation: 'Close', where: 'src/components/app-card.fud:44', at: 0 },
      '9c02b7d1': {
        source: 'Hola {name}',
        review: 'Hola',
        holes: { name: 'user.name' },
        where: 'src/components/app-card.fud:45',
        at: 1,
      },
    },
    'routes/about.fud': {},
  };

  it('reads a catalog of the right shape, with no diagnostics', () => {
    expect(parseCatalog(JSON.stringify(valid), FILE)).toEqual({ value: valid, diagnostics: [] });
  });

  it('reads the empty catalog', () => {
    expect(parseCatalog('{}', FILE)).toEqual({ value: {}, diagnostics: [] });
  });

  it.each([
    ['broken JSON (criterion 13: a trailing comma)', '{"a": {},}', 'JSON'],
    ['an array', '[]', 'it is not an object of contexts'],
    ['null', 'null', 'it is not an object of contexts'],
    ['a string', '"x"', 'it is not an object of contexts'],
    ['a context that is not an object', '{"a": []}', '"a" is not an object of messages'],
    ['a context that is null', '{"a": null}', '"a" is not an object of messages'],
    ['an entry that is not an object', '{"a": {"k": "x"}}', '"a"."k" is not an object'],
    ['an entry without source', '{"a": {"k": {"where": "w", "at": 0}}}', '"a"."k" has no string "source"'],
    ['a source that is not a string', '{"a": {"k": {"source": 1, "where": "w", "at": 0}}}', 'has no string "source"'],
    ['an entry without where', '{"a": {"k": {"source": "s", "at": 0}}}', 'has no string "where"'],
    ['an entry without at', '{"a": {"k": {"source": "s", "where": "w"}}}', 'has no integer "at"'],
    ['an at that is not an integer', '{"a": {"k": {"source": "s", "where": "w", "at": 1.5}}}', 'has no integer "at"'],
    ['an at that is a string', '{"a": {"k": {"source": "s", "where": "w", "at": "0"}}}', 'has no integer "at"'],
    ['a translation that is not a string', '{"a": {"k": {"source": "s", "translation": 1, "where": "w", "at": 0}}}', 'has a "translation" that is not a string'],
    ['a translation that is null', '{"a": {"k": {"source": "s", "translation": null, "where": "w", "at": 0}}}', 'has a "translation" that is not a string'],
    ['a review that is not a string', '{"a": {"k": {"source": "s", "review": [], "where": "w", "at": 0}}}', 'has a "review" that is not a string'],
    ['holes that are not an object', '{"a": {"k": {"source": "s", "holes": [], "where": "w", "at": 0}}}', 'has "holes" that are not an object of strings'],
    ['holes with a value that is not a string', '{"a": {"k": {"source": "s", "holes": {"x": 1}, "where": "w", "at": 0}}}', 'has "holes" that are not an object of strings'],
  ])('%s is FUD1023 on the file and the empty catalog', (_case, text, reason) => {
    const { value, diagnostics } = parseCatalog(text, FILE);

    expect(value).toEqual({});
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d?.code).toBe('FUD1023');
    expect(d?.severity).toBe('error');
    expect(d?.file).toBe(FILE);
    expect(d).not.toHaveProperty('span');
    expect(d?.message).toContain('this translation catalog cannot be read: ');
    expect(d?.message).toContain(reason);
  });

  it('one bad entry spoils the whole file', () => {
    const text = JSON.stringify({ ...valid, z: { k: { source: 's' } } });

    expect(parseCatalog(text, FILE).value).toEqual({});
  });
});

describe('printCatalog: stable text (criterion 10)', () => {
  it('sorts contexts by code unit, entries by at then key, and fields in the order of CatalogEntry', () => {
    const catalog: Catalog = {
      b: {
        k2: { at: 1, where: 'w', source: 's2' },
        k9: { at: 0, where: 'w', source: 's1' },
        k1: { at: 1, where: 'w', source: 's3' },
      },
      a: {
        k: { at: 0, where: 'w', holes: { n: 'x.n' }, review: 'r', translation: 't', source: 's' },
      },
      B: { k: { source: 'S', where: 'w', at: 0 } },
    };

    expect(printCatalog(catalog)).toBe(
      [
        '{',
        '  "B": {',
        '    "k": {',
        '      "source": "S",',
        '      "where": "w",',
        '      "at": 0',
        '    }',
        '  },',
        '  "a": {',
        '    "k": {',
        '      "source": "s",',
        '      "translation": "t",',
        '      "review": "r",',
        '      "holes": {',
        '        "n": "x.n"',
        '      },',
        '      "where": "w",',
        '      "at": 0',
        '    }',
        '  },',
        '  "b": {',
        '    "k9": {',
        '      "source": "s1",',
        '      "where": "w",',
        '      "at": 0',
        '    },',
        '    "k1": {',
        '      "source": "s3",',
        '      "where": "w",',
        '      "at": 1',
        '    },',
        '    "k2": {',
        '      "source": "s2",',
        '      "where": "w",',
        '      "at": 1',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('the empty catalog is "{}" and a newline', () => {
    expect(printCatalog({})).toBe('{}\n');
  });

  it('print → parse → print is the same text byte for byte', () => {
    const merged = mergeCatalog(
      {},
      [extracted('x', 'Uno', 1), extracted('a', 'Dos {n}', 0, { holes: { n: 'n()' } }), extracted('x', 'Tres', 0)],
      false,
    );
    const text = printCatalog(merged);

    expect(printCatalog(parseCatalog(text, FILE).value)).toBe(text);
  });

  it('two extractions of the same code give the same file', () => {
    const messages = [extracted('app-card', 'Cerrar', 0), extracted('app-card', 'Abrir', 1)];
    const once = printCatalog(mergeCatalog({}, messages, false));
    const twice = printCatalog(mergeCatalog(parseCatalog(once, FILE).value, messages, false));

    expect(twice).toBe(once);
  });
});

describe('mergeCatalog (§4.10)', () => {
  const where = 'src/components/app-card.fud:44';

  it('a new message enters the source catalog with translation = source', () => {
    const merged = mergeCatalog({}, [extracted('app-card', 'Cerrar', 0)], true);

    expect(merged).toEqual({
      'app-card': { [messageKey('app-card', 'Cerrar')]: { source: 'Cerrar', translation: 'Cerrar', where, at: 0 } },
    });
  });

  it('and the other catalogs without one', () => {
    const merged = mergeCatalog({}, [extracted('app-card', 'Cerrar', 0)], false);

    expect(merged['app-card']?.[messageKey('app-card', 'Cerrar')]).toEqual({ source: 'Cerrar', where, at: 0 });
  });

  it('a message that stays keeps translation and review, and refreshes where, holes and at', () => {
    const key = messageKey('c', 'Hola {name}');
    const previous: Catalog = {
      c: { [key]: { source: 'Hola {name}', translation: 'Hello {name}', review: 'Hola', holes: { name: 'old' }, where: 'old:1', at: 3 } },
    };

    const merged = mergeCatalog(previous, [extracted('c', 'Hola {name}', 0, { holes: { name: 'user.name' }, where: 'new:9' })], false);

    expect(merged['c']?.[key]).toEqual({
      source: 'Hola {name}',
      translation: 'Hello {name}',
      review: 'Hola',
      holes: { name: 'user.name' },
      where: 'new:9',
      at: 0,
    });
  });

  it('a message that stays in the source catalog keeps what the author wrote (a plural)', () => {
    const key = messageKey('c', '{count} mensajes');
    const plural = '{count, plural, one {# mensaje} other {# mensajes}}';
    const previous: Catalog = { c: { [key]: { source: '{count} mensajes', translation: plural, where: 'w', at: 0 } } };

    const merged = mergeCatalog(previous, [extracted('c', '{count} mensajes', 0, { holes: { count: 'count' } })], true);

    expect(merged['c']?.[key]?.translation).toBe(plural);
  });

  it('a message that stays without a translation stays without one', () => {
    const key = messageKey('c', 'Hola');
    const previous: Catalog = { c: { [key]: { source: 'Hola', where: 'w', at: 0 } } };

    expect(mergeCatalog(previous, [extracted('c', 'Hola', 0)], true)['c']?.[key]).toEqual({
      source: 'Hola',
      where: 'src/components/c.fud:44',
      at: 0,
    });
  });

  it('changed text at the same at inherits the translation, under review (criterion 11)', () => {
    const old = messageKey('app-card', 'Cerrar');
    const previous: Catalog = {
      'app-card': { [old]: { source: 'Cerrar', translation: 'Close', where, at: 0 } },
    };

    const merged = mergeCatalog(previous, [extracted('app-card', 'Cerrar panel', 0)], false);

    expect(merged).toEqual({
      'app-card': {
        [messageKey('app-card', 'Cerrar panel')]: {
          source: 'Cerrar panel',
          translation: 'Close',
          review: 'Cerrar',
          where,
          at: 0,
        },
      },
    });
  });

  it('a changed text inherits only from the same context and the same at', () => {
    const previous: Catalog = {
      a: { [messageKey('a', 'Uno')]: { source: 'Uno', translation: 'One', where: 'w', at: 0 } },
      b: { [messageKey('b', 'Dos')]: { source: 'Dos', translation: 'Two', where: 'w', at: 1 } },
    };

    const merged = mergeCatalog(previous, [extracted('a', 'Uno y medio', 1), extracted('b', 'Tres', 1)], false);

    expect(merged['a']?.[messageKey('a', 'Uno y medio')]).not.toHaveProperty('translation');
    expect(merged['b']?.[messageKey('b', 'Tres')]).toMatchObject({ translation: 'Two', review: 'Dos' });
  });

  it('one vanished message is inherited once', () => {
    const previous: Catalog = { c: { [messageKey('c', 'Viejo')]: { source: 'Viejo', translation: 'Old', where: 'w', at: 0 } } };

    const merged = mergeCatalog(previous, [extracted('c', 'Nuevo', 0), extracted('c', 'Otro', 0)], false);

    expect(merged['c']?.[messageKey('c', 'Nuevo')]).toMatchObject({ translation: 'Old', review: 'Viejo' });
    expect(merged['c']?.[messageKey('c', 'Otro')]).not.toHaveProperty('translation');
  });

  it('changed text in the source catalog does not inherit: the translation is the new text', () => {
    const previous: Catalog = {
      'app-card': { [messageKey('app-card', 'Cerrar')]: { source: 'Cerrar', translation: 'Cerrar', where, at: 0 } },
    };

    const merged = mergeCatalog(previous, [extracted('app-card', 'Cerrar panel', 0)], true);

    expect(merged['app-card']?.[messageKey('app-card', 'Cerrar panel')]).toEqual({
      source: 'Cerrar panel',
      translation: 'Cerrar panel',
      where,
      at: 0,
    });
  });

  it('changed text over an old message without translation is a plain new message, without review', () => {
    const previous: Catalog = { c: { [messageKey('c', 'Viejo')]: { source: 'Viejo', where: 'w', at: 0 } } };

    const merged = mergeCatalog(previous, [extracted('c', 'Nuevo', 0)], false);

    expect(merged['c']?.[messageKey('c', 'Nuevo')]).toEqual({ source: 'Nuevo', where: 'src/components/c.fud:44', at: 0 });
  });

  it('messages and contexts that no longer exist are dropped', () => {
    const previous: Catalog = {
      a: {
        [messageKey('a', 'Sigue')]: { source: 'Sigue', translation: 'Stays', where: 'w', at: 0 },
        [messageKey('a', 'Se va')]: { source: 'Se va', translation: 'Goes', where: 'w', at: 1 },
      },
      gone: { [messageKey('gone', 'x')]: { source: 'x', translation: 'x', where: 'w', at: 0 } },
    };

    const merged = mergeCatalog(previous, [extracted('a', 'Sigue', 0)], false);

    expect(Object.keys(merged)).toEqual(['a']);
    expect(Object.keys(merged['a']!)).toEqual([messageKey('a', 'Sigue')]);
  });

  it('the same text twice in one context is one message: the first gives where and at', () => {
    const merged = mergeCatalog(
      {},
      [extracted('c', 'Hola', 0, { where: 'first:1' }), extracted('c', 'Hola', 4, { where: 'second:2' })],
      false,
    );

    expect(merged['c']).toEqual({ [messageKey('c', 'Hola')]: { source: 'Hola', where: 'first:1', at: 0 } });
  });

  it('the same text in two contexts is two messages', () => {
    const merged = mergeCatalog({}, [extracted('a', 'Hola', 0), extracted('b', 'Hola', 0)], false);

    expect(Object.keys(merged).sort()).toEqual(['a', 'b']);
  });

  it('empty holes are omitted, and the holes it has are kept', () => {
    const merged = mergeCatalog({}, [extracted('c', 'a', 0), extracted('c', '{n}', 1, { holes: { n: 'n()' } })], false);

    expect(merged['c']?.[messageKey('c', 'a')]).not.toHaveProperty('holes');
    expect(merged['c']?.[messageKey('c', '{n}')]?.holes).toEqual({ n: 'n()' });
  });

  it('a key that only exists on the prototype is not a kept message', () => {
    const merged = mergeCatalog({ c: {} }, [{ ...extracted('c', 'x', 0), key: 'toString' }], false);

    expect(merged['c']?.['toString']).toEqual({ source: 'x', where: 'src/components/c.fud:44', at: 0 });
  });

  it('nothing extracted is the empty catalog', () => {
    expect(mergeCatalog({ c: {} }, [], true)).toEqual({});
  });
});
