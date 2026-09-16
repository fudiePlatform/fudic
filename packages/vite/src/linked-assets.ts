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
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { compactProjectCss } from '@fudic/compiler';

/**
 * Below this, a file travels inside the document as a `data:` URI instead of as a request.
 *
 * The same threshold Vite uses, and it is not only about weight: a data URI is byte for byte
 * the same in every pass, which is the reason the small logo of the example never showed the
 * bug this module exists to fix.
 */
const INLINE_LIMIT = 4096;

/**
 * A stylesheet is never inlined, however small.
 *
 * Three reasons, and any one of them is enough: a `data:` URI cannot be revalidated or
 * precached, it is repeated in full in every page that links it, and a `style-src` policy
 * that does not name `data:` blocks it outright.
 */
const NEVER_INLINE = new Set(['.css']);

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
  /** Absolute source path → the URL the document will carry. */
  readonly #urls = new Map<string, string>();
  /** Published file name → its bytes. What the host build writes. */
  readonly #files = new Map<string, Uint8Array>();
  /** URL path → absolute source path. What the dev server serves. */
  readonly #sources = new Map<string, string>();

  constructor(base: string) {
    this.#base = base.endsWith('/') ? base : `${base}/`;
  }

  /**
   * The URL of one linked file — computed once, identical from any pass.
   *
   * The hash is over the bytes, so a file that did not change keeps its name across builds
   * and stays in every cache that holds it, and a file that changed gets a new one.
   */
  url(absPath: string): string {
    const path = slashes(absPath);
    const cached = this.#urls.get(path);
    if (cached !== undefined) return cached;

    const ext = extOf(path);
    // A linked stylesheet goes through the SAME compaction a component's `<style>` does.
    // There is one path for CSS in this framework on purpose: the day there are two, one of
    // the two outputs stops being minified and nobody notices. Everything else is copied
    // byte for byte — it is the file the author wrote.
    const bytes =
      ext === '.css'
        ? Buffer.from(compactProjectCss(readFileSync(path, 'utf8')), 'utf8')
        : readFileSync(path);
    const type = MIME[ext] ?? 'application/octet-stream';
    if (bytes.length <= INLINE_LIMIT && !NEVER_INLINE.has(ext)) {
      const inline = `data:${type};base64,${bytes.toString('base64')}`;
      this.#urls.set(path, inline);
      return inline;
    }

    const hash = createHash('sha256').update(bytes).digest('base64url').slice(0, 8);
    const fileName = `assets/${baseNameOf(path)}-${hash}${ext}`;
    const url = this.#base + fileName;
    this.#urls.set(path, url);
    this.#files.set(fileName, bytes);
    this.#sources.set(url, path);
    return url;
  }

  /** Every file that has to be published, under the name the documents already carry. */
  files(): ReadonlyMap<string, Uint8Array> {
    return this.#files;
  }

  /**
   * The stylesheets, as URLs, for the Service Worker to precache.
   *
   * Stylesheets and nothing else: a document's own sheet is the one linked file whose
   * absence stops the page from painting, and its name changes only when its bytes do, so
   * precaching it costs one request the first time and none ever again. An image or a video
   * is a different decision — it belongs to a runtime cache, not to the install.
   */
  stylesheets(): readonly string[] {
    return [...this.#files.keys()]
      .filter((fileName) => extOf(fileName) === '.css')
      .map((fileName) => this.#base + fileName);
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
export function assetUrlFrom(assets: LinkedAssets, fudDir: string): (spec: string) => string {
  return (spec: string): string => assets.url(resolvePath(fudDir, spec));
}
