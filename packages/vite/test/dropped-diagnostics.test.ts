/**
 * SDD-35 criterion 15 — the paths that used to drop what the compiler said (§1.1).
 *
 * `?client`, `?ioc`, the link pass, the edge pass and route discovery each compiled or parsed
 * a `.fud` and threw its diagnostics away. Each one now reports through the build's
 * `BuildReporter`, and each test here gives one of them a file with an error and expects the
 * build to fail on it, with `loc` and `frame`.
 *
 * Driven at the hook, not through a whole `vite build`: in a real build the typecheck runs
 * first and says every parse error of every file — and the reporter then, correctly, does not
 * say it again — so a real build never shows whether these paths report anything at all. The
 * typecheck is replaced here by a clean one (the plugin hooks), or not involved (the nested
 * passes, which take the reporter as a parameter), and the plugin context's `error` throws as
 * Rollup's does.
 */

import { describe, it, expect, vi, beforeAll, type Mock } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toPosix, type CheckReport } from '@fudic/typecheck';
import { fudic } from '../src/index.js';
import { BuildReporter, type PluginLog, type ReportContext } from '../src/report.js';
import { runLinkPass } from '../src/link.js';
import { runEdgePass } from '../src/edge.js';
import { analyzePage } from '../src/analyze.js';
import { type ModeDecision } from '../src/mode.js';
import { type RouteBuild } from '../src/discover.js';
import { NO_STRATEGY } from '../src/strategy.js';
import { nodeIo } from '../src/io.js';

// A clean typecheck: what is under test is what the emit and the discovery say on their own.
vi.mock('@fudic/typecheck', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fudic/typecheck')>();
  const clean: CheckReport = { problems: [], project: [], inputs: [] };
  return { ...original, createProjectChecker: () => ({ check: () => clean, invalidate: () => undefined }) };
});

/** A route whose markup closes a tag it never opened: FUD0051 at line 4. */
const BROKEN_PAGE = `<!DOCTYPE html>
<html>
<head><title>x</title></head>
<body><p>hi</q></p></body>
</html>
`;

/** A component whose `@client` does not parse, and whose template closes a stray tag. */
const BROKEN_CLIENT = `@code {
  @client {
    const = ;
  }
}
<x-broken><template shadowrootmode="open"><p>hi</q></p></template></x-broken>
`;

/** A component with an IoC module (it provides), and a stray close tag in its template. */
const BROKEN_OWNER = `@code {
  import { provide } from '@fudic/di';
  provide(class Clock {});
}
<x-owner><template shadowrootmode="open"><p>hi</q></p></template></x-owner>
`;

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fudic-dropped-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  mkdirSync(join(root, 'components'), { recursive: true });
  writeFileSync(join(root, 'routes', 'broken.fud'), BROKEN_PAGE);
  writeFileSync(join(root, 'components', 'x-broken.fud'), BROKEN_CLIENT);
  writeFileSync(join(root, 'components', 'x-owner.fud'), BROKEN_OWNER);
});

