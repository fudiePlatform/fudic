// A shadow root the server rendered gets its shared stylesheets from its template. One
// opened with `attachShadow` adopts nothing, and no platform API resolves a
// `<style type="module" specifier>` for it yet. Until one does, this does it by hand; then
// this file and its one call site in `element.ts` go.

// One sheet per specifier, shared by every instance.
const sheets = new Map<string, CSSStyleSheet>();

function sheetOf(doc: Document, specifier: string): CSSStyleSheet | undefined {
  const cached = sheets.get(specifier);
  if (cached !== undefined) return cached;
  // Compared rather than put in a selector: a specifier is data, not CSS.
  for (const style of doc.querySelectorAll('style[type="module"][specifier]')) {
    if (style.getAttribute('specifier') !== specifier) continue;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(style.textContent);
    sheets.set(specifier, sheet);
    return sheet;
  }
  // Not cached when missing: it may still arrive.
  return undefined;
}

/**
 * Opens `shadow` with a `<link rel="stylesheet">` per file in the host's `data-fud-sheets`,
 * then adopts the sheets named in its `data-fud-adopt`, in order. `data-fud-sheets` is
 * removed once read, as the server never writes it.
 */
export function adoptSheets(host: Element, shadow: ShadowRoot): void {
  const files = (host.getAttribute('data-fud-sheets') ?? '').split(' ').filter(Boolean);
  if (files.length > 0) {
    const doc = host.ownerDocument;
    shadow.prepend(
      ...files.map((href) => {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        return link;
      }),
    );
    host.removeAttribute('data-fud-sheets');
  }
  const specifiers = (host.getAttribute('data-fud-adopt') ?? '').split(' ').filter(Boolean);
  if (specifiers.length === 0) return;
  const adopted: CSSStyleSheet[] = [];
  for (const specifier of specifiers) {
    const sheet = sheetOf(host.ownerDocument, specifier);
    if (sheet !== undefined) adopted.push(sheet);
  }
  shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, ...adopted];
}
