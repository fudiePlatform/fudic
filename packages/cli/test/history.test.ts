/**
 * `fudic approve`, `fudic accept` and `fudic history` (criteria 12–14), and the `.gitattributes`
 * of `fudic new` (criterion 15). The clock, git and the user are fixed through `HistoryDeps`; the
 * files are a `MemoryFs`, read by the history through the CLI's own port.
 */

import { describe, expect, it } from 'vitest';
import { approvalHash, inputsHash, type UnitState } from '@fudic/history';
import { parseArgs } from '../src/args.js';
import { planAccept, planApprove, findPiece, historyIo, nodeHistoryDeps, type HistoryDeps } from '../src/plans/history.js';
import { planNew } from '../src/plans/new.js';
import { planWorkspace } from '../src/plans/workspace.js';
import { run, type RunDeps } from '../src/run.js';
import { contentsOf, MemoryFs, RecordingRunner, captureStreams, projectFs } from './helpers.js';
import type { NewOptions } from '../src/types.js';

const CWD = '/project';
const HEAD = 'd4e5f6a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';
const NOW = new Date('2026-10-22T10:02:31Z');

const PIECE = 'src/components/acme-button';
const BUTTON = `${PIECE}/acme-button`;
const BUTTON_FUD = '<acme-button>\n  <template shadowrootmode="open">\n    <button>Go</button>\n  </template>\n</acme-button>\n';
const BUTTON_SPEC = 'component acme-button\n\ncriterion renders\n  then\n    present acme-button\n\ncriterion clicks\n  then\n    present acme-button\n';

/** A git that answers what each test says; `undefined` is a git that failed. */
function fakeGit(answers: { head?: string; user?: string; tags?: string } = { head: HEAD, user: 'Pedro Hurtado' }): HistoryDeps['git'] {
  return async (_cwd, args) => {
    if (args[0] === 'rev-parse') return answers.head;
    if (args[0] === 'config') return answers.user;
    return answers.tags;
  };
}

function historyDeps(git: HistoryDeps['git'] = fakeGit()): HistoryDeps {
  return { now: () => NOW, git, user: () => 'sys-user' };
}

function button(extra: Readonly<Record<string, string>> = {}): MemoryFs {
  return projectFs({ [`${BUTTON}.fud`]: BUTTON_FUD, [`${BUTTON}.fudspec`]: BUTTON_SPEC, ...extra }, CWD);
}

async function cli(argv: readonly string[], fs: MemoryFs, history = historyDeps(), runner = new RecordingRunner()) {
  const capture = captureStreams();
  const deps: RunDeps = { readIo: fs, writeIo: fs, runner, streams: capture.streams, history };
  const code = await run([...argv, '--cwd', CWD], deps);
  return { code, out: capture.stdout(), err: capture.stderr(), runner };
}

const base = { cwd: CWD, force: false };

