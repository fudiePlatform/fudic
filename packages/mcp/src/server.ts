/**
 * The fudic MCP server: one `McpServer` per session, the same for both entries. The entry only
 * decides whether the file tools are there — an agent over stdio already has its own.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkProject } from './check.js';
import { Checks } from './checks.js';
import { FILE_TOOLS, registerFileTools } from './file-tools.js';
import { fixProject } from './fix.js';
import { formatProject } from './format.js';
import { SYMBOL_KINDS } from '@fudic/language-server/project';
import { contractOf, describeName, listSymbols } from './symbols.js';
import { Guide, TOPICS } from './guide.js';
import { instructions, newAppPrompt } from './instructions.js';
import type { Project } from './project.js';
import { respond } from './respond.js';
import { VERSION } from './version.js';

export type Entry = 'stdio' | 'http';

export interface ServerOptions {
  readonly project: Project;
  readonly entry: Entry;
  /** Shared by every session: the topics are read once. */
  readonly guide?: Guide;
  /** Shared by every session: one checker for the life of the server. */
  readonly checks?: Checks;
}

/** The names of the tools the server registers, for the instructions that name them. */
export function toolNames(entry: Entry): ReadonlySet<string> {
  return new Set([
    'fudic_guide',
    'fudic_check',
    'fudic_fix',
    'fudic_format',
    'fudic_symbols',
    'fudic_describe',
    'fudic_contract',
    ...(entry === 'http' ? FILE_TOOLS : []),
  ]);
}

/** The most diagnostics an answer lists unless asked: the summary counts them all. */
const CHECK_LIMIT = 20;

export function createServer(options: ServerOptions): McpServer {
  const { project, entry } = options;
  const guide = options.guide ?? new Guide();
  const checks = options.checks ?? new Checks(project.root);
  const tools = toolNames(entry);
  const server = new McpServer({ name: 'fudic', version: VERSION }, { instructions: instructions(tools) });

  server.registerTool(
    'fudic_guide',
    {
      title: 'fudic guide',
      description:
        'The fudic guide: how to write each kind of fudic file, and what a fudic diagnostic code means. ' +
        'Call it before writing a kind of file for the first time. ' +
        `Topics: ${TOPICS.join(', ')}; or a diagnostic code (FUD and four digits) for its why and its fix.`,
      inputSchema: { topic: z.string().describe(`One of ${TOPICS.join(', ')}, or a diagnostic code: FUD and four digits`) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ topic }) => {
      const result = guide.read(topic);
      if ('error' in result) return respond(project, { body: { topic }, diagnostics: [result.error], failed: true });
      return respond(project, { body: { ...result.page } });
    },
  );

  server.registerTool(
    'fudic_check',
    {
      title: 'fudic check',
      description:
        'The fudic project check: what the build would say, without building — .fud, TypeScript, .fudapi and .fudspec. ' +
        'Each diagnostic has its file:line:column and the line it is on; each fudic code is explained once. ' +
        '"paths" narrows the list, never the check: the whole project is always checked.',
      inputSchema: {
        paths: z.array(z.string()).optional().describe('Files or folders, relative to the project, to list the diagnostics of'),
        limit: z.number().int().positive().default(CHECK_LIMIT).describe('The most diagnostics to list; the summary counts all of them'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ paths, limit }) => respond(project, await checkProject(project, checks, { limit, ...(paths !== undefined ? { paths } : {}) })),
  );

  const paths = z.array(z.string()).optional().describe('Files or folders, relative to the project; without them, the whole project');
  const dryRun = z.boolean().default(false).describe('Only say what would change: nothing is written');

  server.registerTool(
    'fudic_fix',
    {
      title: 'fudic fix',
      description:
        'Applies the fudic repairs that have only one option — what the editor would do without asking — checks again ' +
        'and repeats, up to 5 rounds. Answers what was applied, the diff, and what is left; a diagnostic with several ' +
        'repairs lists them in "options", for you to choose and write.',
      inputSchema: {
        paths,
        codes: z.array(z.string()).optional().describe('Only these diagnostic codes'),
        dryRun,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ paths: asked, codes, dryRun: dry }) =>
      respond(
        project,
        await fixProject(project, checks, { dryRun: dry, ...(asked !== undefined ? { paths: asked } : {}), ...(codes !== undefined ? { codes } : {}) }),
      ),
  );

  server.registerTool(
    'fudic_format',
    {
      title: 'fudic format',
      description: 'Formats .fud, .fudspec and .fudapi files as `fudic fmt` does, and answers the diff.',
      inputSchema: { paths, dryRun },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ paths: asked, dryRun: dry }) =>
      respond(project, await formatProject(project, checks, { dryRun: dry, ...(asked !== undefined ? { paths: asked } : {}) })),
  );

  const lookup = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    'fudic_symbols',
    {
      title: 'fudic symbols',
      description:
        'What the fudic project has: routes, components, types, functions (connected when their handler is written, ' +
        'missing when not), middlewares, pipes and tokens — its own and its libraries\', each with where it is and its doc.',
      inputSchema: { kind: z.enum(SYMBOL_KINDS).optional().describe('One kind; without it, all of them') },
      annotations: lookup,
    },
    async ({ kind }) => respond(project, await listSymbols(project, checks, kind)),
  );

  server.registerTool(
    'fudic_describe',
    {
      title: 'fudic describe',
      description:
        'One thing of the fudic project in full: a component tag (its props, slots, events, parts, tokens, where it is ' +
        'used, and an example of use that compiles), a route (/products/:id), a type, a function (routes/products.save) or a token.',
      inputSchema: { name: z.string().describe('A tag, a route, a type, a function or a token, as fudic_symbols names it') },
      annotations: lookup,
    },
    async ({ name }) => respond(project, await describeName(project, checks, name)),
  );

  server.registerTool(
    'fudic_contract',
    {
      title: 'fudic contract',
      description:
        'What a fudic .fudapi asks you to implement: each declaration with a handler, its TypeScript signature, the file it ' +
        'goes in, whether it is written, and a skeleton of what is missing that compiles.',
      inputSchema: { id: z.string().describe('The id of the .fudapi: its path under src/, without the extension (routes/products)') },
      annotations: lookup,
    },
    async ({ id }) => respond(project, await contractOf(project, checks, id)),
  );

  if (entry === 'http') registerFileTools(server, project, checks);

  server.registerPrompt(
    'new-app',
    { title: 'New fudic app', description: 'Create a fudic app or library from this conversation' },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: newAppPrompt(tools) } }] }),
  );

  return server;
}
