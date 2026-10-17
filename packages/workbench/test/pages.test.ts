import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSpec, type SpecFile } from '@fudic/spec';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  benchDir,
  benchRoutesDir,
  mountFiles,
  planBench,
  type ExecutedFixtures,
  type PlannedCriterion,
} from '../src/pages.js';
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

/** The folder of a workbench process, as `benchDir` names it. */
const DIR = 'C:/proj/node_modules/.fudic-bench/4242';

/** The component's bare page, which every plan carries first. */
const MOUNT = 'routes/app-card.fud';

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

  it('plans three criteria, one page each under the tag, in the order of the .fudspec', () => {
    const plan = planBench({ target: TARGET, spec: source, fixtures, dir: DIR });
    expect(plan.criteria.map((c) => [c.id, c.route, c.fixture])).toEqual([
      ['altura-minima', '/app-card/altura-minima', 'minima'],
      ['titulo-largo-visible', '/app-card/titulo-largo-visible', 'titulo-largo'],
      ['destacada-al-cambiar-variante', '/app-card/destacada-al-cambiar-variante', 'destacada'],
    ]);
    expect([...plan.files.keys()]).toEqual([
      MOUNT,
      'routes/app-card/altura-minima.fud',
      'routes/app-card/titulo-largo-visible.fud',
      'routes/app-card/destacada-al-cambiar-variante.fud',
    ]);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.criteria.every((c) => c.error === undefined)).toBe(true);
  });

  it('writes each page exactly as expected', () => {
    const plan = planBench({ target: TARGET, spec: source, fixtures, dir: DIR });
    for (const id of ['altura-minima', 'titulo-largo-visible', 'destacada-al-cambiar-variante']) {
      expect(plan.files.get(`routes/app-card/${id}.fud`)).toBe(expected(id));
    }
  });

  it('takes the props from the executed object, not from the source', () => {
    const plan = planBench({
      target: TARGET,
      spec: source,
      fixtures: { ...fixtures, minima: { href: '/', extra: 1, title: 'A' } },
      dir: DIR,
    });
    const page = plan.files.get('routes/app-card/altura-minima.fud');
    expect(page).toContain('const { href, extra, title } = fixtures["minima"];');
    expect(page).toContain('<app-card .href=@href .extra=@extra .title=@title>');
  });
});

describe('mountFiles — the bare page Vite finds at start', () => {
  it('is the component alone at /<tag>, a level above any criterion', () => {
    expect([...mountFiles(TARGET)]).toEqual([[MOUNT, expected('bare')]]);
  });

  it('cannot be a criterion page, even for a slug that starts with an underscore', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion _app-card\n  then\n    visible app-card\n'),
      fixtures: {},
      dir: DIR,
    });
    expect([...plan.files.keys()]).toEqual([MOUNT, 'routes/app-card/_app-card.fud']);
  });
});

