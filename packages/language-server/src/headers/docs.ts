/**
 * What the hover says in a `.headers` file (SDD-84 §3.8): what a header or a CSP directive does,
 * in a line or two, and its page on MDN. One entry per header of the reader's table and per CSP3
 * directive; a test holds the two lists together, so a header the reader learns has its hover.
 */

const MDN = 'https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers';

/** By lower-case name: the headers the reader knows. */
export const HEADER_DOCS: Readonly<Record<string, { readonly name: string; readonly text: string }>> = {
  'content-security-policy': {
    name: 'Content-Security-Policy',
    text: 'What the page may load and run: one directive per line. `{nonce}` is the nonce of each response; fudic writes it on its own scripts and styles.',
  },
  'cache-control': {
    name: 'Cache-Control',
    text: 'How long the browser and the caches between keep a response, and whether they ask again first.',
  },
  'permissions-policy': {
    name: 'Permissions-Policy',
    text: 'Which browser features the page and its frames may use: `camera=()`, `geolocation=(self)`.',
  },
  'reporting-endpoints': {
    name: 'Reporting-Endpoints',
    text: 'Where the browser sends its reports, by name: what `report-to` of a CSP names.',
  },
  'strict-transport-security': {
    name: 'Strict-Transport-Security',
    text: 'Only HTTPS to this host for `max-age` seconds. Sent over HTTPS only, never by the Service Worker. Remove the line if a proxy already sends it, or a subdomain is served over HTTP.',
  },
  'cross-origin-opener-policy': {
    name: 'Cross-Origin-Opener-Policy',
    text: 'Whether a window this page opens, or that opens it, shares its browsing context group. With a login in a popup, `same-origin-allow-popups`.',
  },
  'referrer-policy': {
    name: 'Referrer-Policy',
    text: 'What the `Referer` of a request says. `back` reads the path within the origin: `no-referrer`, `origin` and `strict-origin` leave it empty.',
  },
};

/** By name: every CSP3 directive. */
export const DIRECTIVE_DOCS: Readonly<Record<string, string>> = {
  'default-src': 'The fallback of every `-src` directive that is not written.',
  'child-src': 'Workers and nested browsing contexts, where `worker-src` or `frame-src` is not written.',
  'connect-src': 'What `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource` may reach.',
  'font-src': 'Where fonts load from.',
  'frame-src': 'What `<iframe>` and `<frame>` may load.',
  'img-src': 'Where images and favicons load from.',
  'manifest-src': 'Where the web app manifest loads from.',
  'media-src': 'Where `<audio>`, `<video>` and `<track>` load from.',
  'object-src': "What `<object>` and `<embed>` may load. `'none'`: they are a way around the policy.",
  'script-src': "Which scripts run. With `'strict-dynamic'`, what a script with the nonce loads runs too, and hosts and schemes are ignored.",
  'script-src-elem': '`script-src` for `<script>` elements only.',
  'script-src-attr': '`script-src` for event handler attributes only.',
  'style-src': 'Which stylesheets and `<style>` apply.',
  'style-src-elem': '`style-src` for `<style>` and `<link rel="stylesheet">` only.',
  'style-src-attr': '`style-src` for `style` attributes only.',
  'worker-src': 'Where workers, shared workers and Service Workers load from.',
  'fenced-frame-src': 'What `<fencedframe>` may load.',
  'base-uri': "What `<base>` may set. `'none'`: no `<base>` can redirect relative URLs.",
  'form-action': 'Where a form may be submitted.',
  'frame-ancestors': "Who may frame the page. `'none'`: nobody, which stops clickjacking.",
  sandbox: 'Applies a sandbox to the page, as the `sandbox` attribute of an iframe does.',
  'report-uri': 'Where violations are posted. Deprecated: `report-to`.',
  'report-to': 'The `Reporting-Endpoints` name violations are sent to.',
  'require-trusted-types-for': "`'script'`: the DOM sinks that parse HTML or run code take only Trusted Types.",
  'trusted-types': 'The Trusted Types policies the page may create. fudic creates `fudic`.',
  'upgrade-insecure-requests': 'Requests every `http:` URL of the page over `https:`.',
  webrtc: "Whether WebRTC may connect: `'allow'` or `'block'`.",
};

/** The hover over a header's name; undefined for a header the reader does not know. */
export function headerHover(name: string): string | undefined {
  const doc = HEADER_DOCS[name.toLowerCase()];
  return doc === undefined ? undefined : `**${doc.name}**\n\n${doc.text}\n\n[MDN](${MDN}/${doc.name})`;
}

/** The hover over a CSP directive; undefined for a word that is not one. */
export function directiveHover(directive: string): string | undefined {
  const text = DIRECTIVE_DOCS[directive.toLowerCase()];
  return text === undefined
    ? undefined
    : `**${directive.toLowerCase()}**\n\n${text}\n\n[MDN](${MDN}/Content-Security-Policy/${directive.toLowerCase()})`;
}
