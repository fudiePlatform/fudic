/**
 * `fudic g component` under a project's prefix — SDD-41 criteria 7 and 8.
 *
 * The prefix PROPOSES. It turns a bare name into a tag, it is not checked against anything,
 * and a name the author wrote with a hyphen comes through untouched.
 */

import { describe, expect, it } from 'vitest';
import { planComponent } from '../src/plans/component.js';
import { FUD_CONFIG_MALFORMED } from '@fudic/config';
import { FUD_TAG_INVALID } from '../src/diagnostics.js';
import { MemoryFs } from './helpers.js';
import type { ComponentOptions } from '../src/types.js';

const CWD = '/project';

function options(overrides: Partial<ComponentOptions> = {}): ComponentOptions {
  return { cwd: CWD, force: false, dir: 'components', wireInto: [], style: true, slot: false, ...overrides };
}

/** A project whose `fudic.json` declares `prefix`, or — for `''` — leaves the field out. */
function withPrefix(prefix: string): MemoryFs {
  const config = prefix === '' ? { id: 'shop' } : { id: 'shop', prefix };
  return new MemoryFs({ 'fudic.json': JSON.stringify(config) }, CWD);
}

describe('fudic g component, with a prefix declared', () => {
  it('expands a bare name into a tag (criterion 7)', async () => {
    const plan = await planComponent('card', options(), withPrefix('app'));

    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]?.path).toBe('components/app-card.fud');
    expect(plan.changes[0]?.contents).toContain('<app-card>');
  });

  it('respects a name that already carries a hyphen (criterion 8)', async () => {
    const plan = await planComponent('signal-counter', options(), withPrefix('app'));

    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]?.path).toBe('components/signal-counter.fud');
    expect(plan.changes[0]?.contents).toContain('<signal-counter>');
  });

  it('says nothing about a tag that departs from the prefix — it is a guide (§4.4)', async () => {
    const plan = await planComponent('signal-counter', options(), withPrefix('app'));

    expect(plan.diagnostics).toEqual([]);
    expect(plan.errors).toEqual([]);
  });
});

/**
 * A project that declares no prefix. Since SDD-44 §4.3 a piece needs a target project — a
 * directory with no `fudic.json` above it at all is not one, and that is FUD0781 — so what
 * "no prefix" means now is the field being absent from a file that is there.
 */
describe('fudic g component, with no prefix declared', () => {
  it('still demands the whole tag — the command of before SDD-41 (§4.1)', async () => {
    const plan = await planComponent('card', options(), withPrefix(''));

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_TAG_INVALID);
  });

  it('writes the tag it was handed', async () => {
    const plan = await planComponent('app-card', options(), withPrefix(''));

    expect(plan.changes[0]?.path).toBe('components/app-card.fud');
  });
});

describe('fudic g component, with a fudic.json that does not read', () => {
  it('reports it and writes nothing: the tag would not be the author"s', async () => {
    const broken = new MemoryFs({ 'fudic.json': '{"prefix":"app-"}' }, CWD);

    const plan = await planComponent('card', options(), broken);

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_CONFIG_MALFORMED);
    expect(plan.errors[0]?.file).toBe('fudic.json');
  });
});