describe('planBench — criterion 4, a criterion without props', () => {
  it('mounts the component bare, with no @code', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion bare\n  then\n    visible app-card\n'),
      fixtures: {},
      dir: DIR,
    });
    expect(plan.criteria).toEqual([
      {
        id: 'bare',
        route: '/app-card/bare',
        mount: 'body > app-card',
        offset: 20,
        fixture: null,
        // The offset of its term: `    visible` on the line after `  then`.
        steps: [{ block: 'then', term: 'visible', args: ['app-card'], offset: 46 }],
      },
    ]);
    expect(plan.files.get('routes/app-card/bare.fud')).toBe(expected('bare').replace('app-card · app-card', 'app-card · bare'));
    expect(plan.files.get('routes/app-card/bare.fud')).not.toContain('@code');
  });

  it('mounts it bare too when its fixture entry has no props', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion empty\n  given\n    props vacia\n'),
      fixtures: { vacia: {} },
      dir: DIR,
    });
    expect(plan.criteria[0]).toEqual({ id: 'empty', route: '/app-card/empty', mount: 'body > app-card', offset: 20, fixture: 'vacia', propsOffset: 48, steps: [] });
    expect(plan.files.get('routes/app-card/empty.fud')).not.toContain('@code');
    expect(plan.files.get('routes/app-card/empty.fud')).toContain('    <app-card></app-card>\n');
  });

  it('opens one bare card, named after the tag, without a .fudspec (FUD0972)', () => {
    const plan = planBench({
      target: { ...TARGET, spec: null },
      spec: spec('component app-card\n\ncriterion ignored\n  then\n    visible app-card\n'),
      fixtures: {},
      dir: DIR,
    });
    expect(plan.criteria).toEqual([{ id: 'app-card', route: '/app-card/app-card', mount: 'body > app-card', offset: 0, fixture: null, steps: [] }]);
    expect([...plan.files]).toEqual([
      [MOUNT, expected('bare')],
      ['routes/app-card/app-card.fud', expected('bare')],
    ]);
    expect(plan.diagnostics).toMatchObject([{ code: 'FUD0972', severity: 'warning', file: TARGET.component }]);
  });

  it('skips a criterion without a slug', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion\n  then\n    visible app-card\n\ncriterion named\n'),
      fixtures: {},
      dir: DIR,
    });
    expect(plan.criteria.map((c) => c.id)).toEqual(['named']);
  });

  it('treats a `props` with no name as no props', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion bare\n  given\n    props\n'),
      fixtures: {},
      dir: DIR,
    });
    expect(plan.criteria[0]).toEqual({ id: 'bare', route: '/app-card/bare', mount: 'body > app-card', offset: 20, fixture: null, propsOffset: 47, steps: [] });
    expect(plan.files.get('routes/app-card/bare.fud')).not.toContain('@code');
  });
});

