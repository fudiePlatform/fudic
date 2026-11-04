/**
 * The three file tools, registered only over HTTP: an agent over stdio has its own, and a client
 * with tools to spare chooses worse.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkProject } from './check.js';
import type { Checks } from './checks.js';
import { filesUnder, READ_LIMIT, readLines, writeFile } from './files.js';
import type { Project } from './project.js';
import { respond } from './respond.js';

export const FILE_TOOLS: readonly string[] = ['fudic_files', 'fudic_read', 'fudic_write'];

/** The diagnostics a write answers with, of what it wrote. */
const WRITE_LIMIT = 50;

export function registerFileTools(server: McpServer, project: Project, checks: Checks): void {
  server.registerTool(
    'fudic_files',
    {
      title: 'fudic files',
      description:
        'The files of the fudic project, relative to its root, without node_modules, dist, .git, .fudic or what git ignores.',
      inputSchema: { under: z.string().optional().describe('A folder of the project, to list only what is under it') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ under }) => {
      const result = filesUnder(project.root, project.git, under);
      if ('error' in result) return respond(project, { body: {}, diagnostics: [result.error], failed: true });
      return respond(project, { body: { files: result.files } });
    },
  );

  server.registerTool(
    'fudic_read',
    {
      title: 'fudic read',
      description: 'A file of the fudic project, with its line numbers.',
      inputSchema: {
        path: z.string().describe('Relative to the project root'),
        offset: z.number().int().positive().default(1).describe('The first line, from 1'),
        limit: z.number().int().positive().default(READ_LIMIT).describe('How many lines'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ path, offset, limit }) => {
      const result = readLines(project.root, { path, offset, limit });
      if ('error' in result) return respond(project, { body: {}, diagnostics: [result.error], failed: true });
      return respond(project, { body: result.body });
    },
  );

  server.registerTool(
    'fudic_write',
    {
      title: 'fudic write',
      description:
        'Writes a file of the fudic project — the whole "content", or "edits" where each "old" is in the file exactly once, ' +
        'all or none — and answers at once with the diagnostics of what was written, as fudic_check does. Runs nothing.',
      inputSchema: {
        path: z.string().describe('Relative to the project root; missing folders are created'),
        content: z.string().optional().describe('The whole new text of the file'),
        edits: z
          .array(z.object({ old: z.string().describe('Text that is in the file once'), new: z.string().describe('What replaces it') }))
          .optional()
          .describe('Replacements, applied in order; if one does not match, nothing is written'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ path, content, edits }) => {
      const written =
        content !== undefined ? writeFile(project.root, { path, content }) : writeFile(project.root, { path, edits: edits ?? [] });
      if ('error' in written) return respond(project, { body: {}, diagnostics: [written.error], failed: true });
      const checked = await checkProject(project, checks, { paths: [written.path], limit: WRITE_LIMIT });
      return respond(project, { ...checked, body: { written: written.shown, ...checked.body } });
    },
  );
}
