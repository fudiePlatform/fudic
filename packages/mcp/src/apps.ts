/**
 * MCP Apps: the one resource a chat that speaks them draws in the conversation, and the tools that
 * name it. A client that does not speak them reads the JSON as always; nothing of the resource
 * depends on the project.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { viewPage } from './view/page.js';

export { VIEW_META_KEY } from './view/page.js';

export const VIEW_URI = 'ui://fudic/view.html';

/** What a tool that the view draws carries in its `_meta`. */
export const VIEW_TOOL_META = { ui: { resourceUri: VIEW_URI } } as const;

let page: string | undefined;

/** The page, built once from the bundle the package depends on. */
export function viewHtml(): string {
  if (page === undefined) {
    const require = createRequire(import.meta.url);
    page = viewPage(readFileSync(require.resolve('@modelcontextprotocol/ext-apps/app-with-deps'), 'utf8'));
  }
  return page;
}

export function registerView(server: McpServer): void {
  registerAppResource(
    server,
    'fudic view',
    VIEW_URI,
    { description: 'How a fudic piece looks: a render, or the before and after of its look', mimeType: RESOURCE_MIME_TYPE },
    () => ({ contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: viewHtml() }] }),
  );
}