describe('planBench — a fixture entry it cannot mount', () => {
  const source = spec('component app-card\n\ncriterion c\n  given\n    props missing\n');

  it('ends the criterion in error, without a page, when the entry is not in the fixture', () => {
    const plan = planBench({ target: TARGET, spec: source, fixtures: { other: { title: 'x' } }, dir: DIR });
    expect(plan.criteria).toEqual([
      { id: 'c', route: '/app-card/c', mount: 'body > app-card', offset: 20, fixture: 'missing', propsOffset: 44, steps: [], error: 'the fixture has no entry "missing"' },
    ]);
    expect([...plan.files.keys()]).toEqual([MOUNT]);
  });

  it('ends the criterion in error when the component has no fixture file', () => {
    const plan = planBench({
      target: { ...TARGET, fixture: null },
      spec: source,
      fixtures: { missing: { title: 'x' } },
      dir: DIR,
    });
    expect(plan.criteria[0]?.error).toBe('the fixture has no entry "missing"');
    expect([...plan.files.keys()]).toEqual([MOUNT]);
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

  it('writes the host with the literal initial value, and the page mounts the host from the folder', () => {
    const plan = planBench({ target: TARGET_SIGNAL, spec: source, fixtures, dir: DIR });
    expect(plan.files.get('components/signal-display/bench-host-signal-display-diez.fud')).toBe(
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
        '<bench-host-signal-display-diez>\n' +
        '  <template shadowrootmode="open">\n' +
        '    <signal-display .value=@value></signal-display>\n' +
        '  </template>\n' +
        '</bench-host-signal-display-diez>\n',
    );
    expect(plan.files.get('routes/signal-display/diez.fud')).toBe(
      '<!DOCTYPE html>\n<html>\n  <head>\n' +
        `    <link rel="component" href="${DIR}/components/signal-display/bench-host-signal-display-diez.fud">\n` +
        '    <script type="module" src="fudic:runtime"></script>\n' +
        '    <title>signal-display · diez</title>\n' +
        '  </head>\n  <body>\n' +
        '    <bench-host-signal-display-diez></bench-host-signal-display-diez>\n' +
        '  </body>\n</html>\n',
    );
    expect(plan.criteria[0]).toEqual({
      id: 'diez',
      route: '/signal-display/diez',
      mount: 'body > bench-host-signal-display-diez',
      offset: 26,
      fixture: 'diez',
      propsOffset: 53,
      steps: [{ block: 'then', term: 'text', args: ['signal-display', '10'], offset: 75 }],
    });
  });

  it('forwards the other props through the host, in fixture order', () => {
    const plan = planBench({ target: TARGET_SIGNAL, spec: source, fixtures, dir: DIR });
    expect(plan.files.get('components/signal-display/bench-host-signal-display-mixta.fud')).toBe(
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
        '<bench-host-signal-display-mixta>\n' +
        '  <template shadowrootmode="open">\n' +
        '    <signal-display .label=@label .value=@value .note=@note></signal-display>\n' +
        '  </template>\n' +
        '</bench-host-signal-display-mixta>\n',
    );
    expect(plan.files.get('routes/signal-display/mixta.fud')).toContain('<bench-host-signal-display-mixta></bench-host-signal-display-mixta>');
    expect(plan.files.get('routes/signal-display/mixta.fud')).not.toContain('@code');
  });

  it('gives no host to a criterion of the same component without a Signal', () => {
    const plan = planBench({ target: TARGET_SIGNAL, spec: source, fixtures, dir: DIR });
    expect(plan.files.has('components/signal-display/bench-host-signal-display-plana.fud')).toBe(false);
    expect(plan.files.get('routes/signal-display/plana.fud')).toContain('    <signal-display .label=@label></signal-display>\n');
    expect([...plan.files.keys()]).toEqual([
      'routes/signal-display.fud',
      'components/signal-display/bench-host-signal-display-diez.fud',
      'routes/signal-display/diez.fud',
      'components/signal-display/bench-host-signal-display-mixta.fud',
      'routes/signal-display/mixta.fud',
      'routes/signal-display/plana.fud',
    ]);
    expect(plan.diagnostics).toEqual([]);
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
      dir: DIR,
    });
    expect(plan.diagnostics).toMatchObject([
      { code: 'FUD0974', severity: 'error', file: TARGET_SIGNAL.fixture },
    ]);
    expect(plan.diagnostics[0]?.message).toContain('"value"');
    expect(plan.diagnostics[0]?.message).toContain('"fecha"');
    expect(plan.criteria[0]).toEqual({
      id: 'fecha',
      route: '/app-card/fecha',
      mount: 'body > app-card',
      offset: 20,
      fixture: 'fecha',
      propsOffset: 48,
      steps: [],
      error: 'the initial value of signal prop "value" is not a JSON literal',
    });
    expect([...plan.files.keys()]).toEqual([MOUNT, 'components/app-card/bench-host-app-card-sana.fud', 'routes/app-card/sana.fud']);
  });
});

describe('planBench — criterion 7, the steps', () => {
  it('keeps the arguments as written, and `props` is not a step', () => {
    const text =
      'component app-card\n\n' +
      'criterion c\n' +
      '  given\n    props minima\n    route /blog\n' +
      '  when\n    set-attribute app-card variant "highlight"\n    click role:tab/"Tab B"\n    click role:tab\n' +
      '  then\n    min-height app-card 44\n    text app-card "two words"\n';
    const plan = planBench({ target: TARGET, spec: spec(text), fixtures: { minima: { title: 'A' } }, dir: DIR });
    const criterion = plan.criteria[0] as PlannedCriterion;
    // Each step at the offset of its term, as written: what the shell turns into its line.
    const at = (written: string) => text.indexOf(`    ${written}\n`) + 4;
    expect(criterion.steps).toEqual([
      { block: 'given', term: 'route', args: ['/blog'], offset: at('route /blog') },
      { block: 'when', term: 'set-attribute', args: ['app-card', 'variant', 'highlight'], offset: at('set-attribute app-card variant "highlight"') },
      { block: 'when', term: 'click', args: ['role:tab/"Tab B"'], offset: at('click role:tab/"Tab B"') },
      { block: 'when', term: 'click', args: ['role:tab'], offset: at('click role:tab') },
      { block: 'then', term: 'min-height', args: ['app-card', '44'], offset: at('min-height app-card 44') },
      { block: 'then', term: 'text', args: ['app-card', 'two words'], offset: at('text app-card "two words"') },
    ]);
    expect(criterion.propsOffset).toBe(at('props minima'));
  });

  it('normalizes a camelCase term to its file name', () => {
    const plan = planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion c\n  then\n    minHeight app-card 44\n'),
      fixtures: {},
      dir: DIR,
    });
    expect(plan.criteria[0]?.steps).toEqual([{ block: 'then', term: 'min-height', args: ['app-card', '44'], offset: 43 }]);
  });
});

