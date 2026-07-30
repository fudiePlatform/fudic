/**
 * The store behind the read-only views (SDD-25 §4.3).
 *
 * `fudic.showVirtualFiles` and `fudic.showRegistry` both produce text that exists nowhere on
 * disk. VS Code shows such a thing through a content provider keyed by URI, and the part of
 * that which is worth testing — the encoding of a name into a URI and back — is here, with
 * the editor plumbing left to the adapter.
 */

export const VIRTUAL_SCHEME = 'fudic-virtual';

export interface VirtualDocStore {
  /** Stores the text and returns the URI that will produce it. */
  put(name: string, text: string): string;
  /**
   * The text for a URI, empty when nothing was stored under it.
   *
   * Empty rather than `undefined` so the adapter has nothing to branch on: VS Code will ask
   * for the content of a virtual document again after a window reload, when the store no
   * longer has it, and an empty editor is the right answer to that.
   */
  get(uri: string): string;
}

export const createVirtualDocStore = (): VirtualDocStore => {
  const texts = new Map<string, string>();

  return {
    put: (name, text) => {
      // The name goes in the path, encoded: a virtual file is called something like
      // `blog/[slug].fud.ts`, and both the slash and the brackets would otherwise be parsed
      // as URI structure rather than shown as the name the user is looking for.
      const uri = `${VIRTUAL_SCHEME}:${encodeURIComponent(name)}`;
      texts.set(uri, text);
      return uri;
    },
    get: (uri) => texts.get(uri) ?? '',
  };
};
