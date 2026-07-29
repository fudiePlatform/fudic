/**
 * `fudic g component` — acceptance criteria §6.2 (N1 component), §6.3 (tag validation),
 * §6.4 (wiring into a component, with idempotency) and §6.10 (collision).
 */

import { describe, expect, it } from 'vitest';
import { planComponent } from '../src/plans/component.js';
import { apply } from '../src/apply.js';
import { parseFud } from '../src/parse.js';
import { FUD_TAG_EXISTS, FUD_TAG_INVALID, FUD_TAG_RESERVED, FUD_TARGET_EXISTS } from '../src/diagnostics.js';
import { MemoryFs } from './helpers.js';
import type { ComponentOptions } from '../src/types.js';

const CWD = '/project';

function options(overrides: Partial<ComponentOptions> = {}): ComponentOptions {
  return { cwd: CWD, force: false, dir: 'components', wireInto: [], style: true, slot: false, ...overrides };
}

const CARD = `<link rel="component" href="./app-badge.fud">

@code {
  const { title } = props<{ title: string }>();
}

<head>
  <style>
    :host { display: block; }
  </style>
</head>

<app-card>
  <template shadowrootmode="open">
    <h2>@title</h2>
  </template>
</app-card>
`;

describe('g component', () => {
  it('creates an N1 component: no @code, host wrapper, one style without host=', async () => {
    const fs = new MemoryFs();
    const plan = await planComponent('app-card', options(), fs);
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toHaveLength(1);

    const change = plan.changes[0]!;
    expect(change.kind).toBe('create');
    expect(change.path).toBe('components/app-card.fud');

    const doc = parseFud(change.contents).doc;
    expect(doc.type).toBe('component-document');
    if (doc.type !== 'component-document') return;
    expect(doc.code).toBeUndefined();
    expect(doc.name).toBe('app-card');
    expect(doc.template).toBeDefined();
    expect(doc.head).toBeDefined();
    expect(change.contents).not.toContain('host=');
    expect(change.contents).not.toContain('@code');
  });

  it('--no-style drops the head, --slot emits a slot', async () => {
    const fs = new MemoryFs();
    const plan = await planComponent('app-icon', options({ style: false, slot: true }), fs);
    const contents = plan.changes[0]!.contents;
    expect(contents).not.toContain('<style>');
    expect(contents).toContain('<slot></slot>');
    expect(parseFud(contents).doc.type).toBe('component-document');
  });

  it('rejects a tag without a hyphen, writing nothing (§6.3)', async () => {
    const fs = new MemoryFs();
    const plan = await planComponent('card', options(), fs);
    expect(plan.changes).toEqual([]);
    expect(plan.errors.map((e) => e.code)).toEqual([FUD_TAG_INVALID]);
    expect(plan.errors[0]!.message).toMatch(/hyphen/u);
    await apply(plan, options(), fs);
    expect(fs.paths()).toEqual([]);
  });

  it('rejects a name reserved by the spec and a tag already in the project (§6.3)', async () => {
    const fs = new MemoryFs({ 'components/app-card.fud': CARD });
    expect((await planComponent('font-face', options(), fs)).errors.map((e) => e.code)).toEqual([FUD_TAG_RESERVED]);
    expect((await planComponent('app-card', options(), fs)).errors.map((e) => e.code)).toEqual([FUD_TAG_EXISTS]);
  });

  it('wires into a component before its @code, and is idempotent (§6.4)', async () => {
    const fs = new MemoryFs({ 'components/app-card.fud': CARD });
    const opts = options({ wireInto: ['components/app-card.fud'] });

    const plan = await planComponent('app-icon', opts, fs);
    expect(plan.errors).toEqual([]);
    const wired = plan.changes.find((change) => change.path === 'components/app-card.fud');
    expect(wired?.kind).toBe('modify');

    const contents = wired!.contents;
    expect(contents).toContain('<link rel="component" href="./app-icon.fud">');
    expect(contents.indexOf('app-icon.fud')).toBeLessThan(contents.indexOf('@code'));

    const doc = parseFud(contents).doc;
    expect(doc.type).toBe('component-document');
    expect(doc.links).toHaveLength(2);
    expect(parseFud(contents).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    // Everything but the inserted line is byte-identical: no reformatting (§5).
    expect(contents.split('\n').filter((line) => !line.includes('app-icon')).join('\n')).toBe(CARD);

    await apply(plan, opts, fs);
    expect(fs.at('components/app-card.fud')).toBe(contents);
  });

  it('wiring a link that is already there is not a modification (§6.4, idempotency)', async () => {
    // The target already links the component the command is about to create: the plan
    // creates the file and leaves the target alone — no duplicate, no diagnostic.
    const linked = `<link rel="component" href="./app-icon.fud">\n${CARD}`;
    const fs = new MemoryFs({ 'components/app-card.fud': linked });
    const plan = await planComponent('app-icon', options({ wireInto: ['components/app-card.fud'] }), fs);

    expect(plan.errors).toEqual([]);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.changes.map((change) => change.path)).toEqual(['components/app-icon.fud']);
  });

  it('a component with no links takes the link at offset 0', async () => {
    const fs = new MemoryFs({
      'components/bare.fud': '<app-bare>\n  <template shadowrootmode="open"></template>\n</app-bare>\n',
    });
    const plan = await planComponent('app-icon', options({ wireInto: ['components/bare.fud'] }), fs);
    const wired = plan.changes.find((change) => change.path === 'components/bare.fud')!;
    expect(wired.contents.startsWith('<link rel="component" href="./app-icon.fud">\n<app-bare>')).toBe(true);
  });

  it('collides on an existing FILE even when the tag is free (§6.10)', async () => {
    // The file is named after another component, so the tag `app-box` is not taken but
    // the target path is: the collision is about the path, and it must not be silent.
    const fs = new MemoryFs({
      'components/app-box.fud': '<other-tag>\n  <template shadowrootmode="open"></template>\n</other-tag>\n',
    });
    const plan = await planComponent('app-box', options(), fs);
    expect(plan.changes).toEqual([]);
    expect(plan.errors.map((e) => e.code)).toEqual([FUD_TARGET_EXISTS]);

    await apply(plan, options(), fs);
    expect(fs.paths()).toEqual(['components/app-box.fud']);

    const forced = await planComponent('app-box', options({ force: true }), fs);
    expect(forced.errors).toEqual([]);
    expect(forced.changes[0]!.kind).toBe('modify');
  });
});
