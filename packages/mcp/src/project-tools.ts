/**
 * `fudic_new`, `fudic_generate` and `fudic_add`: the CLI's plans, in the MCP's folder.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FUD1404, FUD1408, FUD1409 } from '@fudic/diagnostics';
import { nodeIo, record } from '@fudic/history';
import type { Plan } from '@fudic/cli';
import type { Checks } from './checks.js';
import { afterInstall, flagsOf, runPlan, type OptionValue } from './plans.js';
import { isFudicProject, type Project } from './project.js';
import { respond } from './respond.js';

/** What `fudic g` generates, as its help lists them. */
export const GENERATE_KINDS = [
  'component',
  'page',
  'layout',
  'snippet',
  'app',
  'lib',
  'guide',
  'spec',
  'term',
  'api',
  'showcase',
  'service',
  'form',
  'pipe',
  'style',
] as const;

/** The kinds whose history starts with what the user asked for. */
const WITH_PURPOSE: ReadonlySet<string> = new Set(['component', 'page']);

/**
 * Takes the project's own folder off every path of a `fudic new` plan: the server's folder IS
 * the project, so what the CLI would write in `<name>/` is written in it.
 */
export function inPlace(plan: Plan, name: string): Plan {
  const strip = (path: string): string => (path === name ? '.' : path.startsWith(`${name}/`) ? path.slice(name.length + 1) : path);
  return {
    ...plan,
    changes: plan.changes.map((change) => ({ ...change, path: strip(change.path.replace(/\\/gu, '/')) })),
    commands: plan.commands.map((command) => ({ ...command, dir: strip(command.dir.replace(/\\/gu, '/')) })),
    // The report says to `cd` into the folder: here there is none to go into.
    ...(plan.report !== undefined ? { report: plan.report.filter((line) => !/^\s*cd\s/u.test(line)) } : {}),
  };
}

const dryRun = z.boolean().default(false).describe('Only say what would be written and run: nothing is');
const list = z.array(z.string());

/** The options of `fudic g`, by their command-line names in camelCase. The CLI says which a kind takes. */
const GENERATE_OPTIONS = {
  project: z.string().optional().describe('In a workspace: the app or library it goes in'),
  dir: z.string().optional(),
  in: list.optional().describe('component: the .fud files that get its <link>'),
  noStyle: z.boolean().optional(),
  slot: z.boolean().optional().describe('component: with a default <slot>'),
  skipTest: z.boolean().optional(),
  skipSpec: z.boolean().optional(),
  layout: z.string().optional(),
  noLayout: z.boolean().optional(),
  server: z.boolean().optional().describe('page: with its .fudapi'),
  sections: list.optional(),
  noHead: z.boolean().optional(),
  provided: z.boolean().optional(),
  on: z.string().optional().describe('pipe: the type it takes'),
  param: list.optional().describe('term: name:type of each parameter'),
  uses: list.optional(),
  prefix: z.string().optional(),
  id: z.string().optional(),
  noSw: z.boolean().optional(),
  base: z.string().optional(),
  locale: z.string().optional(),
  app: z.string().optional().describe('showcase: the app it goes in'),
};

/** The argv of `fudic g`: snippet and term take two names. */
function generateArgv(kind: string, name: string | undefined, input: { file?: string; block?: string }): string[] {
  if (kind === 'snippet') return ['g', 'snippet', input.file ?? '', name ?? ''];
  if (kind === 'term') return ['g', 'term', input.block ?? '', name ?? ''];
  return ['g', kind, ...(name === undefined ? [] : [name])];
}