describe('fudic approve (criterion 12)', () => {
  it('writes the approved line with the git person, the criteria and the hash of now', async () => {
    const fs = button({ [`${BUTTON}.fixture.ts`]: 'export default { base: {} };\n' });
    const { code } = await cli(['approve', 'src/components/acme-button'], fs);

    expect(code).toBe(0);
    const hash = await approvalHash(`${BUTTON}.fud`, historyIo(fs.realPath(CWD), fs, historyDeps()));
    expect(fs.at(`${BUTTON}.fudlog`)).toBe(`2026-10-22T10:02Z d4e5f6a approved    by Pedro-Hurtado  spec 2 hash ${hash}\n`);
  });

  it('only adds: a second approval keeps the first line as it was', async () => {
    const before = '2026-10-21T09:00Z 0a9b8c7 started     by agent  "A button"';
    const fs = button({ [`${BUTTON}.fudlog`]: before });
    const plan = await planApprove(`${BUTTON}.fud`, base, fs, historyDeps());

    const [change] = plan.changes;
    expect(change?.kind).toBe('modify');
    expect(contentsOf(change).startsWith(`${before}\n2026-10-22T10:02Z d4e5f6a approved`)).toBe(true);
  });

  it('is the user of the system when git has no name, and -------- outside git', async () => {
    const fs = button();
    const plan = await planApprove(`${BUTTON}.fud`, base, fs, historyDeps(fakeGit({})));
    expect(contentsOf(plan.changes[0])).toMatch(/^2026-10-22T10:02Z ------- approved {4}by sys-user {2}spec 2 hash [0-9a-f]{12}\n$/u);
  });

  it('is FUD1222 without a .fudspec, and writes nothing', async () => {
    const fs = projectFs({ [`${BUTTON}.fud`]: BUTTON_FUD }, CWD);
    const { code, out } = await cli(['approve', `${BUTTON}.fud`], fs);
    expect(code).toBe(1);
    expect(out).toContain('FUD1222');
    expect(fs.paths()).not.toContain(`${BUTTON}.fudlog`);
  });

  it('is FUD1221 on something that is not a piece', async () => {
    const fs = button({ [`${BUTTON}.css`]: 'button {}' });
    const { code, out } = await cli(['approve', `${BUTTON}.css`], fs);
    expect(code).toBe(1);
    expect(out).toContain('FUD1221');
  });
});

describe('what a piece is', () => {
  const resolve = (written: string, fs: MemoryFs) => findPiece(written, CWD, fs);

  it('names a component by its tag, from its .fud or its folder', () => {
    const fs = button();
    expect(resolve('src/components/acme-button', fs).piece?.name).toBe('acme-button');
    expect(resolve(`${BUTTON}.fud`, fs).piece?.unit).toMatch(/\/project\/src\/components\/acme-button\/acme-button\.fud$/u);
  });

  it('names a route by its path: a folder by its index.fud, the root as index', () => {
    const fs = projectFs({ 'src/routes/blog/index.fud': '<p>blog</p>', 'src/routes/index.fud': '<p>home</p>', 'src/routes/blog/[slug].fud': '<p>post</p>' }, CWD);
    expect(resolve('src/routes/blog', fs).piece?.name).toBe('blog');
    expect(resolve('src/routes/index.fud', fs).piece?.name).toBe('index');
    expect(resolve('src/routes/blog/[slug].fud', fs).piece?.name).toBe('blog/[slug]');
  });

  it('refuses a .fud with no tag, a folder with no piece, a missing file and a .fud outside a project', () => {
    const fs = projectFs({ 'src/layouts/_layout.fud': '<p>@RenderBody()</p>', 'src/components/empty/.gitkeep': '' }, CWD);
    for (const written of ['src/layouts/_layout.fud', 'src/components/empty', 'src/components/missing.fud']) {
      expect(resolve(written, fs).errors.map((error) => error.code), written).toEqual(['FUD1221']);
    }
    const outside = new MemoryFs({ 'loose/x-y.fud': '<x-y><template shadowrootmode="open"></template></x-y>' }, CWD);
    expect(resolve('loose/x-y.fud', outside).errors.map((error) => error.code)).toEqual(['FUD1221']);
  });
});

