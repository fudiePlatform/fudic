/**
 * What the CLI writes, and what a missing file reads as: one text, so the two never differ.
 * The page policy is the strict CSP Lighthouse asks for; `'unsafe-inline' https:` behind
 * `'strict-dynamic'` only count in browsers without nonces.
 */

import type { HeadersKind } from './segments.js';

export const HEADERS_TEMPLATES: Readonly<Record<HeadersKind, string>> = {
  page: `# The headers of every page: what the server sends and what the Service Worker paints.
# The 103 Early Hints carry only the Content-Security-Policy and the Referrer-Policy.
# {nonce} is the nonce of each response: fudic writes it on its own scripts and styles.

Content-Security-Policy:
  default-src 'self'
  script-src 'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline' https:
  style-src 'self' 'unsafe-inline'
  img-src 'self' data:
  object-src 'none'
  base-uri 'none'
  frame-ancestors 'none'
  require-trusted-types-for 'script'
  trusted-types fudic
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
`,
  sw: `# The headers of /fudic-sw.js. A Service Worker does not inherit the page's policy.
# 'unsafe-eval' is what lets it link the route chunks: without it the app is served without it.

Content-Security-Policy:
  default-src 'self'
  script-src 'self' 'unsafe-eval'
`,
  assets: `# The headers of the app's static files, by path without the base.
# The most specific path wins, header by header. An empty value sends nothing.

/**
  Cache-Control: no-cache

/assets/**
  Cache-Control: public, max-age=31536000, immutable
`,
};
