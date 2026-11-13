/**
 * The headers fudic knows: how a continuation line joins each one, what its value accepts, and
 * the closed values the editor can offer. A new header is one line of `KNOWN`; a header that is
 * not here is legitimate and only its name is checked.
 */

import {
  cacheControl,
  COOP_VALUES,
  oneOf,
  permissionsPolicy,
  REFERRER_VALUES,
  referrerPolicy,
  strictTransportSecurity,
} from './checks.js';
import { checkCsp } from './csp.js';
import type { HeadersKind, ValueCheck } from './segments.js';

export interface KnownHeader {
  /** As MDN writes it. */
  readonly name: string;
  /** What joins a continuation line; absent when the value goes on one line. */
  readonly separator?: string;
  readonly check: ValueCheck;
  /** The values it takes, when they are a closed set. */
  readonly values?: readonly string[];
}

const TABLE: readonly KnownHeader[] = [
  { name: 'Content-Security-Policy', separator: '; ', check: checkCsp },
  { name: 'Cache-Control', separator: ', ', check: cacheControl },
  { name: 'Permissions-Policy', separator: ', ', check: permissionsPolicy },
  { name: 'Reporting-Endpoints', separator: ', ', check: () => [] },
  { name: 'Strict-Transport-Security', check: strictTransportSecurity },
  { name: 'Cross-Origin-Opener-Policy', check: oneOf(COOP_VALUES), values: COOP_VALUES },
  { name: 'Referrer-Policy', check: referrerPolicy, values: REFERRER_VALUES },
];

/** By lower-case name. */
export const KNOWN_HEADERS: ReadonlyMap<string, KnownHeader> = new Map(TABLE.map((h) => [h.name.toLowerCase(), h]));

/** The headers fudic sends itself, by file, lower case: writing one is `FUD1542`. */
export const FUDIC_HEADERS: Readonly<Record<HeadersKind, ReadonlySet<string>>> = (() => {
  const everywhere = ['content-type', 'content-length', 'transfer-encoding', 'location', 'set-cookie'];
  return {
    page: new Set([...everywhere, 'link']),
    sw: new Set([...everywhere, 'service-worker-allowed', 'cache-control']),
    assets: new Set(everywhere),
  };
})();

/** The files fudic serves with its own headers: a block of `assets.headers` for one is `FUD1542`. */
export const FUDIC_PATHS: readonly string[] = ['/fudic-sw.js', '/fudic-routes.json'];
