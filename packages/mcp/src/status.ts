/**
 * `fudic_status`: where the project is and the one next step (SDD-77 §4.4). It keeps nothing:
 * everything is read off the files, the history and the check. Nothing is run — a test or a
 * criterion counts as its last run in the history.
 */

import { readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import type { Checks } from './checks.js';
import { nextOf, problemsOf, summaryOf } from './check.js';
import { isLibrary, phasesOf, type Phase, type Unit } from './phases.js';
import { isFudicProject, isWorkspace, NO_COMMIT, type Project } from './project.js';
import type { Answer } from './respond.js';
import type { Session } from './session.js';

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** The prefix of a project's tags, from its `fudic.json`; undefined without one. */
function prefixOf(root: string): string | undefined {
  try {
    const { prefix } = JSON.parse(readFileSync(`${root}/fudic.json`, 'utf8')) as { prefix?: unknown };
    return typeof prefix === 'string' ? prefix : undefined;
  } catch {
    return undefined; // a workspace's root has no fudic.json, and its projects each their own prefix
  }
}

/** What the project is: an app, a library or a workspace, and the prefix of its tags. */
function projectOf(project: Project, folders: readonly string[]): Readonly<Record<string, unknown>> {
  const { root } = project;
  if (isWorkspace(root)) return { name: project.name, kind: 'workspace', projects: folders.map((f) => posix(relative(root, f))) };
  const prefix = prefixOf(root);
  return { name: project.name, kind: isLibrary(root) ? 'lib' : 'app', ...(prefix !== undefined ? { prefix } : {}) };
}

/** A piece as the answer lists it. */
function shown(unit: Unit): Readonly<Record<string, unknown>> {
  return {
    piece: unit.piece,
    kind: unit.kind,
    name: unit.name,
    phase: unit.phase,
    approval: unit.approval,
    server: unit.server,
    tests: unit.tests,
    spec: unit.spec,
    documented: unit.documented,
    functions: unit.functions,
  };
}

/** The `.fudspec` and the fixture of a piece, relative to the project: what its approval signs. */
function signed(unit: Unit): readonly string[] {
  const stem = unit.piece.slice(0, -'.fud'.length);
  return [`${stem}.fudspec`, `${stem}.fixture.ts`];
}

/** What changed in what the user approved since they approved it; null when git cannot say. */
function diffSince(project: Project, unit: Unit): string | null {
  if (unit.approvedAt === undefined || unit.approvedAt === NO_COMMIT) return null;
  try {
    return project.git(project.root, ['diff', unit.approvedAt, '--', ...signed(unit)]);
  } catch {
    return null; // a commit the repository no longer has, or no git at all
  }
}

/** The topic of the guide a phase sends the model to write, if it writes a kind of file. */
function topicOf(unit: Unit): string | undefined {
  const topics: Partial<Record<Phase, string>> = {
    criteria: 'fudspec',
    api: 'fudapi',
    red: 'testing',
    view: unit.kind === 'route' ? 'pages' : 'components',
    connect: 'fudapi',
    document: 'components',
  };
  return topics[unit.phase];
}

/** The one step a piece is waiting for, by its phase. */
export function stepOf(unit: Unit): string {
  const { piece, name } = unit;
  const stem = piece.slice(0, -'.fud'.length);
  switch (unit.phase) {
    case 'criteria':
      return (
        `Ask the user for ${unit.kind === 'route' ? 'what the page shows and does' : 'the props and the behaviour'} of ${name}. ` +
        'Propose them, wait for their approval, then write ' +
        `${stem}.fudspec and its fixture, and call fudic_record { piece: "${piece}", event: "approved" }.`
      );
    case 'api':
      return `Link the .fudapi of ${piece} from it with <link rel="server" href="…">, and declare in it what ${name} needs from the server.`;
    case 'red':
      return (
        `Write the unit tests of ${piece} in ${stem}.test.ts, then run fudic_test and fudic_spec_run: every test and every ` +
        'criterion must fail for the right reason (fail, not broken). Do not write the view yet.'
      );
    case 'view':
      return `Write the view of ${piece} until fudic_test and fudic_spec_run pass. Do not change the tests.`;
    case 'connect':
      return `Write the handlers of ${piece}'s functions: fudic_contract { id: "${unit.api!}" } says what is missing and where.`;
    case 'document':
      return `Document ${piece}: a JSDoc on the component and one on each prop (${unit.documented} props have one).`;
    case 'showcase':
      return `The showcase of the library is out of date: call fudic_generate { kind: "showcase", name: "${basename(unit.project)}" }.`;
    default:
      // `done`: a piece left to close; its every phase is finished.
      return `${piece} is finished: call fudic_record { piece: "${piece}", event: "done" }.`;
  }
}

/** The step, with the guide first when its topic was not read in this session. */
export function withGuide(step: string, unit: Unit, session: Session): string {
  const topic = topicOf(unit);
  return topic === undefined || session.has(topic) ? step : `${step} Call fudic_guide { topic: "${topic}" } first.`;
}

const ASK =
  'There is no fudic project here yet. Ask the user only what is missing to create it — what it is for, its pages ' +
  'or components, its name and the prefix of its tags —, then call fudic_new.';

export async function statusOf(project: Project, checks: Checks, session: Session): Promise<Answer> {
  const { root } = project;
  if (!isFudicProject(root)) return { body: { phase: 'none' }, next: ASK };

  const problems = await problemsOf(await checks.run(), checks);
  const summary = summaryOf(problems);
  const units = await phasesOf(root, checks);
  const open = units.find((u) => u.phase !== 'done' || u.complete);
  const expired = units.filter((u) => u.approval === 'expired');
  const body = {
    phase: open?.phase ?? 'done',
    project: projectOf(project, await checks.folders()),
    summary: { errors: summary['errors'], warnings: summary['warnings'] },
    units: units.map(shown),
    ...(expired.length > 0 ? { expired: expired.map((u) => ({ piece: u.piece, since: u.approvedAt ?? NO_COMMIT, diff: diffSince(project, u) })) } : {}),
  };

  // 2. Never a step forward with errors.
  const fix = nextOf(problems, root);
  if (fix !== null) return { body, next: fix };
  // 3. What the user approved changed: they approve it again before anything is built on it.
  const first = expired[0];
  if (first !== undefined) {
    return {
      body,
      next:
        `The approval of ${first.piece} expired: what the user approved changed since. Show the user the diff in ` +
        `"expired", ask them to approve it again, and only then call fudic_record { piece: "${first.piece}", event: "approved" }.`,
    };
  }
  // 4 and 5. The first piece not finished, in the order of the files; or the first left to close.
  if (open !== undefined) return { body, next: withGuide(stepOf(open), open, session) };
  // 6. Everything is done.
  return { body, next: null };
}
