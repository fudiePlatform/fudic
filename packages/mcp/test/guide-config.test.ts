/**
 * SDD-84 §3.9 and criterion 36: the `config` topic is tied to what fudic reads. Every key of the
 * schema of `fudic.json`, every field of `sw.json` and the name of every `.headers` is in the page and
 * in its Spanish copy: a key added without its line here fails this test.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEADERS_FILES, projectConfigSchema } from '@fudic/config';
import { RESOURCE_RULE_FIELDS, SW_CONFIG_FIELDS } from '@fudic/vite';
import { Guide, guideDir } from '../src/guide.js';

type Schema = { readonly properties?: Readonly<Record<string, Schema>>; readonly anyOf?: readonly Schema[] };

/**
 * Every key a schema names, nested ones too. The keys of `diagnostics` are the codes of the catalogue,
 * each its own page of the guide: of them, only `warnings` is a key of the file.
 */
function keysOf(schema: Schema): string[] {
  const own = Object.entries(schema.properties ?? {}).flatMap(([key, child]) =>
    key === 'diagnostics' ? [key, 'warnings'] : [key, ...keysOf(child)],
  );
  return [...own, ...(schema.anyOf ?? []).flatMap(keysOf)];
}

const PAGES = { en: join(guideDir(), 'config.md'), es: join(guideDir(), 'es', 'config.md') };

const names = [
  ...new Set([...keysOf(projectConfigSchema() as Schema), ...SW_CONFIG_FIELDS, ...RESOURCE_RULE_FIELDS, ...Object.values(HEADERS_FILES)]),
];

describe('the config topic (criterion 36)', () => {
  it('reads the keys of the schema, nested ones included', () => {
    expect(names).toEqual(expect.arrayContaining(['id', 'guide', 'sheet', 'icon', 'serve', 'trustProxy', 'uploads', 'maxFileSize', 'warnings', 'target', 'allow']));
    expect(names).toEqual(expect.arrayContaining(['shell', 'resources', 'dev', 'pattern', 'policy', 'ttl', 'maxEntries', 'page.headers']));
    expect(names.some((name) => /^FUD\d{4}$/u.test(name))).toBe(false);
  });

  for (const [language, page] of Object.entries(PAGES)) {
    it(`names each one, between backticks, in the ${language} page`, () => {
      const text = readFileSync(page, 'utf8');
      expect(names.filter((name) => !text.includes(`\`${name}\``))).toEqual([]);
    });
  }

  it('fudic_guide answers the topic', () => {
    const result = new Guide().read('config');
    if (!('page' in result)) throw new Error('expected a page');
    expect(result.page.topic).toBe('config');
    expect(result.page.related).toEqual(expect.arrayContaining(['overview', 'pages', 'html-css']));
  });
});
