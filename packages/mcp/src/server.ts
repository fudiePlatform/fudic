/**
 * The fudic MCP server: one `McpServer` per session, the same for both entries. The entry only
 * decides whether the file tools are there — an agent over stdio already has its own.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { registerView, VIEW_TOOL_META } from './apps.js';
import { ENGINES, RENDER_AS, renderTool } from './render.js';
import { callTool } from './call.js';
import { previewTool } from './preview.js';
import { stdioSite, type Site } from './site.js';
import { checkProject } from './check.js';
import { Checks } from './checks.js';
import { FILE_TOOLS, registerFileTools } from './file-tools.js';
import { fixProject } from './fix.js';
import { formatProject } from './format.js';
import { SYMBOL_KINDS } from '@fudic/language-server/project';
import { contractOf, describeName, listSymbols } from './symbols.js';
import { registerProjectTools } from './project-tools.js';
import { RECORD_EVENTS, recordEvent } from './record.js';
import { RunQueue, runSpecsTool, runTestsTool } from './runs.js';
import { Guide, TOPICS } from './guide.js';
import { instructions, newAppPrompt } from './instructions.js';
import type { Project } from './project.js';
import { respond } from './respond.js';
import { Session } from './session.js';
import { statusOf } from './status.js';
import { VERSION } from './version.js';

export type Entry = 'stdio' | 'http';

export interface ServerOptions {
  readonly project: Project;
  readonly entry: Entry;
  /** Shared by every session: the topics are read once. */
  readonly guide?: Guide;
  /** Shared by every session: one checker for the life of the server. */
  readonly checks?: Checks;
  /** Shared by every session: one run of tests or criteria at a time, for the whole server. */
  readonly queue?: RunQueue;
  /** Shared by every session: the app's dev server, and where it is seen from. */
  readonly site?: Site;
}

/** The names of the tools the server registers, for the instructions that name them. */
export function toolNames(entry: Entry): ReadonlySet<string> {
  return new Set([
    'fudic_guide',
    'fudic_status',
    'fudic_check',
    'fudic_fix',
    'fudic_format',
    'fudic_symbols',
    'fudic_describe',
    'fudic_contract',
    'fudic_new',
    'fudic_generate',
    'fudic_add',
    'fudic_record',
    'fudic_test',
    'fudic_spec_run',
    'fudic_render',
    'fudic_call',
    'fudic_preview',
    ...(entry === 'http' ? FILE_TOOLS : []),
  ]);
}

/** The most diagnostics an answer lists unless asked: the summary counts them all. */
const CHECK_LIMIT = 20;

