/**
 * The one shape every tool answers with: the version and the commit, the tool's own fields, the
 * diagnostics, and the one next step. As structured content, and as the same JSON in a text
 * block for a client that does not read structured content.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FudDiagnostic } from '@fudic/diagnostics';
import { readFileSync } from 'node:fs';
import { codeTexts, outDiagnostic, type ReadSource } from './diagnostics.js';
import type { Project } from './project.js';
import { VERSION } from './version.js';

const readSource: ReadSource = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

export interface Answer {
  /** The tool's own fields, in the order they should be read. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly diagnostics?: readonly FudDiagnostic[];
  /** One sentence, or null when there is nothing left to do. */
  readonly next?: string | null;
  /** The tool could not do what it was asked. */
  readonly failed?: true;
}

export function respond(project: Project, answer: Answer): CallToolResult {
  const diagnostics = (answer.diagnostics ?? []).map((d) => outDiagnostic(d, project.root, readSource));
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
    content: [{ type: 'text', text: JSON.stringify(content, null, 2) }],
    structuredContent: content,
    ...(answer.failed === true ? { isError: true } : {}),
  };
}
