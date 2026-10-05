import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSpec, type SpecFile } from '@fudic/spec';
import { beforeAll, describe, expect, it } from 'vitest';
import { benchDir, planBench, type ExecutedFixtures, type PlannedCriterion } from '../src/pages.js';
import type { BenchTarget } from '../src/target.js';

const EXAMPLE = new URL('../../../examples/basic/src/components/', import.meta.url);
const EXPECTED = new URL('./expected/app-card/', import.meta.url);

/** The example's component, at a fixed place so the expected pages are the same on every disk. */
const TARGET: BenchTarget = {
  tag: 'app-card',
  component: 'C:/proj/src/components/app-card.fud',
  spec: 'C:/proj/src/components/app-card.fudspec',
  fixture: 'C:/proj/src/components/app-card.fixture.ts',
  projectRoot: 'C:/proj',
};

function spec(source: string): SpecFile {
  return parseSpec(source).value;
}

function expected(name: string): string {
  return readFileSync(fileURLToPath(new URL(`${name}.fud`, EXPECTED)), 'utf8');
}

/** A signal as the fixture holds it, without pulling in the runtime. */
function signal<T>(value: T): (() => T) & { set(next: T): void } {
  let current = value;
  return Object.assign(() => current, { set: (next: T) => void (current = next) });
}

describe('planBench — criterion 3, the example app-card', () => {
  let fixtures: ExecutedFixtures;
  let source: SpecFile;

  beforeAll(async () => {
    // The fixture EXECUTED, as the workbench gets it: not the static reading of the validator.
    // Through a variable so the typecheck does not follow its `import type` into the `.fud`.
    const url = pathToFileURL(fileURLToPath(new URL('app-card.fixture.ts', EXAMPLE))).href;
    fixtures = ((await import(url)) as { default: ExecutedFixtures }).default;
    source = spec(readFileSync(fileURLToPath(new URL('app-card.fudspec', EXAMPLE)), 'utf8'));
  });

  it('plans three criteria, one page each, in the order of the .fudspec', () => {
    const plan = planBench({ target: TARGET, spec: source, fixtures });
    expect(plan.criteria.map((c) => [c.id, c.route, c.fixture])).toEqual([
      ['altura-minima', '/altura-minima', 'minima'],
      ['titulo-largo-visible', '/titulo-largo-visible', 'titulo-largo'],
      ['destacada-al-cambiar-variante', '/destacada-al-cambiar-variante', 'destacada'],
    ]);
    expect([...plan.files.keys()]).toEqual([
      'routes/altura-minima.fud',
      'routes/titulo-largo-visible.fud',
      'routes/destacada-al-cambiar-variante.fud',
    ]);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.criteria.every((c) => c.error === undefined)).toBe(true);
  });

  it('writes each page exactly as expected', () => {
    const plan = planBench({ target: TARGET, spec: source, fixtures });
    for (const id of ['altura-minima', 'titulo-largo-visible', 'destacada-al-cambiar-variante']) {
      expect(plan.files.get(`routes/${id}.fud`)).toBe(expected(id));
    }
  });

  it('takes the props from the executed object, not from the source', () => {
    const plan = planBench({
      target: TARGET,
      spec: source,
      fixtures: { ...fixtures, minima: { href: '/', extra: 1, title: 'A' } },
    });
    expect(plan.files.get('routes/altura-minima.fud')).toContain('const { href, extra, title } = fixtures["minima"];');
    expect(plan.files.get('routes/altura-minima.fud')).toContain('<app-card .href=@href .extra=@extra .title=@title>');
  });
});

describe('planBench — criterion 4, a criterion without props', () => {
  it('mounts the component bare, with no @code', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion bare\n  then\n    visible app-card\n'),
      fixtures: {},
    });
    expect(plan.criteria).toEqual([
      { id: 'bare', route: '/bare', fixture: null, steps: [{ block: 'then', term: 'visible', args: ['app-card'] }] },
    ]);
    expect(plan.files.get('routes/bare.fud')).toBe(expected('bare').replace('app-card · app-card', 'app-card · bare'));
    expect(plan.files.get('routes/bare.fud')).not.toContain('@code');
  });

  it('mounts it bare too when its fixture entry has no props', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion empty\n  given\n    props vacia\n'),
      fixtures: { vacia: {} },
    });
    expect(plan.criteria[0]).toEqual({ id: 'empty', route: '/empty', fixture: 'vacia', steps: [] });
    expect(plan.files.get('routes/empty.fud')).not.toContain('@code');
    expect(plan.files.get('routes/empty.fud')).toContain('    <app-card></app-card>\n');
  });

  it('opens one bare card, named after the tag, without a .fudspec (FUD0972)', () => {
    const plan = planBench({
      target: { ...TARGET, spec: null },
      spec: spec('component app-card\n\ncriterion ignored\n  then\n    visible app-card\n'),
      fixtures: {},
    });
    expect(plan.criteria).toEqual([{ id: 'app-card', route: '/app-card', fixture: null, steps: [] }]);
    expect([...plan.files]).toEqual([['routes/app-card.fud', expected('bare')]]);
    expect(plan.diagnostics).toMatchObject([{ code: 'FUD0972', severity: 'warning', file: TARGET.component }]);
  });

  it('skips a criterion without a slug', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion\n  then\n    visible app-card\n\ncriterion named\n'),
      fixtures: {},
    });
    expect(plan.criteria.map((c) => c.id)).toEqual(['named']);
  });

  it('treats a `props` with no name as no props', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion bare\n  given\n    props\n'),
      fixtures: {},
    });
    expect(plan.criteria[0]).toEqual({ id: 'bare', route: '/bare', fixture: null, steps: [] });
    expect(plan.files.get('routes/bare.fud')).not.toContain('@code');
  });
});

