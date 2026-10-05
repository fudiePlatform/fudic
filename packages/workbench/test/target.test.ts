import { describe, expect, it } from 'vitest';
import { isFailure } from '../src/index.js';
import { resolveTarget, slashes, type TargetFs } from '../src/target.js';

const CARD = `<link rel="component" href="./app-badge.fud">

<app-card>
  <template shadowrootmode="open">
    <article></article>
  </template>
</app-card>
`;

/** A disk made of a map: path → text. A folder exists when some file is inside it. */
function memoryFs(files: Record<string, string>): TargetFs {
  return {
    readFile: (path) => files[path],
    exists: (path) => path in files,
  };
}

const PROJECT = {
  'C:/proj/fudic.json': '{}',
  'C:/proj/package.json': '{}',
  'C:/proj/src/components/app-card.fud': CARD,
  'C:/proj/src/components/app-card.fudspec': 'component app-card\n',
  'C:/proj/src/components/app-card.fixture.ts': 'export default {};\n',
};

const EXPECTED = {
  tag: 'app-card',
  component: 'C:/proj/src/components/app-card.fud',
  spec: 'C:/proj/src/components/app-card.fudspec',
  fixture: 'C:/proj/src/components/app-card.fixture.ts',
  projectRoot: 'C:/proj',
};

function codeOf(file: string, fs: TargetFs): string | undefined {
  const answer = resolveTarget(file, fs);
  return isFailure(answer) ? answer.diagnostic.code : undefined;
}

describe('resolveTarget — criterion 1', () => {
  it('resolves a .fud and its .fudspec to the same target', () => {
    const fs = memoryFs(PROJECT);
    expect(resolveTarget('C:/proj/src/components/app-card.fud', fs)).toEqual(EXPECTED);
    expect(resolveTarget('C:/proj/src/components/app-card.fudspec', fs)).toEqual(EXPECTED);
  });

  it('takes backslashes in and gives forward slashes out', () => {
    const fs = memoryFs(PROJECT);
    expect(resolveTarget('C:\\proj\\src\\components\\app-card.fud', fs)).toEqual(EXPECTED);
    expect(slashes('C:\\a\\b')).toBe('C:/a/b');
  });

  it('prefers the nearest fudic.json over a nearer package.json', () => {
    const fs = memoryFs({ ...PROJECT, 'C:/proj/src/package.json': '{}' });
    expect(resolveTarget('C:/proj/src/components/app-card.fud', fs)).toMatchObject({ projectRoot: 'C:/proj' });
  });

  it('falls back to the nearest package.json without a fudic.json', () => {
    const fs = memoryFs({
      'C:/lib/package.json': '{}',
      'C:/lib/src/app-card.fud': CARD,
    });
    expect(resolveTarget('C:/lib/src/app-card.fud', fs)).toEqual({
      tag: 'app-card',
      component: 'C:/lib/src/app-card.fud',
      spec: null,
      fixture: null,
      projectRoot: 'C:/lib',
    });
  });

  it('finds a project at a POSIX filesystem root', () => {
    const fs = memoryFs({ '/fudic.json': '{}', '/src/app-card.fud': CARD });
    expect(resolveTarget('/src/app-card.fud', fs)).toMatchObject({ projectRoot: '/' });
  });

  it('reads the tag of a component that sits at a filesystem root', () => {
    const posix = memoryFs({ '/fudic.json': '{}', '/app-card.fud': CARD, '/app-card.fudspec': '' });
    expect(resolveTarget('/app-card.fud', posix)).toEqual({
      tag: 'app-card',
      component: '/app-card.fud',
      spec: '/app-card.fudspec',
      fixture: null,
      projectRoot: '/',
    });
    const windows = memoryFs({ 'C:/fudic.json': '{}', 'C:/app-card.fud': CARD });
    expect(resolveTarget('C:/app-card.fud', windows)).toMatchObject({ tag: 'app-card', projectRoot: 'C:' });
  });

  it('accepts a host tag with attributes before its template', () => {
    const fs = memoryFs({
      'C:/proj/fudic.json': '{}',
      'C:/proj/x-y.fud': '<x-y class="a">\n  <template id="t" shadowrootmode="open"></template>\n</x-y>',
    });
    expect(resolveTarget('C:/proj/x-y.fud', fs)).toMatchObject({ tag: 'x-y', projectRoot: 'C:/proj' });
  });
});

