/**
 * SDD-81 §3.7 — what the compiler is told about the forms of a linked `.fudapi`: each field by its
 * path, with its type and its `accept`, wherever the form is declared. A form nobody declares
 * (the contract check reports it) is left out rather than guessed.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiProject } from '../src/api-modules.js';

describe('ApiProject.linked — the fields of its forms (SDD-81)', () => {
  it('its own forms and those of its functions, by path; an undeclared form gives none', () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-api-fields-')).replace(/\\/gu, '/');
    mkdirSync(join(root, 'src/routes'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(
      join(root, 'src/routes/alta.fudapi'),
      'form alta\n  name  str = ""\n  avatar  file?\n  docs  file[]\n\nput save\n  form alta\n\nput other\n  form ghost\n',
    );
    writeFileSync(join(root, 'src/routes/alta.fud'), '<p>x</p>');

    const linked = new ApiProject(root).linked(`${root}/src/routes/alta.fudapi`)!;
    expect(linked.forms).toEqual(['alta', 'ghost']);
    expect(linked.fields).toEqual({ alta: { name: { type: 'str' }, avatar: { type: 'file' }, docs: { type: 'file[]' } } });
  });
});
