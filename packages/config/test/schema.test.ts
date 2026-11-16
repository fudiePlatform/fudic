/**
 * SDD-83 §3.11, criterion 34: the schema of `fudic.json` describes every key of today, completes the
 * codes of the catalogue in `diagnostics` and the web-features ids in `allow`.
 */

import { describe, expect, it } from 'vitest';
import { projectConfigSchema } from '../src/index.js';

type Node = Record<string, unknown> & { properties?: Record<string, Node>; anyOf?: Node[]; items?: Node; enum?: unknown[] };

const schema = projectConfigSchema() as Node;
const props = schema.properties!;

describe('the schema of fudic.json', () => {
  it('names every key the reader knows, and no other', () => {
    expect(Object.keys(props).sort()).toEqual(
      [
        'api', 'baseline', 'browser', 'css', 'diagnostics', 'earlyHints', 'globalStyles', 'guide', 'id', 'kind',
        'locales', 'pipes', 'prefix', 'serve', 'server', 'site', 'styles',
      ].sort(),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(props['id']!.pattern).toBe('^[a-z][a-z0-9-]*$');
  });

  it('diagnostics: each live code with its title, `warnings`, and an error only as an error', () => {
    const codes = props['diagnostics']!.properties!;
    expect(codes['FUD1380']!.description).toMatch(/\(warning by default\)$/u);
    expect(codes['FUD1380']!.enum).toEqual(['off', 'hint', 'info', 'warning', 'error']);
    expect(codes['FUD0051']!.enum).toEqual(['error']);
    expect(codes['warnings']!.enum).toContain('error');
    // A retired code is not offered.
    expect(codes['FUD0050']).toBeUndefined();
  });

  it('baseline: a level, or the object form whose allow lists the feature ids with their names', () => {
    const [level, object] = props['baseline']!.anyOf!;
    expect(level!.anyOf).toContainEqual({ enum: ['widely', 'newly'] });
    expect(level!.anyOf![1]).toMatchObject({ type: 'integer', minimum: 2015 });
    const items = object!.properties!['allow']!.items!;
    const at = items.enum!.indexOf('popover');
    expect(at).toBeGreaterThanOrEqual(0);
    expect((items['enumDescriptions'] as string[])[at]).toBe('Popover');
  });

  it('a size takes bytes or text with a unit', () => {
    const uploads = props['serve']!.properties!['uploads']!.properties!;
    const text = new RegExp((uploads['maxFileSize']!.anyOf![1] as { pattern: string }).pattern, 'u');
    expect(text.test('50mb')).toBe(true);
    expect(text.test('1.5GB')).toBe(true);
    expect(text.test('lots')).toBe(false);
    expect(uploads['maxArgs']!.anyOf).toHaveLength(2);
  });
});
