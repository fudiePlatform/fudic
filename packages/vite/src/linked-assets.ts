/**
 * The files a `.fud` links, and the one place that names them.
 *
 * A build of this framework is not one build: the host bundles the client graph, the link
 * pass bundles what the Service Worker loads, and the edge pass bundles what renders a page
 * in Node. Each of them compiles the same `.fud`, so each of them meets the same
 * `<link rel="stylesheet" href="./theme.css">` — and if each asks the bundler to name that
 * file, each gets a different name, because a bundler's asset hash is a property of the
 * build and not only of the bytes. The page then ships a URL that names a file nobody wrote.
 *
 * So the name is computed here instead, from the file's own bytes, and every pass that
 * resolves the import gets the same string back. It is the doctrine the framework already
 * applies to its own chunks — pin the name, do not let two builds invent it — carried over
 * to the files a user links.
 *
 * Publishing is separate from naming, and only the host build publishes. A nested pass
 * registers what it saw; the host writes each file exactly once, under the name everyone
 * was told.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative as relativePath, resolve as resolvePath } from 'node:path';
import { AssetLinker, compactProjectCss, type AssetOrigin, type AssetUrl } from '@fudic/compiler';

/**
 * A file a document links is published as a file. There is no inlining, at no size.
 *
 * The threshold this module was born with was Vite's — under 4096 bytes, a `data:` URI —
 * and it is the right default for an asset imported by a MODULE, where the alternative is a
 * request per icon on a page that already parsed the code naming them. It is the wrong one
 * for a file a DOCUMENT links, and the argument was already written down here for `.css`:
 * a data URI is not revalidated, is not precached, is repeated in full in every page that
 * links it, and dies under a `default-src` that does not name `data:`. Not one of those
 * sentences is about stylesheets. A favicon is the case that made it obvious — three
 * hundred bytes, one per page, in every page of the site, forever.
 *
 * And the weight is not even a wash: base64 is a third bigger than the bytes it carries,
 * and it lands inside a document that cannot be cached the way the file could.
 */
const MIME: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

const extOf = (path: string): string => {
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return dot > slash ? path.slice(dot).toLowerCase() : '';
};

const baseNameOf = (path: string): string => {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = path.slice(slash + 1);
  const ext = extOf(name);
  return ext === '' ? name : name.slice(0, -ext.length);
};

/** Forward slashes, always: these strings end up in ids, in URLs and in comparisons. */
const slashes = (path: string): string => path.replace(/\\/gu, '/');

/** The registry of linked files: their names, their bytes, and where they came from. */
export class LinkedAssets {
  readonly #base: string;
  /** Where the project's public files live, absolute. `''` when the project has none. */
  readonly #publicDir: string;
  /** Absolute source path → the URL the document will carry. */
  readonly #urls = new Map<string, string>();
  /** Published file name → its bytes. What the host build writes. */
  readonly #files = new Map<string, Uint8Array>();
  /** URL path → absolute source path. What the dev server serves. */
  readonly #sources = new Map<string, string>();
  /** The URLs written in a document's `<head>` — the shell (§4.5). */
  readonly #shell = new Set<string>();
  /** Public files named by a relative path instead of by their URL (`FUD0366`). */
  readonly #byPath = new Set<string>();

  constructor(base: string, publicDir = '') {
    this.#base = base.endsWith('/') ? base : `${base}/`;
    this.#publicDir = publicDir;
  }

