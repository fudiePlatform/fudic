/**
 * SDD-45 §3.3 — which pieces exist, discovered and never listed.
 *
 * A package publishes by declaring a DIRECTORY in its `package.json`, and the pieces are
 * whatever it holds: `@fudic/http` joins the framework without anybody editing this file, and
 * a package that stops publishing stops being in the graph. The I/O is injected for exactly
 * this suite — the logic is pure text and path work, and the seam is what keeps it that way.
 */

import { describe, expect, it } from 'vitest';

import { runtimePieces, type RuntimeFs } from '../src/runtime-pieces.js';

/** A world of files and directories, read the one way this module reads them. */
function fs(
  files: Readonly<Record<string, string>>,
  dirs: Readonly<Record<string, readonly string[]>> = {},
  links: Readonly<Record<string, string>> = {},
): RuntimeFs {
  return {
    readFile: (path) => files[path],
    readDir: (dir) => dirs[dir],
    realPath: (path) => links[path] ?? path,
  };
}

/** A `package.json` with the fields this walk reads. */
const manifest = (fields: Readonly<Record<string, unknown>>): string => JSON.stringify(fields);

const PROJECT = '/repo/app';

describe('runtimePieces — the happy path', () => {
  it('publishes one piece per `.js` directly inside the declared directory', () => {
    const { pieces, diagnostics } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({
            name: 'app',
            dependencies: { '@fudic/core': '*' },
          }),
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: manifest({
            name: '@fudic/core',
            version: '0.0.1',
            fudic: { runtime: './runtime' },
          }),
        },
        { [`${PROJECT}/node_modules/@fudic/core/runtime`]: ['signal.js', 'hydrate.js'] },
      ),
    );

    // The URL carries no application `base`: the runtime lives outside every app's, which is
    // what lets two applications of one origin ask for the same bytes (§3.1). And the package
    // segment is not decoration — `element` exists in `core` and in `forms`.
    expect(pieces).toEqual([
      {
        pkg: '@fudic/core',
        name: 'hydrate',
        url: '/_fudic/0.0.1/core/hydrate.js',
        file: `${PROJECT}/node_modules/@fudic/core/runtime/hydrate.js`,
      },
      {
        pkg: '@fudic/core',
        name: 'signal',
        url: '/_fudic/0.0.1/core/signal.js',
        file: `${PROJECT}/node_modules/@fudic/core/runtime/signal.js`,
      },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('is in a stable order, because a build artifact may not differ by machine', () => {
    // A directory listing is the platform's order, so it is sorted here. It is the one
    // property SDD-45 cannot give up: two builds of one application produce the same bytes.
    const world = (entries: readonly string[]): RuntimeFs =>
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({
            name: 'app',
            dependencies: { '@fudic/core': '*' },
          }),
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: manifest({
            name: '@fudic/core',
            version: '0.0.1',
            fudic: { runtime: 'runtime' },
          }),
        },
        { [`${PROJECT}/node_modules/@fudic/core/runtime`]: entries },
      );

    const forwards = runtimePieces(PROJECT, world(['a.js', 'b.js', 'c.js'])).pieces;
    const backwards = runtimePieces(PROJECT, world(['c.js', 'a.js', 'b.js'])).pieces;
    expect(backwards).toEqual(forwards);
  });

  it('takes only `.js`, and only at the first level', () => {
    const { pieces } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({
            name: 'app',
            dependencies: { '@fudic/core': '*' },
          }),
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: manifest({
            name: '@fudic/core',
            version: '0.0.1',
            fudic: { runtime: 'runtime' },
          }),
        },
        {
          [`${PROJECT}/node_modules/@fudic/core/runtime`]: [
            'signal.js',
            'signal.js.map',
            'README.md',
            'nested',
          ],
          [`${PROJECT}/node_modules/@fudic/core/runtime/nested`]: ['inner.js'],
        },
      ),
    );

    // The published shape is `<version>/<pkg>/<piece>.js` (§3.1) and it is FLAT, so a
    // subdirectory is not a piece with a longer name: it is something else that happens to
    // live there, and inventing a name for it would publish a URL nobody can write.
    expect(pieces.map((p) => p.name)).toEqual(['signal']);
  });

  it('normalises the declaration: `./runtime/` and `runtime` are one directory', () => {
    for (const declared of ['./runtime', 'runtime', './runtime/', '  runtime//  ']) {
      const { pieces } = runtimePieces(
        PROJECT,
        fs(
          {
            [`${PROJECT}/package.json`]: manifest({
              name: 'app',
              dependencies: { '@fudic/core': '*' },
            }),
            [`${PROJECT}/node_modules/@fudic/core/package.json`]: manifest({
              name: '@fudic/core',
              version: '0.0.1',
              fudic: { runtime: declared },
            }),
          },
          { [`${PROJECT}/node_modules/@fudic/core/runtime`]: ['signal.js'] },
        ),
      );
      expect(pieces.map((p) => p.url)).toEqual(['/_fudic/0.0.1/core/signal.js']);
    }
  });

  it('a package with no scope keeps its whole name in the URL', () => {
    const { pieces } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({ name: 'app', dependencies: { widgets: '*' } }),
          [`${PROJECT}/node_modules/widgets/package.json`]: manifest({
            name: 'widgets',
            version: '1.0.0',
            fudic: { runtime: 'runtime' },
          }),
        },
        { [`${PROJECT}/node_modules/widgets/runtime`]: ['grid.js'] },
      ),
    );

    expect(pieces.map((p) => p.url)).toEqual(['/_fudic/1.0.0/widgets/grid.js']);
  });
});

