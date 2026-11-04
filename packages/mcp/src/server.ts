/**
 * The fudic MCP server: one `McpServer` per session, the same for both entries. The entry only
 * decides whether the file tools are there — an agent over stdio already has its own.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
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
}

/** The names of the tools the server registers, for the instructions that name them. */
export function toolNames(_entry: Entry): ReadonlySet<string> {
  return new Set(['fudic_guide']);
}

export function createServer(options: ServerOptions): McpServer {
  const { project, entry } = options;
  const guide = options.guide ?? new Guide();
  const tools = toolNames(entry);
  const server = new McpServer({ name: 'fudic', version: VERSION }, { instructions: instructions(tools) });

  server.registerTool(
    'fudic_guide',
    {
      title: 'fudic guide',
      description:
        'The fudic guide: how to write each kind of fudic file, and what a fudic diagnostic code means. ' +
        'Call it before writing a kind of file for the first time. ' +
        `Topics: ${TOPICS.join(', ')}; or a code such as FUD0540 for its why and its fix.`,
      inputSchema: { topic: z.string().describe(`One of ${TOPICS.join(', ')}, or a code such as FUD0540`) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ topic }) => {
      const result = guide.read(topic);
      if ('error' in result) return respond(project, { body: { topic }, diagnostics: [result.error], failed: true });
      return respond(project, { body: { ...result.page } });
    },
  );

  server.registerPrompt(
    'new-app',
    { title: 'New fudic app', description: 'Create a fudic app or library from this conversation' },
    () => ({ messages: [{ role: 'user', content: { type: 'text', text: newAppPrompt(tools) } }] }),
  );

  return server;
}
