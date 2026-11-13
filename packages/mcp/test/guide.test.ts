/** The guide on its own: topics, codes, and where it is read from. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { explain } from '@fudic/diagnostics/explain';
import { Guide, TOPICS, guideDir } from '../src/guide.js';

describe('guideDir', () => {
  it('is guide/ beside src/ (and beside dist/ once built)', () => {
    expect(guideDir().replace(/\\/gu, '/')).toMatch(/\/packages\/mcp\/guide\/$/u);
    expect(guideDir(pathToFileURL('/pkg/dist/guide.js').href).replace(/\\/gu, '/')).toMatch(/\/pkg\/guide\/$/u);
  });
});

describe('Guide.read', () => {
  const guide = new Guide();

  it('has the ten topics, in order: config last (SDD-84 §3.9)', () => {
    expect(TOPICS).toEqual(['overview', 'workflow', 'components', 'pages', 'view', 'fudapi', 'fudspec', 'testing', 'html-css', 'config']);
  });

  it('takes a topic in any case and with spaces around', () => {
    const result = guide.read('  Components ');
    expect('page' in result && result.page.topic).toBe('components');
  });

  it('related: the topics it names between backticks, never itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fudic-guide-'));
    try {
      for (const t of TOPICS) writeFileSync(join(dir, `${t}.md`), `# ${t}\r\n`);
      writeFileSync(join(dir, 'view.md'), '# view\r\nSee `pages` and `overview`, and `view` itself; pages without backticks.\r\n');
      const own = new Guide(`${dir}/`);
      const result = own.read('view');
      if (!('page' in result)) throw new Error('expected a page');
      expect(result.page).toEqual({ topic: 'view', related: ['overview', 'pages'], body: '# view\nSee `pages` and `overview`, and `view` itself; pages without backticks.\n' });
      // Read once: a change on disk is not seen by the same guide.
      writeFileSync(join(dir, 'view.md'), 'changed');
      expect(own.read('view')).toEqual(result);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a code: its parts, its body, and the topics that name it', () => {
    const result = guide.read('fud0540');
    if (!('page' in result)) throw new Error('expected a page');
    const explained = explain('FUD0540')!;
    expect(result.page).toEqual({
      topic: 'FUD0540',
      related: TOPICS.filter((t) => readFileSync(join(guideDir(), `${t}.md`), 'utf8').includes('FUD0540')),
      body: `# FUD0540 — ${explained.title}\n**error**\n\n${explained.why}\n\n**Fix:** ${explained.fix!}\n`,
      title: explained.title,
      severity: 'error',
      why: explained.why,
      fix: explained.fix,
    });
    expect(result.page.related.length).toBeGreaterThan(0);
  });

  it('a retired code says what replaced it, and has no fix', () => {
    const result = guide.read('FUD0050');
    if (!('page' in result)) throw new Error('expected a page');
    const explained = explain('FUD0050')!;
    expect(result.page.severity).toBe('retired');
    expect(result.page.replacedBy).toBe(explained.replacedBy);
    expect(result.page).not.toHaveProperty('fix');
    expect(result.page.body).toContain(`**Replaced by:** ${explained.replacedBy!}`);
  });

  it('a TypeScript code, in any case', () => {
    const result = guide.read('ts2322');
    expect('page' in result && result.page).toMatchObject({ topic: 'TS2322', related: [] });
  });

  it.each([['FUD9999'], ['react'], ['FUD05'], ['']])('%j is not a topic: FUD1403', (asked) => {
    const result = guide.read(asked);
    if (!('error' in result)) throw new Error('expected an error');
    expect(result.error.code).toBe('FUD1403');
    expect(result.error.message).toContain(TOPICS.join(', '));
  });
});

describe('the overview explains the policy and Baseline, in both languages (SDD-83 criterion 36)', () => {
  it('the two keys of fudic.json, the comments and what to do with a FUD1524', () => {
    for (const [file, diagnostics] of [['overview.md', '## Diagnostics'], [join('es', 'overview.md'), '## Diagnósticos']] as const) {
      const text = readFileSync(join(guideDir(), file), 'utf8');
      expect(text).toContain(diagnostics);
      expect(text).toContain('## Baseline');
      expect(text).toContain('"diagnostics": {');
      expect(text).toContain('"baseline": { "target": "widely", "allow": ["popover"] }');
      expect(text).toContain('fud-disable-next-line FUD1380');
      expect(text).toContain('FUD1524');
      expect(text).toContain('@supports (field-sizing: content)');
    }
  });
});
