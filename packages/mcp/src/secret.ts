/**
 * The secret in the URL: what keeps a URL that ends up in a log from opening the machine. Kept in
 * `.fudic/mcp/secret`, which git already ignores, so a restart keeps the connector working.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SHAPE = /^[0-9a-f]{64}$/u;

export function secretFile(root: string): string {
  return join(root, '.fudic', 'mcp', 'secret');
}

/** The project's secret; a new one when there is none, it is malformed, or `renew` asks for it. */
export function secretOf(root: string, renew = false): string {
  const file = secretFile(root);
  if (!renew && existsSync(file)) {
    const kept = readFileSync(file, 'utf8').trim();
    if (SHAPE.test(kept)) return kept;
  }
  const fresh = randomBytes(32).toString('hex');
  mkdirSync(join(root, '.fudic', 'mcp'), { recursive: true });
  writeFileSync(file, `${fresh}\n`, { mode: 0o600 });
  return fresh;
}
