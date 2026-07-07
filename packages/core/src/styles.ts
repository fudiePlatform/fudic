/**
 * `styles` — the `<style host>` registry (SDD-14 §4.7, decisions 67–70). The
 * single CSS source is the `<style host="tag">` the serialization hoists into
 * the page head, one per component. SSR/DSD instances are adopted pre-paint by
 * the page polyfill the compiler emits (not part of core); this registry covers
 * only client-side creation (the `create()` path): it builds the constructed
 * sheet once from the head and pushes the same reference into every root.
 */

export interface StyleRegistry {
  /** Adopt the sheet built from `style[host="tag"]`; no-op without one. Idempotent per root. */
  adopt(root: ShadowRoot, tag: string): void;
}

/** Valid custom-element tag (hyphen mandatory); also keeps the selector well-formed. */
const HOST_TAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

class HeadStyleRegistry implements StyleRegistry {
  private readonly sheets = new Map<string, CSSStyleSheet>();

  adopt(root: ShadowRoot, tag: string): void {
    const sheet = this.sheetFor(tag);
    if (sheet === null || root.adoptedStyleSheets.includes(sheet)) {
      return;
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  }

  private sheetFor(tag: string): CSSStyleSheet | null {
    const cached = this.sheets.get(tag);
    if (cached !== undefined) {
      return cached;
    }
    if (!HOST_TAG.test(tag)) {
      return null;
    }
    const styleEl = document.querySelector(`style[host="${tag}"]`);
    if (styleEl === null) {
      return null;
    }
    // Constructed sheet: adopting `styleEl.sheet` directly throws NotAllowedError.
    const sheet = new CSSStyleSheet();
    // An element's textContent is never null (only documents/doctypes yield null).
    sheet.replaceSync(styleEl.textContent as string);
    this.sheets.set(tag, sheet);
    return sheet;
  }
}

export const styles: StyleRegistry = new HeadStyleRegistry();
