/**
 * The asset linker (SDD-19 §4.5). Vite is blind to URLs baked into emitted strings
 * (`$dom.setAttr($n,'src',"./logo.png")`) and inside `export const css = \`… url(…) …\``.
 * Under the plugin's `linkAssets` mode the emit turns each static, relative asset URL
 * into a real ES import — `import __fudic_asset_0 from "./logo.png"` — and references
 * the binding instead of the literal, so Vite owns resolution, hashing, `base` and the
 * immutable cache exactly as it does for the `.fud` graph. Absolute, scheme, data,
 * protocol-relative, root-absolute (public) and fragment URLs are left untouched, as
 * are dynamic (computed) refs — the permissive stance of "we don't touch what we can't
 * see".
 *
 * v1 links single-URL attributes (`src`, `poster`, `<link href>`) and CSS `url(…)`;
 * `srcset` (a multi-URL descriptor list) is a documented follow-up.
 */

/** Escape a literal chunk for embedding in a template literal (backtick/backslash/`$`). */
const escapeTpl = (s: string): string => s.replace(/[`\\$]/gu, '\\$&');

export class AssetLinker {
  readonly #enabled: boolean;
  readonly #imports: string[] = [];
  readonly #bySpec = new Map<string, string>();
  #id = 0;

  constructor(enabled: boolean) {
    this.#enabled = enabled;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  /**
   * A static, relative specifier the bundler can resolve to a hashed asset. Rejects
   * schemes (`http:`, `data:`, …), protocol-relative (`//`), root-absolute/public
   * (`/x`), and in-page fragments (`#x`) — those are already final URLs.
   */
  static linkable(spec: string): boolean {
    if (spec === '') return false;
    if (/^[a-z][a-z0-9+.-]*:/iu.test(spec)) return false; // scheme: http:, data:, blob:, mailto:
    if (spec.startsWith('//')) return false; // protocol-relative
    if (spec.startsWith('/')) return false; // root-absolute (Vite public dir, served as-is)
    if (spec.startsWith('#')) return false; // in-page fragment
    return true; // relative path → link through Vite
  }

  /** The JS expression (an import binding) for a specifier, registering its import once. */
  ref(spec: string): string {
    let name = this.#bySpec.get(spec);
    if (name === undefined) {
      name = `__fudic_asset_${this.#id++}`;
      this.#bySpec.set(spec, name);
      this.#imports.push(`import ${name} from ${JSON.stringify(spec)};`);
    }
    return name;
  }

  /** The import lines to emit at the top of the module (empty when nothing was linked). */
  imports(): readonly string[] {
    return this.#imports;
  }

  /**
   * Build the `export const css` template-literal body (including its backticks),
   * rewriting each linkable `url(…)` to `url(${binding})`. When disabled or with no
   * linkable URLs this is byte-identical to the plain escaped template.
   */
  cssTemplate(css: string): string {
    if (!this.#enabled) return '`' + escapeTpl(css) + '`';
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gu;
    let out = '`';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      const spec = m[2]!;
      if (!AssetLinker.linkable(spec)) continue;
      out += escapeTpl(css.slice(last, m.index)) + 'url(${' + this.ref(spec) + '})';
      last = m.index + m[0].length;
    }
    return out + escapeTpl(css.slice(last)) + '`';
  }
}
