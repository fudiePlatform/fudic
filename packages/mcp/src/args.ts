/** The command line of `fudic-mcp`. */

export const DEFAULT_PORT = 4317;

export interface Options {
  readonly http: boolean;
  readonly tunnel: boolean;
  readonly port: number;
  readonly newSecret: boolean;
}

export type Parsed = { readonly options: Options } | { readonly help: true } | { readonly error: string };

export const USAGE = `fudic-mcp — the fudic MCP server, for the project in the current folder

  fudic-mcp                      stdio, for an agent such as Claude Code (.mcp.json starts it)
  fudic-mcp --http               HTTP on 127.0.0.1:${DEFAULT_PORT}, for a chat
  fudic-mcp --http --tunnel      and a public URL through cloudflared
  fudic-mcp --http --port 5000   another port
  fudic-mcp --http --new-secret  a new secret: the old URL stops working
`;

export function parseArgs(argv: readonly string[]): Parsed {
  let http = false;
  let tunnel = false;
  let newSecret = false;
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg === '--http') http = true;
    else if (arg === '--tunnel') tunnel = true;
    else if (arg === '--new-secret') newSecret = true;
    else if (arg === '--port') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 65_535) return { error: '--port takes a number from 1 to 65535' };
      port = value;
      i += 1;
    } else return { error: `unknown option ${arg}` };
  }
  if ((tunnel || newSecret || port !== DEFAULT_PORT) && !http) return { error: '--tunnel, --port and --new-secret go with --http' };
  return { options: { http, tunnel, port, newSecret } };
}