describe('runtimePieces — how far the walk goes', () => {
  /** A publisher, plus whatever else it declares as a dependency. */
  const publisher = (
    name: string,
    deps: Readonly<Record<string, string>> = {},
    field = 'dependencies',
  ): string => manifest({ name, version: '0.0.1', fudic: { runtime: 'runtime' }, [field]: deps });

  it('goes THROUGH a publisher, because pieces reach pieces', () => {
    const { pieces } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({
            name: 'app',
            dependencies: { '@fudic/core': '*' },
          }),
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: publisher('@fudic/core', {
            '@fudic/dom': '*',
          }),
          [`${PROJECT}/node_modules/@fudic/dom/package.json`]: publisher('@fudic/dom'),
        },
        {
          [`${PROJECT}/node_modules/@fudic/core/runtime`]: ['hydrate.js'],
          [`${PROJECT}/node_modules/@fudic/dom/runtime`]: ['browser.js'],
        },
      ),
    );

    // `@fudic/core` imports `@fudic/dom`'s `browser` and declares it external (§4.3), so a
    // package the application never names still ends up in the origin.
    expect(pieces.map((p) => p.pkg)).toEqual(['@fudic/core', '@fudic/dom']);
  });

  it('STOPS at a package that publishes nothing', () => {
    const { pieces } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({ name: 'app', dependencies: { middle: '*' } }),
          [`${PROJECT}/node_modules/middle/package.json`]: manifest({
            name: 'middle',
            version: '1.0.0',
            dependencies: { '@fudic/core': '*' },
          }),
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: publisher('@fudic/core'),
        },
        { [`${PROJECT}/node_modules/@fudic/core/runtime`]: ['signal.js'] },
      ),
    );

    // Reading its dependencies would put the whole store back on the bill, which is the
    // argument `@fudic/resolve` already makes about walking through a library and not through
    // everything.
    expect(pieces).toEqual([]);
  });

  it('reads all three dependency fields of the CONSUMER', () => {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const { pieces } = runtimePieces(
        PROJECT,
        fs(
          {
            [`${PROJECT}/package.json`]: manifest({
              name: 'app',
              [field]: { '@fudic/core': '*' },
            }),
            [`${PROJECT}/node_modules/@fudic/core/package.json`]: publisher('@fudic/core'),
          },
          { [`${PROJECT}/node_modules/@fudic/core/runtime`]: ['signal.js'] },
        ),
      );
      expect(pieces.map((p) => p.pkg)).toEqual(['@fudic/core']);
    }
  });

  it('finds a dependency hoisted above the package that needs it', () => {
    const { pieces } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({
            name: 'app',
            dependencies: { '@fudic/core': '*' },
          }),
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: publisher('@fudic/core', {
            '@fudic/dom': '*',
          }),
          // Not under `@fudic/core`'s own `node_modules`: hoisted to the project's.
          [`${PROJECT}/node_modules/@fudic/dom/package.json`]: publisher('@fudic/dom'),
        },
        {
          [`${PROJECT}/node_modules/@fudic/core/runtime`]: ['hydrate.js'],
          [`${PROJECT}/node_modules/@fudic/dom/runtime`]: ['browser.js'],
        },
      ),
    );

    expect(pieces.map((p) => p.pkg)).toEqual(['@fudic/core', '@fudic/dom']);
  });

  it('publishes a package reached twice only once', () => {
    const { pieces } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({
            name: 'app',
            dependencies: { '@fudic/core': '*', '@fudic/forms': '*' },
          }),
          // A diamond: both publishers reach `@fudic/dom`, and the application names it too.
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: publisher('@fudic/core', {
            '@fudic/dom': '*',
          }),
          [`${PROJECT}/node_modules/@fudic/forms/package.json`]: publisher('@fudic/forms', {
            '@fudic/dom': '*',
          }),
          [`${PROJECT}/node_modules/@fudic/dom/package.json`]: publisher('@fudic/dom'),
        },
        {
          [`${PROJECT}/node_modules/@fudic/core/runtime`]: ['hydrate.js'],
          [`${PROJECT}/node_modules/@fudic/forms/runtime`]: ['field.js'],
          [`${PROJECT}/node_modules/@fudic/dom/runtime`]: ['browser.js'],
        },
      ),
    );

    // Published twice, `browser.js` would be two claimants for one URL and `FUD0805` would
    // fire on a graph that is perfectly ordinary. The walk visits a root once.
    expect(pieces.filter((p) => p.pkg === '@fudic/dom')).toHaveLength(1);
    expect(pieces).toHaveLength(3);
  });

  it('a dependency that is not installed is not a diagnostic here', () => {
    const { pieces, diagnostics } = runtimePieces(
      PROJECT,
      fs({
        [`${PROJECT}/package.json`]: manifest({ name: 'app', dependencies: { absent: '*' } }),
      }),
    );

    expect(pieces).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('visits a workspace package once, under its real name', () => {
    const { pieces } = runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({
            name: 'app',
            dependencies: { '@fudic/core': 'workspace:*' },
          }),
          // A symlink: the manifest is readable under both spellings, which is the whole
          // reason the same package could be visited twice.
          [`${PROJECT}/node_modules/@fudic/core/package.json`]: publisher('@fudic/core'),
          '/repo/packages/core/package.json': publisher('@fudic/core'),
        },
        { '/repo/packages/core/runtime': ['signal.js'] },
        // A workspace package is installed as a LINK, so the same package is reachable under
        // two spellings and would otherwise be visited — and published — twice.
        { [`${PROJECT}/node_modules/@fudic/core`]: '/repo/packages/core' },
      ),
    );

    expect(pieces.map((p) => p.file)).toEqual(['/repo/packages/core/runtime/signal.js']);
  });

  it('reads Windows separators the port may hand back', () => {
    const { pieces } = runtimePieces(
      'C:\\repo\\app',
      fs(
        {
          'C:/repo/app/package.json': manifest({
            name: 'app',
            dependencies: { '@fudic/core': '*' },
          }),
          'C:/repo/app/node_modules/@fudic/core/package.json': publisher('@fudic/core'),
        },
        { 'C:/repo/app/node_modules/@fudic/core/runtime': ['signal.js'] },
        { 'C:/repo/app/node_modules/@fudic/core': 'C:\\repo\\app\\node_modules\\@fudic\\core' },
      ),
    );

    // One mixed separator is enough to make `${root}/node_modules/<name>` miss, so every path
    // in that module is POSIX and two spellings never disagree.
    expect(pieces.map((p) => p.pkg)).toEqual(['@fudic/core']);
  });

  it('reaches nothing when the project has no manifest at all', () => {
    expect(runtimePieces(PROJECT, fs({})).pieces).toEqual([]);
  });
});

