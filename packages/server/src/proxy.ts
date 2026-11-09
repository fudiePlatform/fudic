/**
 * The public URL of a request that came through a proxy (SDD-81 §3.12).
 *
 * Read only when whoever mounts the server says it trusts the proxy in front of it: without one,
 * any client could send these headers and pass for another origin. `Forwarded` (RFC 7239) wins;
 * without it, `X-Forwarded-Proto` and `X-Forwarded-Host`. Of each, the first entry: the one the
 * proxy closest to the client wrote. A value that is not `http`/`https`, or not a host, is
 * ignored.
 */

/** `host`, `host:port` or `[v6]:port`: what may stand for a host in a URL. */
const HOST = /^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/iu;

/** The first entry of a list header: `a, b` → `a`. */
const first = (value: string | null): string | undefined => value?.split(',')[0]?.trim() || undefined;

/** `proto=https;host=app.example` (the first element of `Forwarded`) as its pairs. */
function forwardedPairs(header: string | null): ReadonlyMap<string, string> {
  const pairs = new Map<string, string>();
  for (const pair of first(header)?.split(';') ?? []) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    pairs.set(pair.slice(0, eq).trim().toLowerCase(), pair.slice(eq + 1).trim().replace(/^"(.*)"$/u, '$1'));
  }
  return pairs;
}

/** The scheme and host the client asked for, as far as the proxy says. */
export function forwardedOrigin(headers: Headers): { readonly proto?: string; readonly host?: string } {
  const pairs = forwardedPairs(headers.get('forwarded'));
  const proto = (pairs.get('proto') ?? first(headers.get('x-forwarded-proto')))?.toLowerCase();
  const host = pairs.get('host') ?? first(headers.get('x-forwarded-host'));
  return {
    ...(proto === 'http' || proto === 'https' ? { proto } : {}),
    ...(host !== undefined && HOST.test(host) ? { host } : {}),
  };
}

/**
 * `request` with its public URL, or itself when nothing changes. The body goes along as it is: a
 * stream is handed over, never read.
 */
export function publicRequest(request: Request): Request {
  const { proto, host } = forwardedOrigin(request.headers);
  if (proto === undefined && host === undefined) return request;
  const url = new URL(request.url);
  if (proto !== undefined) url.protocol = `${proto}:`;
  if (host !== undefined) {
    // Setting `host` without a port keeps the old one: `localhost:3000` would become `app:3000`.
    url.port = '';
    url.host = host;
  }
  if (url.href === request.url) return request;
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(request.body !== null ? { body: request.body, duplex: 'half' } : {}),
  } as RequestInit);
}