describe('planBench — a fixture entry it cannot mount', () => {
  const source = spec('component app-card\n\ncriterion c\n  given\n    props missing\n');

  it('ends the criterion in error, without a page, when the entry is not in the fixture', () => {
    const plan = planBench({ target: TARGET, spec: source, fixtures: { other: { title: 'x' } } });
    expect(plan.criteria).toEqual([
      { id: 'c', route: '/c', fixture: 'missing', steps: [], error: 'the fixture has no entry "missing"' },
    ]);
    expect(plan.files.size).toBe(0);
  });

  it('ends the criterion in error when the component has no fixture file', () => {
    const plan = planBench({ target: { ...TARGET, fixture: null }, spec: source, fixtures: { missing: { title: 'x' } } });
    expect(plan.criteria[0]?.error).toBe('the fixture has no entry "missing"');
    expect(plan.files.size).toBe(0);
  });
});

describe('planBench — criterion 5, a Signal prop', () => {
  const TARGET_SIGNAL: BenchTarget = {
    tag: 'signal-display',
    component: 'C:/proj/src/components/signal-display.fud',
    spec: 'C:/proj/src/components/signal-display.fudspec',
    fixture: 'C:/proj/src/components/signal-display.fixture.ts',
    projectRoot: 'C:/proj',
  };
  const source = spec(
    'component signal-display\n\n' +
      'criterion diez\n  given\n    props diez\n  then\n    text signal-display "10"\n\n' +
      'criterion mixta\n  given\n    props mixta\n\n' +
      'criterion plana\n  given\n    props plana\n',
  );
  const fixtures = {
    diez: { value: signal(10) },
    mixta: { label: 'x', value: signal({ n: [1, 2] }), note: 'y' },
    plana: { label: 'y' },
  };

  it('writes the host with the literal initial value, and the page mounts the host', () => {
    const plan = planBench({ target: TARGET_SIGNAL, spec: source, fixtures });
    expect(plan.files.get('components/bench-host-diez.fud')).toBe(
      '<link rel="component" href="C:/proj/src/components/signal-display.fud">\n' +
        '\n' +
        '@code {\n' +
        '  @client {\n' +
        '    import { signal } from "@fudic/core";\n' +
        '\n' +
        '    const value = signal(10);\n' +
        '  }\n' +
        '}\n' +
        '\n' +
        '<bench-host-diez>\n' +
        '  <template shadowrootmode="open">\n' +
        '    <signal-display .value=@value></signal-display>\n' +
        '  </template>\n' +
        '</bench-host-diez>\n',
    );
    expect(plan.files.get('routes/diez.fud')).toBe(
      '<!DOCTYPE html>\n<html>\n  <head>\n' +
        '    <link rel="component" href="C:/proj/node_modules/.fudic-bench/signal-display/components/bench-host-diez.fud">\n' +
        '    <script type="module" src="fudic:runtime"></script>\n' +
        '    <title>signal-display · diez</title>\n' +
        '  </head>\n  <body>\n' +
        '    <bench-host-diez></bench-host-diez>\n' +
        '  </body>\n</html>\n',
    );
    expect(plan.criteria[0]).toEqual({
      id: 'diez',
      route: '/diez',
      fixture: 'diez',
      steps: [{ block: 'then', term: 'text', args: ['signal-display', '10'] }],
    });
  });

  it('forwards the other props through the host, in fixture order', () => {
    const plan = planBench({ target: TARGET_SIGNAL, spec: source, fixtures });
    expect(plan.files.get('components/bench-host-mixta.fud')).toBe(
      '<link rel="component" href="C:/proj/src/components/signal-display.fud">\n' +
        '\n' +
        '@code {\n' +
        '  import fixtures from "C:/proj/src/components/signal-display.fixture";\n' +
        '  const { label, note } = fixtures["mixta"];\n' +
        '\n' +
        '  @client {\n' +
        '    import { signal } from "@fudic/core";\n' +
        '\n' +
        '    const value = signal({"n":[1,2]});\n' +
        '  }\n' +
        '}\n' +
        '\n' +
        '<bench-host-mixta>\n' +
        '  <template shadowrootmode="open">\n' +
        '    <signal-display .label=@label .value=@value .note=@note></signal-display>\n' +
        '  </template>\n' +
        '</bench-host-mixta>\n',
    );
    expect(plan.files.get('routes/mixta.fud')).toContain('<bench-host-mixta></bench-host-mixta>');
    expect(plan.files.get('routes/mixta.fud')).not.toContain('@code');
  });

  it('gives no host to a criterion of the same component without a Signal', () => {
    const plan = planBench({ target: TARGET_SIGNAL, spec: source, fixtures });
    expect(plan.files.has('components/bench-host-plana.fud')).toBe(false);
    expect(plan.files.get('routes/plana.fud')).toContain('    <signal-display .label=@label></signal-display>\n');
    expect([...plan.files.keys()]).toEqual([
      'components/bench-host-diez.fud',
      'routes/diez.fud',
      'components/bench-host-mixta.fud',
      'routes/mixta.fud',
      'routes/plana.fud',
    ]);
    expect(plan.diagnostics).toEqual([]);
  });

  it('places the host under a project root written with a trailing slash', () => {
    const plan = planBench({ target: { ...TARGET_SIGNAL, projectRoot: 'C:/proj/' }, spec: source, fixtures });
    expect(plan.files.get('routes/diez.fud')).toContain(
      'href="C:/proj/node_modules/.fudic-bench/signal-display/components/bench-host-diez.fud"',
    );
  });
});

