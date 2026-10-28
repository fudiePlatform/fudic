/**
 * SDD-60 §3.11, §4.3 and criteria 11 and 14 — the `.d.ts` and the two variants of the module
 * for every file of the project, deterministic, importing nothing of the developer's.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, emitDeclarations, emitModule } from '../../src/index.js';
import { app } from '../project.js';
import { declarationsOf, moduleOf, project } from './_project.js';

const p = project();
const IDS = Object.keys(p.sources);

describe('criterion 11: the contract of every canonical', () => {
  for (const id of IDS) {
    it(`${id}: the .d.ts and both variants`, () => {
      expect(declarationsOf(p, id)).toMatchSnapshot('d.ts');
      expect(moduleOf(p, id, 'server')).toMatchSnapshot('server');
      expect(moduleOf(p, id, 'browser')).toMatchSnapshot('browser');
    });
  }
});

describe('determinism (§4.3)', () => {
  it('the same index gives the same bytes; a fresh index of the same files too', () => {
    const again = project();
    for (const id of IDS) {
      expect(declarationsOf(again, id)).toBe(declarationsOf(p, id));
      expect(moduleOf(again, id, 'server')).toBe(moduleOf(p, id, 'server'));
      expect(moduleOf(again, id, 'browser')).toBe(moduleOf(p, id, 'browser'));
    }
  });
});

describe('criterion 14: no imports of the developer', () => {
  /** Every module specifier of a generated text. */
  const specifiers = (text: string): readonly string[] =>
    [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/gu)].map((m) => m[1]!);

  it('a generated module imports only @fudic/* and fudic:*', () => {
    for (const id of IDS) {
      for (const text of [declarationsOf(p, id), moduleOf(p, id, 'server'), moduleOf(p, id, 'browser')]) {
        for (const spec of specifiers(text)) expect(spec, `${id}: ${spec}`).toMatch(/^(?:@fudic\/(?:http|forms)\/contract|@fudic\/http\/wire(?:\/bin|\/json)?|fudic:.+)$/u);
      }
    }
  });

  it('a generated module never imports itself', () => {
    for (const id of IDS) {
      expect(specifiers(moduleOf(p, id, 'server'))).not.toContain(`fudic:${id}`);
      expect(specifiers(declarationsOf(p, id))).not.toContain(`fudic:${id}`);
    }
  });
});

describe('the variants differ only where the side does', () => {
  it('a function is fn on the server and stub in the browser', () => {
    expect(moduleOf(p, 'routes/usuarios', 'server')).toContain('export const search = fn({');
    expect(moduleOf(p, 'routes/usuarios', 'browser')).toContain('export const search = stub({');
  });

  it('a server piece is marked impossible in the browser', () => {
    expect(moduleOf(p, 'rules/forms', 'browser')).toContain('server: true, async: true, never: true');
    expect(moduleOf(p, 'rules/forms', 'server')).not.toContain('never: true');
    expect(moduleOf(p, 'routes/usuarios', 'browser')).toContain('name: "load", chain: [$global, { steps: [] }], browser: true');
  });
});

describe('a file that stands alone', () => {
  it('without a global chain, a function has only its own level', () => {
    const source = app('components/c', 'get f\n');
    const index = createApiIndex([source]);
    expect(emitModule(source, index, {}, 'server')).toContain('chain: [{ steps: [] }]');
    expect(emitDeclarations(source, index, {})).toContain('export const f: Contract<FCtx, void, void>;');
  });

  it('html is a TrustedHTML for the view and text on the wire (SDD-61 §4.7)', () => {
    const source = app('components/c', 'type Post\n  cuerpo  html\n');
    const index = createApiIndex([source]);
    expect(emitDeclarations(source, index, {})).toContain('readonly cuerpo: import("@fudic/dom").TrustedHTML');
    expect(emitModule(source, index, {}, 'server')).toContain('cuerpo: "html"');
  });
});
