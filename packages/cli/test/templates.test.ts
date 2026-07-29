/**
 * Acceptance criterion §6.7 — templates valid by construction. Every `.fud` template is
 * materialized with sample values and fed to the compiler. A template that does not parse,
 * that produces an error diagnostic, or that lands in the wrong document role breaks the
 * build of this repository, not a user's morning.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { parseFud } from '../src/parse.js';
import { renderTemplate, TEMPLATES, templatePath } from '../src/templates.js';

describe('templates', () => {
  for (const spec of TEMPLATES) {
    it(`${spec.file} materializes into a valid ${spec.role}`, () => {
      const source = renderTemplate(spec.file, spec.sample);
      expect(source).not.toMatch(/\{\{/u);

      const parsed = parseFud(source);
      const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
      expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
      expect(parsed.doc.type).toBe(spec.role);
    });
  }

  it('every .fud template is registered in TEMPLATES', () => {
    const onDisk = readdirSync(templatePath('.'))
      .filter((file) => file.endsWith('.fud'))
      .sort();
    expect(TEMPLATES.map((spec) => spec.file).sort()).toEqual(onDisk);
  });

  it('a missing placeholder value is a hard failure, never a {{leak}}', () => {
    expect(() => renderTemplate('component.fud', { tag: 'app-card' })).toThrow(/no value for/u);
  });
});