describe('resolveTarget — criterion 2', () => {
  it('rejects a page with FUD0970', () => {
    const fs = memoryFs({
      'C:/proj/fudic.json': '{}',
      'C:/proj/src/routes/index.fud': '<!DOCTYPE html>\n<html><body></body></html>',
      'C:/proj/src/routes/blog-post.fud': '<!DOCTYPE html>\n<html><body><app-card></app-card></body></html>',
    });
    expect(codeOf('C:/proj/src/routes/index.fud', fs)).toBe('FUD0970');
    expect(codeOf('C:/proj/src/routes/blog-post.fud', fs)).toBe('FUD0970');
  });

  it('rejects a layout with FUD0970', () => {
    const fs = memoryFs({
      'C:/proj/fudic.json': '{}',
      'C:/proj/src/routes/_layout.fud': '<!DOCTYPE html>\n<html><body><slot></slot></body></html>',
    });
    expect(codeOf('C:/proj/src/routes/_layout.fud', fs)).toBe('FUD0970');
  });

  it('rejects a component without a tag with FUD0970', () => {
    const fs = memoryFs({
      'C:/proj/fudic.json': '{}',
      'C:/proj/app-bare.fud': '<head><style></style></head>\n<article></article>',
      'C:/proj/app-other.fud': '<app-card>\n  <template shadowrootmode="open"></template>\n</app-card>',
      'C:/proj/app-light.fud': '<app-light><article></article></app-light>',
    });
    expect(codeOf('C:/proj/app-bare.fud', fs)).toBe('FUD0970');
    expect(codeOf('C:/proj/app-other.fud', fs)).toBe('FUD0970');
    expect(codeOf('C:/proj/app-light.fud', fs)).toBe('FUD0970');
  });

  it('rejects a file name that is not a custom element name with FUD0970', () => {
    const fs = memoryFs({ 'C:/proj/fudic.json': '{}', 'C:/proj/Card.fud': CARD });
    expect(codeOf('C:/proj/Card.fud', fs)).toBe('FUD0970');
  });

  it('rejects a .fud it cannot read, and a .fudspec without its .fud, with FUD0970', () => {
    const fs = memoryFs({ 'C:/proj/fudic.json': '{}', 'C:/proj/app-card.fudspec': '' });
    expect(codeOf('C:/proj/app-missing.fud', fs)).toBe('FUD0970');
    expect(codeOf('C:/proj/app-card.fudspec', fs)).toBe('FUD0970');
  });

  it('rejects any other extension with FUD0970, naming the opened file', () => {
    const answer = resolveTarget('C:\\proj\\app-card.fixture.ts', memoryFs(PROJECT));
    expect(answer).toMatchObject({ diagnostic: { code: 'FUD0970', file: 'C:/proj/app-card.fixture.ts' } });
  });

  it('answers FUD0971 on the component when there is no project above it', () => {
    const windows = resolveTarget('C:/loose/app-card.fud', memoryFs({ 'C:/loose/app-card.fud': CARD }));
    expect(windows).toMatchObject({ diagnostic: { code: 'FUD0971', file: 'C:/loose/app-card.fud' } });
    const posix = resolveTarget('/loose/app-card.fud', memoryFs({ '/loose/app-card.fud': CARD }));
    expect(posix).toMatchObject({ diagnostic: { code: 'FUD0971', file: '/loose/app-card.fud' } });
  });

  it('answers spec: null without a .fudspec, and fixture: null without a fixture', () => {
    const { 'C:/proj/src/components/app-card.fudspec': _spec, ...noSpec } = PROJECT;
    expect(resolveTarget('C:/proj/src/components/app-card.fud', memoryFs(noSpec))).toEqual({ ...EXPECTED, spec: null });
    const { 'C:/proj/src/components/app-card.fixture.ts': _fixture, ...noFixture } = PROJECT;
    expect(resolveTarget('C:/proj/src/components/app-card.fud', memoryFs(noFixture))).toEqual({
      ...EXPECTED,
      fixture: null,
    });
  });
});
