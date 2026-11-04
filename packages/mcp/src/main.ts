/**
 * What `fudic-mcp` does: over stdio it speaks MCP on stdout and says nothing else there; over
 * HTTP it prints the one useful thing, the URL to paste into the chat.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { format } from '@fudic/diagnostics';
import { parseArgs, USAGE, type Options } from './args.js';
import { Checks } from './checks.js';
import { RunQueue } from './runs.js';
import { Guide } from './guide.js';
import { startHttp } from './http.js';
import { openProject, type Project } from './project.js';
import { secretOf } from './secret.js';
import { createServer } from './server.js';
import { openTunnel, type TunnelResult } from './tunnel.js';

export interface MainDeps {
  readonly cwd: string;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  readonly tunnel: (port: number) => Promise<TunnelResult>;
  /** Called with what to stop when the process is asked to end. */
  readonly onStop: (stop: () => void) => void;
}

async function serveHttp(project: Project, options: Options, deps: MainDeps): Promise<number> {
  const guide = new Guide();
  const checks = new Checks(project.root);
  const queue = new RunQueue();
  let entry;
  try {
    entry = await startHttp({
      port: options.port,
      secret: secretOf(project.root, options.newSecret),
      create: () => createServer({ project, entry: 'http', guide, checks, queue }),
    });
  } catch (error) {
    deps.err(`fudic-mcp: cannot listen on 127.0.0.1:${options.port}: ${(error as Error).message}\n`);
    return 1;
  }
  const lines = [`fudic MCP · project ${project.name} · http`, `  local   ${entry.url}`];
  let close = (): void => undefined;
  if (options.tunnel) {
    const result = await deps.tunnel(options.port);
    if ('tunnel' in result) {
      const path = new URL(entry.url).pathname;
      lines.push(`  public  ${result.tunnel.url}${path}`, 'Add the public URL in Claude: Settings → Connectors → Add custom connector.');
      close = result.tunnel.close;
    } else if ('missing' in result) {
      lines.push(format(result.missing));
    } else {
      lines.push(`  no public URL: ${result.failed}`);
    }
  }
  lines.push('Anyone with this URL can read and write this project. Stop with Ctrl+C.');
  deps.out(`${lines.join('\n')}\n`);
  deps.onStop(() => {
    close();
    void entry.close();
  });
  return 0;
}

export async function main(argv: readonly string[], deps: MainDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if ('help' in parsed) {
    deps.out(USAGE);
    return 0;
  }
  if ('error' in parsed) {
    deps.err(`fudic-mcp: ${parsed.error}\n\n${USAGE}`);
    return 1;
  }
  const project = openProject(deps.cwd);
  if (parsed.options.http) return serveHttp(project, parsed.options, deps);
  await createServer({ project, entry: 'stdio' }).connect(new StdioServerTransport());
  return 0;
}

export function nodeDeps(): MainDeps {
  return {
    cwd: process.cwd(),
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    tunnel: (port) => openTunnel(port),
    onStop: (stop) => {
      process.once('SIGINT', () => {
        stop();
        process.exit(0);
      });
    },
  };
}