export function registerProjectTools(server: McpServer, project: Project, checks: Checks): void {
  // What comes after a plan: the compass.
  const then = 'Call fudic_status.';
  server.registerTool(
    'fudic_new',
    {
      title: 'fudic new',
      description:
        'Creates a fudic app — or a workspace with `workspace` — in the folder the server was started in, exactly as ' +
        '`fudic new` would, and installs it. Ask the user first what it is for and its name.',
      inputSchema: {
        name: z.string().describe('The app (or workspace) name: its package name and its id'),
        workspace: z.boolean().optional(),
        app: z.string().optional().describe('workspace: its first app'),
        lib: list.optional().describe('workspace: its first libraries'),
        uses: list.optional(),
        prefix: z.string().optional().describe('The prefix of its component tags; by default, from the name'),
        id: z.string().optional(),
        layout: z.string().optional(),
        noLayout: z.boolean().optional(),
        noSw: z.boolean().optional(),
        target: z.string().optional(),
        locale: z.string().optional(),
        dryRun,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ name, dryRun: dry, ...options }) => {
      if (isFudicProject(project.root)) return respond(project, { body: {}, diagnostics: [FUD1409({ folder: project.root })], failed: true });
      const { cli } = await checks.fudic();
      const planned = await runPlan(cli, project, ['new', name, ...flagsOf(options as Record<string, OptionValue>)], {
        dryRun: dry,
        rewrite: (plan) => inPlace(plan, name),
      });
      afterInstall(checks, planned);
      return respond(project, { ...planned.answer, next: planned.answer.failed === true ? null : then });
    },
  );

  server.registerTool(
    'fudic_generate',
    {
      title: 'fudic generate',
      description:
        'Creates a piece of the fudic project exactly as `fudic g <kind>` does: component, page, layout, snippet, app, lib, ' +
        'guide, spec, term, api, showcase, service, form, pipe or style. Never write these files from scratch. ' +
        'A component or a page takes `purpose`: what the user asked for, in one sentence.',
      inputSchema: {
        kind: z.enum(GENERATE_KINDS),
        name: z.string().optional().describe('Its name: the tag of a component, the route of a page (products/[id])…'),
        purpose: z.string().optional().describe('component and page: what the user asked for, in one sentence'),
        file: z.string().optional().describe('snippet: the file it goes in'),
        block: z.string().optional().describe('term: given, when or then'),
        ...GENERATE_OPTIONS,
        dryRun,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ kind, name, purpose, file, block, dryRun: dry, ...options }) => {
      if (!isFudicProject(project.root)) return respond(project, { body: {}, diagnostics: [FUD1404({ folder: project.root })], failed: true });
      if (WITH_PURPOSE.has(kind) && (purpose === undefined || purpose.trim() === '')) {
        return respond(project, { body: { kind }, diagnostics: [FUD1408({ kind })], failed: true });
      }
      const { cli } = await checks.fudic();
      const argv = [
        ...generateArgv(kind, name, { ...(file !== undefined ? { file } : {}), ...(block !== undefined ? { block } : {}) }),
        ...flagsOf(options as Record<string, OptionValue>),
      ];
      const planned = await runPlan(cli, project, argv, { dryRun: dry });
      const created = planned.plan?.changes.find((c) => c.kind === 'create' && c.path.endsWith('.fud'));
      if (planned.answer.body['written'] === true && WITH_PURPOSE.has(kind) && created !== undefined) {
        // Its history starts with why it exists, in the user's words.
        await record(`${project.root}/${created.path}`, { kind: 'started', by: 'agent', text: purpose!.trim() }, nodeIo(project.root));
      }
      return respond(project, { ...planned.answer, next: planned.answer.failed === true ? null : then });
    },
  );

  server.registerTool(
    'fudic_add',
    {
      title: 'fudic add',
      description: 'Adds a fudic module to the project — di, forms, http, i18n or a library of the workspace — as `fudic add` does, and installs it.',
      inputSchema: {
        module: z.string().describe('di, forms, http, i18n, or the name of a library of the workspace'),
        project: z.string().optional().describe('In a workspace: the app or library it goes in'),
        locales: list.optional().describe('i18n: the languages, the first one the default'),
        dryRun,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ module, dryRun: dry, ...options }) => {
      if (!isFudicProject(project.root)) return respond(project, { body: {}, diagnostics: [FUD1404({ folder: project.root })], failed: true });
      const { cli } = await checks.fudic();
      const planned = await runPlan(cli, project, ['add', module, ...flagsOf(options as Record<string, OptionValue>)], { dryRun: dry });
      afterInstall(checks, planned);
      return respond(project, planned.answer);
    },
  );
}
