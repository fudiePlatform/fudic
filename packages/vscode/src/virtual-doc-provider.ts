/**
 * The store behind the read-only views (SDD-25 §4.3).
 *
 * `fudic.showVirtualFiles` and `fudic.showRegistry` both produce text that exists nowhere on
 * disk. VS Code shows such a thing through a content provider keyed by URI, and the part of
 * that which is worth testing — the encoding of a name into a URI and back — is here, with
 * the editor plumbing left to the adapter.
 *
 * The key is the NAME, not the URI text. A URI does not come back out of VS Code as the string
 * it was built from: `encodeURIComponent` escapes `/` as `%2F`, and `Uri.toString()` re-encodes
 * with its own table, which escapes `:`, `[` and `]` but leaves `/` alone. Keying on the URI
 * text meant the key stored and the key asked for were never the same string, and every virtual
 * file opened blank. What DOES survive is `uri.path`: `Uri.parse` decodes it, and it comes back
 * byte for byte the name it was built from.
 */

export const VIRTUAL_SCHEME = 'fudic-virtual';

export interface VirtualDocStore {
  /** Stores the text and returns the URI that will produce it. */
  put(name: string, text: string): string;
  /**
   * The text stored under a name, empty when there is none.
   *
   * The adapter passes `uri.path` — the decoded path, which is the name again. Empty rather
   * than `undefined` so it has nothing to branch on: VS Code will ask for the content of a
   * virtual document again after a window reload, when the store no longer has it, and an
   * empty editor is the right answer to that.
   */
  get(name: string): string;
}

export const createVirtualDocStore = (): VirtualDocStore => {
  const texts = new Map<string, string>();

  return {
    put: (name, text) => {
      texts.set(name, text);
      // The name goes in the path, encoded: a virtual file is called something like
      // `blog/[slug].fud.ts`, and both the slash and the brackets would otherwise be parsed
      // as URI structure rather than shown as the name the user is looking for.
      return `${VIRTUAL_SCHEME}:${encodeURIComponent(name)}`;
    },
    get: (name) => texts.get(name) ?? '',
  };
};