describe('planBench — criterion 6, an initial value that is not a JSON literal', () => {
  const TARGET_SIGNAL: BenchTarget = { ...TARGET, fixture: 'C:/proj/src/components/app-card.fixture.ts' };
  const source = spec(
    'component app-card\n\ncriterion fecha\n  given\n    props fecha\n\ncriterion sana\n  given\n    props sana\n',
  );

  it.each([
    ['a function', () => 1],
    ['a date', new Date(0)],
    ['a Map', new Map([[1, 2]])],
    ['undefined', undefined],
  ])('answers FUD0974 for %s, and the criterion ends in error without pages', (_name, value) => {
    const plan = planBench({
      target: TARGET_SIGNAL,
      spec: source,
      fixtures: { fecha: { ok: signal(1), value: signal(value) }, sana: { value: signal(1) } },
    });
    expect(plan.diagnostics).toMatchObject([
      { code: 'FUD0974', severity: 'error', file: TARGET_SIGNAL.fixture },
    ]);
    expect(plan.diagnostics[0]?.message).toContain('"value"');
    expect(plan.diagnostics[0]?.message).toContain('"fecha"');
    expect(plan.criteria[0]).toEqual({
      id: 'fecha',
      route: '/fecha',
      fixture: 'fecha',
      steps: [],
      error: 'the initial value of signal prop "value" is not a JSON literal',
    });
    expect([...plan.files.keys()]).toEqual(['components/bench-host-sana.fud', 'routes/sana.fud']);
  });
});

describe('planBench — criterion 7, the steps', () => {
  it('keeps the arguments as written, and `props` is not a step', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec(
        'component app-card\n\n' +
          'criterion c\n' +
          '  given\n    props minima\n    route /blog\n' +
          '  when\n    set-attribute app-card variant "highlight"\n    click role:tab/"Tab B"\n    click role:tab\n' +
          '  then\n    min-height app-card 44\n    text app-card "two words"\n',
      ),
      fixtures: { minima: { title: 'A' } },
    });
    const criterion = plan.criteria[0] as PlannedCriterion;
    expect(criterion.steps).toEqual([
      { block: 'given', term: 'route', args: ['/blog'] },
      { block: 'when', term: 'set-attribute', args: ['app-card', 'variant', 'highlight'] },
      { block: 'when', term: 'click', args: ['role:tab/"Tab B"'] },
      { block: 'when', term: 'click', args: ['role:tab'] },
      { block: 'then', term: 'min-height', args: ['app-card', '44'] },
      { block: 'then', term: 'text', args: ['app-card', 'two words'] },
    ]);
  });

  it('normalizes a camelCase term to its file name', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion c\n  then\n    minHeight app-card 44\n'),
      fixtures: {},
    });
    expect(plan.criteria[0]?.steps).toEqual([{ block: 'then', term: 'min-height', args: ['app-card', '44'] }]);
  });
});

describe('benchDir', () => {
  it('is inside the project, under node_modules, per tag', () => {
    expect(benchDir(TARGET)).toBe('C:/proj/node_modules/.fudic-bench/app-card');
    expect(benchDir({ ...TARGET, projectRoot: '/' })).toBe('/node_modules/.fudic-bench/app-card');
  });
});