/** A plugin context whose `error` throws the log, as Rollup's does, and records it. */
function context(): ReportContext & {
  errors: PluginLog[];
  emitFile: Mock<() => string>;
  addWatchFile: Mock<(file: string) => void>;
} {
  const errors: PluginLog[] = [];
  return {
    errors,
    warn: vi.fn<(log: PluginLog) => void>(),
    emitFile: vi.fn(() => 'ref'),
    addWatchFile: vi.fn<(file: string) => void>(),
    error: (log: PluginLog): never => {
      errors.push(log);
      throw Object.assign(new Error(log.message), log);
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function plugin(): any {
  const p = fudic({ routesDir: 'routes' }) as any;
  p.config({});
  p.configResolved({ root, base: '/', command: 'build', build: { outDir: 'dist' } });
  return p;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The error a failed build carries: positioned, framed, in the file it is about. */
function expectPositioned(log: Partial<PluginLog> | undefined, file: string, line: number): void {
  // Rolldown hands `id` back with forward slashes; it is the same file.
  expect(toPosix(log?.id ?? '')).toBe(toPosix(file));
  expect(log?.loc).toMatchObject({ file, line });
  expect(log?.frame).toContain('─');
}

describe('the host plugin', () => {
  it('?client — the emit’s own diagnostics fail the build, every one in one failure', async () => {
    const file = join(root, 'components', 'x-broken.fud');
    const ctx = context();
    await expect(plugin().transform.call(ctx, '', `${file}?client`)).rejects.toThrow(/FUD0051/u);
    expect(ctx.errors).toHaveLength(1);
    // Positioned at the first, and the message carries both: the stray tag and the `@client`
    // that does not parse, remapped to the `.fud` (line 3, not an offset of the chunk).
    expectPositioned(ctx.errors[0], file, 6);
    expect(ctx.errors[0]!.message).toMatch(/x-broken\.fud:3:\d+ - error FUD0170/u);
  });

  it('?ioc — what resolving its graph said fails the build', async () => {
    const file = join(root, 'components', 'x-owner.fud');
    const ctx = context();
    await expect(plugin().transform.call(ctx, '', `${file}?ioc`)).rejects.toThrow(/FUD0051/u);
    expectPositioned(ctx.errors[0], file, 5);
  });

  it('route discovery — what parsing a route said fails the build, named in its file', () => {
    const file = join(root, 'routes', 'broken.fud');
    const ctx = context();
    expect(() => plugin().buildStart.call(ctx)).toThrow(/FUD0051/u);
    expectPositioned(ctx.errors[0], file, 4);
  });
});

const decision: ModeDecision = { mode: 'sw', prerender: false, enumerate: false, prerenderedHtml: false };

const broken = (): RouteBuild => ({
  route: { file: 'broken.fud', pattern: '/broken', params: [] },
  absPath: join(root, 'routes', 'broken.fud'),
  analysis: {
    role: 'page',
    isPage: true,
    hasLoad: false,
    hasPaths: false,
    hasLayout: false,
    strategy: NO_STRATEGY,
    diagnostics: [],
  },
  decision,
});

/**
 * What a nested build threw. Rolldown fails a build with ONE error that lists the plugin's
 * in `errors`, and each keeps the `loc` and `frame` the plugin gave it.
 */
async function failureOf(pass: Promise<unknown>): Promise<Partial<PluginLog> & { message: string; plugin?: string }> {
  try {
    await pass;
  } catch (error) {
    const [first] = (error as { errors: Array<Partial<PluginLog> & { message: string; plugin?: string }> }).errors;
    return first!;
  }
  throw new Error('the pass did not fail');
}

describe('the nested passes', () => {
  it('link — the emit’s diagnostics fail the pass, positioned', async () => {
    const file = join(root, 'routes', 'broken.fud');
    const error = await failureOf(
      runLinkPass(
        root,
        '/',
        [broken()],
        nodeIo(),
        { sourcemap: false, minify: false },
        undefined,
        undefined,
        undefined,
        new BuildReporter(root),
      ),
    );
    expect(error.message).toMatch(/FUD0051/u);
    expectPositioned(error, file, 4);
  }, 120_000);

  it('edge — the emit’s diagnostics fail the pass, positioned', async () => {
    const file = join(root, 'routes', 'broken.fud');
    const error = await failureOf(
      runEdgePass(
        root,
        '/',
        [broken()],
        nodeIo(),
        undefined,
        { sourcemap: false, minify: false },
        undefined,
        undefined,
        undefined,
        new BuildReporter(root),
      ),
    );
    expect(error.message).toMatch(/FUD0051/u);
    expectPositioned(error, file, 4);
  }, 120_000);

  it('a diagnostic the host already said is not said again by a pass', async () => {
    // The host compiled the route first and reported its FUD0051; the passes compile it again
    // with the same reporter, and the same file, span and code is the same diagnostic.
    const reporter = new BuildReporter(root);
    const file = join(root, 'routes', 'broken.fud');
    const host = context();
    const span = analyzePage(BROKEN_PAGE).diagnostics[0]!.span;
    expect(() =>
      reporter.report(host, [{ severity: 'error', code: 'FUD0051', message: 'stray', span }], file),
    ).toThrow();
    await expect(
      runLinkPass(root, '/', [broken()], nodeIo(), { sourcemap: false, minify: false }, undefined, undefined, undefined, reporter),
    ).resolves.toBeDefined();
  }, 120_000);
});
