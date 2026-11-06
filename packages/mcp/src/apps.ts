/**
 * MCP Apps: the one resource a chat that speaks them draws in the conversation, and the tools that
 * name it. A client that does not speak them reads the JSON as always; nothing of the resource
 * depends on the project.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { RESOURCE_MIME_TYPE, getUiCapability, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Answer } from './respond.js';
import type { Site } from './site.js';
import { VIEW_META_KEY, viewPage } from './view/page.js';

export { VIEW_META_KEY } from './view/page.js';

interface ShotView {
  readonly kind?: string;
  readonly png?: string;
  readonly cases?: readonly { readonly case: string; readonly before?: string; readonly after?: string }[];
}

/**
 * The answer as a chat reads it. The tools put the paths of their shots in `_meta`; here they
 * become the URLs this server serves them at: the view loads them, and the model gets them too,
 * to hand to the user. And `shown` tells the model what the user already sees: `_meta` never
 * reaches it, so without it it says there is nothing to see. Only when the client said it draws
 * MCP Apps; whether it did draw this one, no server can know.
 */
export function forChat(server: McpServer, site: Site, answer: Answer): Answer {
  const view = answer.meta?.[VIEW_META_KEY] as ShotView | undefined;
  if (view === undefined) return answer;
  const url = (path: string | undefined): string | undefined => (path === undefined ? undefined : (site.shotUrl(path) ?? path));
  const urls = (c: { readonly before?: string; readonly after?: string }): Record<string, string> => {
    const before = url(c.before);
    const after = url(c.after);
    return { ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) };
  };
  const drawn: ShotView =
    view.kind === 'shot'
      ? { ...view, png: url(view.png)! }
      : view.kind === 'look'
        ? { ...view, cases: view.cases!.map((c) => ({ ...c, ...urls(c) })) }
        : view;
  let body: Readonly<Record<string, unknown>> = answer.body;
  if (view.kind === 'shot') body = { ...body, shot: url(view.png) };
  if (view.kind === 'look') {
    const byCase = new Map(drawn.cases!.map((c) => [c.case, c]));
    const cases = (body.cases as readonly Record<string, unknown>[]).map((c) => {
      const seen = byCase.get(c.case as string);
      if (seen === undefined) return c;
      return { ...c, ...(seen.before !== undefined ? { beforeUrl: seen.before } : {}), ...(seen.after !== undefined ? { afterUrl: seen.after } : {}) };
    });
    body = { ...body, cases };
  }
  const capabilities = server.server.getClientCapabilities() as Parameters<typeof getUiCapability>[0];
  const draws = getUiCapability(capabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE) === true;
  if (draws) body = { ...body, shown: view.kind === 'render' ? 'html' : 'image' };
  return { ...answer, body, meta: { ...answer.meta, [VIEW_META_KEY]: drawn } };
}

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

export function registerView(server: McpServer, site: Site): void {
  registerAppResource(
    server,
    'fudic view',
    VIEW_URI,
    { description: 'How a fudic piece looks: a render, or the before and after of its look', mimeType: RESOURCE_MIME_TYPE },
    // The shots are images of this server's: the view may load them from its origins, and only those.
    () => ({
      contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: viewHtml(), _meta: { ui: { csp: { resourceDomains: [...site.shotOrigins()] } } } }],
    }),
  );
}