describe('runtimePieces — a declaration that publishes nothing', () => {
  /** The project plus one dependency, whose manifest is given whole. */
  const world = (
    dependency: string,
    dirs: Readonly<Record<string, readonly string[]>> = {},
  ): RuntimeFs =>
    fs(
      {
        [`${PROJECT}/package.json`]: manifest({ name: 'app', dependencies: { dep: '*' } }),
        [`${PROJECT}/node_modules/dep/package.json`]: dependency,
      },
      dirs,
    );

  it('a manifest that is not JSON declares nothing, and says nothing', () => {
    const { pieces, diagnostics } = runtimePieces(PROJECT, world('{ "name": '));
    expect(pieces).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('a manifest that is not an object either', () => {
    for (const text of ['null', '"a string"', '42']) {
      expect(runtimePieces(PROJECT, world(text)).diagnostics).toEqual([]);
    }
  });

  it('a declaration that points nowhere is not a declaration', () => {
    // Reporting `FUD0804` for it would be reporting a directory that was never named.
    for (const fudic of [
      null,
      'a string',
      { runtime: 42 },
      { runtime: '' },
      { runtime: '   ' },
      { runtime: './' },
      {},
    ]) {
      const { pieces, diagnostics } = runtimePieces(
        PROJECT,
        world(manifest({ name: 'dep', version: '1.0.0', fudic })),
      );
      expect(pieces).toEqual([]);
      expect(diagnostics).toEqual([]);
    }
  });
});

describe('FUD0804 — the declared directory is not there', () => {
  const declaring = (fields: Readonly<Record<string, unknown>> = {}): string =>
    manifest({ name: 'dep', version: '1.0.0', fudic: { runtime: 'runtime' }, ...fields });

  const run = (
    dependency: string,
    dirs: Readonly<Record<string, readonly string[]>> = {},
  ): ReturnType<typeof runtimePieces> =>
    runtimePieces(
      PROJECT,
      fs(
        {
          [`${PROJECT}/package.json`]: manifest({ name: 'app', dependencies: { dep: '*' } }),
          [`${PROJECT}/node_modules/dep/package.json`]: dependency,
        },
        dirs,
      ),
    );

  it('the directory does not exist', () => {
    const { pieces, diagnostics } = run(declaring());
    expect(pieces).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0804']);
    expect(diagnostics[0]?.message).toContain('"dep"');
  });

  it('the directory exists and holds no piece', () => {
    const { diagnostics } = run(declaring(), {
      [`${PROJECT}/node_modules/dep/runtime`]: ['README.md'],
    });
    // Same answer and the same message: what matters is that the publisher's build did not
    // run, and whether the directory is absent or empty says the same thing.
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0804']);
  });

  it('names the ROOT when the manifest has no name to name it by', () => {
    const { diagnostics } = run(manifest({ version: '1.0.0', fudic: { runtime: 'runtime' } }));
    // A manifest with no name still has to be nameable in a message.
    expect(diagnostics[0]?.file).toBe(`${PROJECT}/node_modules/dep`);
  });

  it('a publisher with no version publishes nothing, and that is not FUD0804', () => {
    // Without a version — or without a name — there is no URL to write, so the package
    // publishes nothing here rather than publishing one that resolves to the wrong place.
    const { pieces, diagnostics } = run(
      manifest({ name: 'dep', fudic: { runtime: 'runtime' } }),
      { [`${PROJECT}/node_modules/dep/runtime`]: ['grid.js'] },
    );
    expect(pieces).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('a publisher with no name publishes nothing either', () => {
    const { pieces, diagnostics } = run(
      manifest({ version: '1.0.0', fudic: { runtime: 'runtime' } }),
      { [`${PROJECT}/node_modules/dep/runtime`]: ['grid.js'] },
    );
    expect(pieces).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
});

describe('FUD0805 — two packages claiming one URL', () => {
  /** Two publishers whose names end in the same segment, with the same version. */
  const clashing = (version = '0.0.1'): RuntimeFs =>
    fs(
      {
        [`${PROJECT}/package.json`]: manifest({
          name: 'app',
          dependencies: { '@acme/core': '*', '@other/core': '*' },
        }),
        [`${PROJECT}/node_modules/@acme/core/package.json`]: manifest({
          name: '@acme/core',
          version: '0.0.1',
          fudic: { runtime: 'runtime' },
        }),
        [`${PROJECT}/node_modules/@other/core/package.json`]: manifest({
          name: '@other/core',
          version,
          fudic: { runtime: 'runtime' },
        }),
      },
      {
        [`${PROJECT}/node_modules/@acme/core/runtime`]: ['signal.js'],
        [`${PROJECT}/node_modules/@other/core/runtime`]: ['signal.js'],
      },
    );

  it('nobody clashing is zero diagnostics', () => {
    // The URL carries the package segment for exactly this reason (§3.1), so a clash needs
    // two packages with the same SHORT name AND the same version — a scope and a fork of it.
    const { pieces, diagnostics } = runtimePieces(PROJECT, clashing('9.9.9'));
    expect(pieces).toHaveLength(2);
    expect(diagnostics).toEqual([]);
  });

  it('reports the clash and names BOTH packages, sorted', () => {
    const { diagnostics } = runtimePieces(PROJECT, clashing());
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0805']);
    expect(diagnostics[0]?.message).toContain('"@acme/core" and "@other/core"');
  });

  it('keeps the FIRST claimant, and not both', () => {
    const { pieces } = runtimePieces(PROJECT, clashing());
    // The rest of the build must not see two entries for one URL, and a diagnostic is more
    // useful than a cascade of «piece not found» underneath it — the build stops anyway.
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.pkg).toBe('@acme/core');
  });
});