  /**
   * The absolute path of a public file named by a root-absolute specifier, or `undefined`.
   *
   * `/logo.svg` means *the file at the root of what this project serves*, and that is
   * `public/logo.svg`. Answering this is what turns a root-absolute `href` from a string
   * nobody checks into a file the build knows: it exists or it is `FUD0363`, and if a
   * `<head>` links it the Service Worker precaches it without anyone writing `sw.json`.
   */
  /**
   * The root-absolute URL of a path that lands inside `public/`, or `undefined`.
   *
   * Compared on the resolved path, not on the text of the specifier: `../../public/x` and
   * `../styles/../../public/x` are the same file, and only one of them looks like it.
   */
  #underPublic(absPath: string): string | undefined {
    if (this.#publicDir === '') return undefined;
    const rel = relativePath(this.#publicDir, absPath);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined;
    return `/${slashes(rel)}`;
  }

  publicFile(spec: string): string | undefined {
    if (this.#publicDir === '') return undefined;
    const path = resolvePath(this.#publicDir, `.${AssetLinker.filePath(spec)}`);
    return existsSync(path) ? path : undefined;
  }

  /**
   * The URL of a public file: its own path, under `base`.
   *
   * Nothing is hashed and nothing is published — the file is already at its URL, which is
   * the entire reason it is public. What is added is `base`, because the author wrote
   * `/logo.svg` meaning *the root of my app*, and under `base: '/admin/'` that is
   * `/admin/logo.svg`. Without this the link is a 404 in exactly the deployment that is
   * hardest to test, which is the shape BUG-39 already had once.
   */
  publicUrl(spec: string, origin: AssetOrigin = 'markup'): string {
    const url = this.#base + spec.slice(1);
    if (origin === 'head') this.#shell.add(url);
    return url;
  }

  /**
   * The URL of one linked file — computed once, identical from any pass.
   *
   * The hash is over the bytes, so a file that did not change keeps its name across builds
   * and stays in every cache that holds it, and a file that changed gets a new one.
   */
  /**
   * The public files somebody reached by a relative path — `../../public/logo.svg`
   * (`FUD0366`). Reported by the plugin; the URL written is the one the author meant.
   */
  publicByPath(): readonly string[] {
    return [...this.#byPath];
  }

  url(absPath: string, origin: AssetOrigin = 'markup'): string {
    // Inside `public/`: the author asked for both naming schemes at once and would get the
    // worse half of each — a second, hashed copy of a file already served under its own
    // name. Reported (FUD0366) and then written as what they meant, so the page is right
    // even while the build is complaining.
    const inside = this.#underPublic(absPath);
    if (inside !== undefined) {
      this.#byPath.add(inside);
      return this.publicUrl(inside, origin);
    }
    const path = slashes(absPath);
    const cached = this.#urls.get(path);
    if (cached !== undefined) {
      // The same file can be linked from a head in one document and from markup in
      // another. Once it is the shell's, it stays the shell's: the install is the cheaper
      // of the two answers for a file a document needs to render itself.
      if (origin === 'head') this.#shell.add(cached);
      return cached;
    }

    const ext = extOf(path);
    // A linked stylesheet goes through the SAME compaction a component's `<style>` does.
    // There is one path for CSS in this framework on purpose: the day there are two, one of
    // the two outputs stops being minified and nobody notices. Everything else is copied
    // byte for byte — it is the file the author wrote.
    const bytes =
      ext === '.css'
        ? Buffer.from(compactProjectCss(readFileSync(path, 'utf8')), 'utf8')
        : readFileSync(path);
    const hash = createHash('sha256').update(bytes).digest('base64url').slice(0, 8);
    const fileName = `assets/${baseNameOf(path)}-${hash}${ext}`;
    const url = this.#base + fileName;
    this.#urls.set(path, url);
    this.#files.set(fileName, bytes);
    this.#sources.set(url, path);
    if (origin === 'head') this.#shell.add(url);
    return url;
  }

  /** Every file that has to be published, under the name the documents already carry. */
  files(): ReadonlyMap<string, Uint8Array> {
    return this.#files;
  }

  /**
   * What the Service Worker precaches: every file a document's own `<head>` links.
   *
   * > **Corrección.** This was `stylesheets()`, and the rule was the media type: the sheet
   * > because its absence stops the page painting, an image never, because "an image or a
   * > video is a runtime cache's decision". The second half is true of a photograph inside a
   * > component and false of a favicon, and the browser said so — `install` precached the
   * > stylesheet and not the icon, so the page took THREE loads to work offline: one to
   * > install, a second for the icon to be fetched through the worker and cached, and only
   * > then a third that owed nothing to the network.
   *
   * The line is not stylesheets against images, it is the document against its content. What
   * a `<head>` links is what every page needs to render ITSELF — that is what a shell is.
   * An `<img>` in a component or a `url(…)` in a sheet is content, and that is the one a
   * runtime cache should meet first.
   *
   * Their names change only when their bytes do, so precaching them costs one request the
   * first time and none ever again.
   */
  shell(): readonly string[] {
    return [...this.#shell];
  }

  /**
   * What the dev server answers for a URL: the very bytes the build would publish.
   *
   * Not a re-read of the source, so a stylesheet is compacted in dev exactly as it is in
   * the output — the difference between the two is the kind that is found last.
   */
  served(url: string): { readonly bytes: Uint8Array; readonly type: string } | undefined {
    const source = this.#sources.get(url);
    const bytes = this.#files.get(url.slice(this.#base.length));
    if (source === undefined || bytes === undefined) return undefined;
    return { bytes, type: MIME[extOf(source)] ?? 'application/octet-stream' };
  }
}

/**
 * The resolver the emit is handed for one `.fud`: a specifier as the author wrote it, in,
 * its published URL out.
 *
 * `fudDir` is the directory of the file that wrote the specifier, which is the only thing
 * `./logo.svg` can be relative to.
 */
export function assetUrlFrom(assets: LinkedAssets, fudDir: string): AssetUrl {
  return (spec, origin) =>
    spec.startsWith('/')
      ? assets.publicUrl(spec, origin)
      : assets.url(resolvePath(fudDir, spec), origin);
}