describe('fudic accept (criterion 13)', () => {
  it('writes the accepted line and tags HEAD as accepted/<name>/<date>', async () => {
    const fs = button();
    const { code, runner } = await cli(['accept', 'src/components/acme-button', 'Client accepted it'], fs);

    expect(code).toBe(0);
    expect(fs.at(`${BUTTON}.fudlog`)).toBe(
      '2026-10-22T10:02Z d4e5f6a accepted    by Pedro-Hurtado  "Client accepted it"  tag accepted/acme-button/2026-10-22\n',
    );
    expect(runner.commands).toEqual([`git tag accepted/acme-button/2026-10-22 @ ${fs.realPath(CWD)}`]);
  });

  it('takes the next free tag of the day: -2, then -3', async () => {
    const tag = async (tags: string): Promise<string | undefined> => {
      const plan = await planAccept(PIECE, 'ok', base, button(), historyDeps(fakeGit({ head: HEAD, user: 'pedro', tags })));
      return plan.commands[0]?.args[1];
    };
    expect(await tag('accepted/acme-button/2026-10-22')).toBe('accepted/acme-button/2026-10-22-2');
    expect(await tag('accepted/acme-button/2026-10-22\naccepted/acme-button/2026-10-22-2')).toBe('accepted/acme-button/2026-10-22-3');
  });

  it('leaves out of the tag what git does not take in one', async () => {
    const fs = projectFs({ 'src/routes/blog/[slug].fud': '<p>post</p>' }, CWD);
    const plan = await planAccept('src/routes/blog/[slug].fud', 'ok', base, fs, historyDeps());
    expect(plan.commands[0]?.args).toEqual(['tag', 'accepted/blog/-slug-/2026-10-22']);
  });

  it('with --dry-run, shows the plan and neither writes nor tags', async () => {
    const fs = button();
    const { code, out, runner } = await cli(['accept', PIECE, 'Client accepted it', '--dry-run'], fs);
    expect(code).toBe(0);
    expect(out).toContain('dry run');
    expect(out).toContain('git tag accepted/acme-button/2026-10-22');
    expect(fs.paths()).not.toContain(`${BUTTON}.fudlog`);
    expect(runner.commands).toEqual([]);
  });

  it('is FUD1221 on something that is not a piece', async () => {
    const plan = await planAccept('nowhere', 'ok', base, button(), historyDeps());
    expect(plan.errors.map((error) => error.code)).toEqual(['FUD1221']);
  });
});

describe('fudic history (criterion 14)', () => {
  /** The button with a history whose hashes are those of its files as they are. */
  async function withHistory(lines: (approval: string, inputs: string) => readonly string[]): Promise<MemoryFs> {
    const fs = button();
    const io = historyIo(fs.realPath(CWD), fs, historyDeps());
    const text = lines(await approvalHash(`${BUTTON}.fud`, io), await inputsHash(`${BUTTON}.fud`, io));
    fs.write(`${CWD}/${BUTTON}.fudlog`, `${text.join('\n')}\n`);
    return fs;
  }

  it('prints the line of §4.5', async () => {
    const fs = await withHistory((approval, inputs) => [
      `2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 2 hash ${approval}`,
      `2026-10-22T10:52Z 3c2b1a0 spec_run    pass 4/4  hash ${inputs}`,
      `2026-10-22T10:52Z 3c2b1a0 tests       pass 6/6  hash ${inputs}`,
      '2026-10-22T11:06Z 9d8c7b6 done',
    ]);
    const { code, out } = await cli(['history', 'src/components/acme-button'], fs);
    expect(code).toBe(0);
    expect(out).toBe('acme-button  approved by pedro (valid) · tests pass 6/6 · spec pass 4/4 · done\n');
  });

  it('says what expired, what is stale, what never ran, the look and what was accepted', async () => {
    const fs = await withHistory(() => [
      '2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 2 hash 000000000000',
      '2026-10-22T10:31Z 0a9b8c7 tests       red 0/6  hash 000000000000',
      '2026-10-22T10:40Z 0a9b8c7 look        by pedro  hash 111111111111',
      '2026-10-22T11:00Z 0a9b8c7 accepted    by pedro  "ok"  tag accepted/acme-button/2026-10-22',
    ]);
    const { out } = await cli(['history', PIECE], fs);
    expect(out).toBe(
      'acme-button  approved by pedro (expired) · tests stale (was red) · spec not run · look (valid) · accepted accepted/acme-button/2026-10-22\n',
    );
  });

  it('is not approved after a reopening', async () => {
    const fs = await withHistory((approval) => [
      `2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 2 hash ${approval}`,
      '2026-10-22T11:20Z d4e5f6a reopened    by pedro  "One more state"',
    ]);
    const { out } = await cli(['history', PIECE], fs);
    expect(out).toBe('acme-button  not approved · tests not run · spec not run\n');
  });

  it('with --json, prints the UnitState and nothing else on stdout', async () => {
    const fs = await withHistory((approval) => [`2026-10-22T10:20Z d4e5f6a approved    by pedro  spec 2 hash ${approval}`]);
    const { code, out, err } = await cli(['history', PIECE, '--json'], fs);
    expect(code).toBe(0);
    expect(err).toBe('');
    const state = JSON.parse(out) as UnitState;
    expect(state).toMatchObject({ unit: `${BUTTON}.fud`, approval: 'valid', approvedAt: 'd4e5f6a', done: false });
  });

  it('warns of a line it cannot read, with its place, and reads the rest', async () => {
    const fs = await withHistory(() => ['2026-10-22T10:02Z abc garbage', '2026-10-22T11:06Z 9d8c7b6 done']);
    const { code, out } = await cli(['history', PIECE], fs);
    expect(code).toBe(0);
    expect(out).toContain('acme-button.fudlog:1:1 - warning FUD1220');
    expect(out).toContain('acme-button  not approved · tests not run · spec not run · done\n');
  });

  it('is FUD1221 on something that is not a piece, on stderr with --json', async () => {
    const plain = await cli(['history', 'nowhere'], button());
    expect(plain.code).toBe(1);
    expect(plain.out).toContain('FUD1221');
    const json = await cli(['history', 'nowhere', '--json'], button());
    expect(json.out).toBe('');
    expect(json.err).toContain('FUD1221');
  });
});

