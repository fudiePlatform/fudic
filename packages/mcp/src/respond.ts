/**
 * The one shape every tool answers with: the version and the commit, the tool's own fields, the
 * diagnostics, and the one next step. As structured content, and as the same JSON in a text
 * block for a client that does not read structured content.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { codeTexts, outDiagnostic, type Problem, type ReadSource } from './diagnostics.js';
import type { Project } from './project.js';
import { VERSION } from './version.js';

/** A file of the project, as `at` and `quote` are read from. */
export const read: ReadSource = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

export interface Answer {
  /** The tool's own fields, in the order they should be read. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly diagnostics?: readonly Problem[];
  /** One sentence, or null when there is nothing left to do. */
  readonly next?: string | null;
  /** The tool could not do what it was asked. */
  readonly failed?: true;
  /** What goes beside the JSON and not to the model: what a chat's view draws. */
  readonly meta?: Readonly<Record<string, unknown>>;
  /** Blocks after the JSON's: the images a model sees. */
  readonly blocks?: readonly CallToolResult['content'][number][];
}

export function respond(project: Project, answer: Answer): CallToolResult {
  const diagnostics = (answer.diagnostics ?? []).map((d) => outDiagnostic(d, project.root, read));
  const codes = codeTexts(diagnostics.map((d) => d.code));
  const content = {
    fudicVersion: VERSION,
    commit: project.commit(),
    ...answer.body,
    diagnostics,
    ...(Object.keys(codes).length > 0 ? { codes } : {}),
    next: answer.next ?? null,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(content, null, 2) }, ...(answer.blocks ?? [])],
    structuredContent: content,
    ...(answer.failed === true ? { isError: true } : {}),
    ...(answer.meta !== undefined ? { _meta: answer.meta } : {}),
  };
}