describe('benchDir — criterion 4, one folder per process', () => {
  it('is inside the project, under node_modules, named after the process', () => {
    expect(benchDir('C:/proj', 4242)).toBe(DIR);
    expect(benchDir('C:/proj/', 4242)).toBe(DIR);
    expect(benchDir('/', 7)).toBe('/node_modules/.fudic-bench/7');
  });

  it('is this process\'s by default, and Vite reads its routes relative to the root', () => {
    expect(benchDir('C:/proj')).toBe(`C:/proj/node_modules/.fudic-bench/${process.pid}`);
    expect(benchRoutesDir(4242)).toBe('node_modules/.fudic-bench/4242/routes');
    expect(benchRoutesDir()).toBe(`node_modules/.fudic-bench/${process.pid}/routes`);
  });
});

describe('planBench — SDD-59 §4.6, the fixture gives the component content', () => {
  const plan = (fixtures: ExecutedFixtures) =>
    planBench({
      target: TARGET,
      spec: spec('component app-card\n\ncriterion icono\n  given\n    props entrada\n'),
      fixtures,
      dir: DIR,
    });

  it('writes $content inside the host, as its children, and it is not a prop', () => {
    const page = plan({ entrada: { $content: '<span slot="icon" role="img" aria-label="star">★</span>' } }).files.get('routes/app-card/icono.fud');
    expect(page).toContain('    <app-card><span slot="icon" role="img" aria-label="star">★</span></app-card>\n');
    // The only key is the content: nothing to import, nothing to bind.
    expect(page).not.toContain('@code');
    expect(page).not.toContain('$content');
  });

  it('keeps the props as attributes beside the content', () => {
    const page = plan({ entrada: { title: 'Hi', $content: '<b>x</b>', variant: 'v' } }).files.get('routes/app-card/icono.fud')!;
    expect(page).toContain('      const { title, variant } = fixtures["entrada"];\n');
    expect(page).toContain('    <app-card .title=@title .variant=@variant><b>x</b></app-card>\n');
  });

  it('leaves the host empty without $content, as before', () => {
    expect(plan({ entrada: { title: 'Hi' } }).files.get('routes/app-card/icono.fud')).toContain('    <app-card .title=@title></app-card>\n');
  });

  it('a $content that is not a string is no content, and no prop either', () => {
    const page = plan({ entrada: { $content: 42 } }).files.get('routes/app-card/icono.fud')!;
    expect(page).toContain('    <app-card></app-card>\n');
    expect(page).not.toContain('$content');
  });

  it('with a Signal prop, the content goes inside the component in the host, and the page mounts the host empty', () => {
    const files = planBench({
      target: { ...TARGET, tag: 'signal-display', component: 'C:/proj/src/components/signal-display.fud', fixture: 'C:/proj/src/components/signal-display.fixture.ts' },
      spec: spec('component signal-display\n\ncriterion diez\n  given\n    props diez\n'),
      fixtures: { diez: { value: signal(10), $content: '<i slot="unit">kg</i>' } },
      dir: DIR,
    }).files;
    expect(files.get('components/signal-display/bench-host-signal-display-diez.fud')).toContain(
      '    <signal-display .value=@value><i slot="unit">kg</i></signal-display>\n',
    );
    expect(files.get('routes/signal-display/diez.fud')).toContain('    <bench-host-signal-display-diez></bench-host-signal-display-diez>\n');
  });
});