export function createServer(options: ServerOptions): McpServer {
  const { project, entry } = options;
  const guide = options.guide ?? new Guide();
  const checks = options.checks ?? new Checks(project.root);
  const queue = options.queue ?? new RunQueue();
  const site = options.site ?? stdioSite(project.root);
  const tools = toolNames(entry);
  // One server per MCP session: what it remembers dies with it.
  const session = new Session();
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
      session.read(result.page.topic);
      return respond(project, { body: { ...result.page } });
    },
  );

  server.registerTool(
    'fudic_status',
    {
      title: 'fudic status',
      description:
        'Where the fudic project is, and the one next step: the first call for any fudic task. Lists each component and ' +
        'route with its phase — criteria, api, red, view, connect, document, showcase, done — and says what to do next, ' +
        'one step at a time. Without a project, what to ask the user to create one.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => respond(project, await statusOf(project, checks, session)),
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

  registerProjectTools(server, project, checks);

  server.registerTool(
    'fudic_record',
    {
      title: 'fudic record',
      description:
        'Writes in the history of a fudic piece what a person decided, or that it is finished: "approved" (its props and ' +
        'criteria, only after the user approved them in this conversation), "accepted" (the client accepted it, with the ' +
        "user's words in text), \"reopened\" (a change to its contract, with text) or \"done\" (every phase finished).",
      inputSchema: {
        piece: z.string().describe("A component's or a route's .fud, or its folder, relative to the project"),
        event: z.enum(RECORD_EVENTS),
        text: z.string().optional().describe('accepted and reopened: what the user said, in their words'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ piece, event, text }) =>
      respond(project, await recordEvent(project, checks, { piece, event, ...(text !== undefined ? { text } : {}) })),
  );

  server.registerTool(
    'fudic_test',
    {
      title: 'fudic test',
      description:
        "Runs the fudic project's unit tests, in process, and writes the run in each piece's history. Says how many pass, " +
        'fail (an assertion said no) and are broken (a test that never got to say: it threw, its file did not load), and ' +
        'details only what did not pass.',
      inputSchema: {
        paths: z.array(z.string()).optional().describe('Test files or folders; without them, every test'),
        names: z.array(z.string()).optional().describe('Only tests whose full name contains one of these'),
        failing: z.boolean().default(false).describe('Only what did not pass in the last run'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ paths: asked, names, failing }) =>
      respond(
        project,
        await runTestsTool(project, checks, queue, { failing, ...(asked !== undefined ? { paths: asked } : {}), ...(names !== undefined ? { names } : {}) }),
      ),
  );

  server.registerTool(
    'fudic_spec_run',
    {
      title: 'fudic spec run',
      description:
        "Runs the acceptance criteria of the fudic project's .fudspec files in a browser, and writes the run in each piece's " +
        'history. For what did not pass: the step in red with what was expected and what came out, the element in its .fud, ' +
        'and a screenshot.',
      inputSchema: {
        spec: z.string().optional().describe('A component tag, a route, or a .fudspec; without it, every piece'),
        criteria: z.array(z.string()).optional().describe('Only the criteria with these ids'),
        failing: z.boolean().default(false).describe('Only what did not pass in the last run'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ spec, criteria, failing }) =>
      respond(
        project,
        await runSpecsTool(project, checks, queue, { failing, ...(spec !== undefined ? { spec } : {}), ...(criteria !== undefined ? { criteria } : {}) }),
      ),
  );

  registerView(server);

  registerAppTool(
    server,
    'fudic_render',
    {
      title: 'fudic render',
      description:
        'Paints one fudic piece at once, with no server started, and answers what it reads: its outline (roles, names and ' +
        'states, the words a .fudspec finds it by) or its HTML with the declarative shadow DOM; in a chat that draws it, ' +
        'the piece itself. A component is painted with a case of its fixture — prefer "fixture", a state someone ' +
        'approved, to "props" —, a route by a concrete URL. "engine": "browser" paints it in a real browser, for when ' +
        'CSS or layout matter. Seeing is not approving.',
      inputSchema: {
        component: z.string().optional().describe('A component tag: acme-button'),
        route: z.string().optional().describe('A concrete URL of a route: /products/42'),
        fixture: z.string().optional().describe('A case of the component\'s fixture'),
        props: z.record(z.string(), z.unknown()).optional().describe('Props, as JSON, on top of the case'),
        as: z.enum(RENDER_AS).default('outline'),
        select: z.string().optional().describe('A CSS selector, through shadow roots, that narrows what is answered'),
        engine: z.enum(ENGINES).default('happy-dom'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: VIEW_TOOL_META,
    },
    async ({ component, route, fixture, props, as, select, engine }) =>
      respond(
        project,
        await renderTool(project, checks, queue, {
          as,
          engine,
          ...(component !== undefined ? { component } : {}),
          ...(route !== undefined ? { route } : {}),
          ...(fixture !== undefined ? { fixture } : {}),
          ...(props !== undefined ? { props } : {}),
          ...(select !== undefined ? { select } : {}),
        }),
      ),
  );

  server.registerTool(
    'fudic_call',
    {
      title: 'fudic call',
      description:
        'What a function of a fudic .fudapi answers to a call: the same request the page would make, to the dev server, ' +
        'through its middlewares, its rules and its fails. Answers its status and its value, or its Problem — an answer, ' +
        'not an error. It goes without a session: a function behind one answers its 401.',
      inputSchema: {
        fn: z.string().describe('The function: routes/products.save, as fudic_symbols names it'),
        args: z.unknown().optional().describe('Its arguments as JSON, in the shape of the signature fudic_contract gives'),
        params: z.record(z.string(), z.string()).optional().describe('The values of the route params of its id: { "id": "42" } for routes/products/[id]'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ fn, args, params }) =>
      respond(project, await callTool(project, checks, site, { fn, ...(args !== undefined ? { args } : {}), ...(params !== undefined ? { params } : {}) })),
  );

  server.registerTool(
    'fudic_preview',
    {
      title: 'fudic preview',
      description:
        'The whole fudic app, running, at a URL a person opens — from a phone too, through the tunnel. Starts the dev ' +
        'server the first time and keeps it: what you write is seen without calling again. Answers the URL and the ' +
        'concrete routes that can be opened. Opening it is seeing, not approving.',
      inputSchema: { route: z.string().optional().describe('A concrete URL to open at: /products/42') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ route }) => respond(project, await previewTool(project, checks, site, route !== undefined ? { route } : {})),
  );

  if (entry === 'http') registerFileTools(server, project, checks);

  server.registerPrompt(
    'new-app',
    { title: 'New fudic app', description: 'Create a fudic app or library from this conversation' },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: newAppPrompt(tools) } }] }),
  );

  return server;
}