describe('the command line of the three', () => {
  const error = (argv: readonly string[]): string | undefined => {
    const parsed = parseArgs(argv);
    return parsed.kind === 'error' ? parsed.error.message : undefined;
  };

  it('reads a piece, and the text of accept', () => {
    expect(parseArgs(['approve', 'x'])).toMatchObject({ kind: 'approve', piece: 'x' });
    expect(parseArgs(['history', 'x', '--json'])).toMatchObject({ kind: 'history', piece: 'x', flags: { json: true } });
    expect(parseArgs(['accept', 'x', 'Fine'])).toMatchObject({ kind: 'accept', piece: 'x', text: 'Fine' });
  });

  it('says what is missing or extra', () => {
    expect(error(['approve'])).toBe('fudic approve needs a piece');
    expect(error(['history', 'x', 'y'])).toBe('fudic history takes no argument: "y"');
    expect(error(['accept', 'x'])).toBe('fudic accept needs what the client said');
    expect(error(['accept', 'x', '  '])).toBe('fudic accept needs what the client said');
    expect(error(['accept', 'x', 'Fine', 'more'])).toBe('fudic accept takes no argument: "more"');
    expect(error(['approve', 'x', '--project', 'web'])).toBe('unknown flag --project');
  });

  it('has a help of its own for each', () => {
    for (const topic of ['approve', 'accept', 'history']) {
      expect(parseArgs([topic, '--help'])).toEqual({ kind: 'help', topic });
    }
  });
});

describe('the real clock, git and user', () => {
  it('are a date, the history git and the user of the system', async () => {
    const deps = nodeHistoryDeps();
    expect(deps.now()).toBeInstanceOf(Date);
    expect(deps.user()).not.toBe('');
    expect(await deps.git(CWD, ['--no-such-flag'])).toBeUndefined();
  });
});

describe('fudic new and the history (criterion 15)', () => {
  const options: NewOptions = {
    cwd: '/here',
    force: false,
    id: 'demo',
    prefix: '',
    pm: 'pnpm',
    install: true,
    git: true,
    sw: true,
    layout: { own: '_layout' },
    target: 'static',
  };

  it('writes *.fudlog merge=union at the root of an app and of a workspace', async () => {
    const app = await planNew('demo', options, new MemoryFs({}, '/here'));
    const workspace = await planWorkspace('ws', { ...options, app: 'demo', uses: [], libs: [] }, new MemoryFs({}, '/here'));
    for (const [plan, path] of [[app, 'demo/.gitattributes'], [workspace, 'ws/.gitattributes']] as const) {
      expect(contentsOf(plan.changes.find((change) => change.path === path))).toContain('\n*.fudlog merge=union\n');
    }
  });
});
