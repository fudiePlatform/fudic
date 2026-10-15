/**
 * The catalogs of each app, read for the hover over a message (SDD-58 §4.11).
 *
 * The editor READS what `fudic translate` writes and nothing else: it never extracts into a
 * catalog and never publishes FUD1022–FUD1025, which are the command's. A catalog changing on
 * disk arrives through `didChangeWatchedFiles`, the channel that already keeps the index and
 * the configuration current, and the next hover reads it again — no restart.
 *
 * The app is the one of the NEAREST `fudic.json` above the file, as for the `styles` a template
 * chooses from: a workspace opened at its root holds several projects, each with its catalogs.
 */

import { extractMessages, type Message } from '@fudic/compiler';
import { CONFIG_FILE, readProjectConfig } from '@fudic/config';
import { LOCALES_DIR } from '@fudic/conventions';
import { parseCatalog, type Catalog } from '@fudic/i18n';
import { toPosix } from '@fudic/typecheck';
import type { FileSystemScanner } from './types.js';

/** What a hover over a message shows: the message and its text in every locale. */
export interface MessageTranslations {
  readonly message: Message;
  /** One per configured locale, in the configured order. `undefined` where it is missing. */
  readonly lines: readonly { readonly locale: string; readonly text: string | undefined }[];
}

/** An app with locales: where it lives and what it declares. */
interface App {
  readonly root: string;
  readonly locales: readonly string[];
}

/** What stands in for a missing translation (§4.11). */
export const MISSING = '—';

export class Translations {
  readonly #scanner: FileSystemScanner;
  /** Directory → the app of the nearest `fudic.json` at or above it, `null` for none. */
  readonly #appByDir = new Map<string, App | null>();
  /** `<root>/<locale>` → its catalog. An unreadable one is empty, as in the pipeline. */
  readonly #catalogs = new Map<string, Catalog>();
  /** File → its messages, for the source they were extracted from. */
  readonly #messages = new Map<string, { readonly source: string; readonly messages: readonly Message[] }>();

  constructor(scanner: FileSystemScanner) {
    this.#scanner = scanner;
  }

  /**
   * A file changed on disk. A catalog or a `fudic.json` forgets what was read — they are cheap
   * to read again — and anything else is not this class's business.
   */
  invalidate(path: string): boolean {
    const file = toPosix(path);
    const catalog = file.endsWith('.json') && file.includes(`/${LOCALES_DIR}/`);
    if (!catalog && !file.endsWith(`/${CONFIG_FILE}`)) return false;
    this.#catalogs.clear();
    this.#appByDir.clear();
    return true;
  }

  /** The translations of the message under `offset` in the `.fud` at `path`, if there is one. */
  at(path: string, source: string, offset: number): MessageTranslations | undefined {
    const file = toPosix(path);
    const app = this.#appOf(file.slice(0, file.lastIndexOf('/')));
    if (app === null) return undefined;

    const message = innermost(this.#messagesOf(file, source, app.root), offset);
    if (message === undefined) return undefined;

    return {
      message,
      lines: app.locales.map((locale) => {
        const text = this.#catalogOf(app.root, locale)[message.context]?.[message.key]?.translation;
        // An empty translation counts as missing, here as in the pipeline (§4.10).
        return { locale, text: text === '' ? undefined : text };
      }),
    };
  }

  #messagesOf(file: string, source: string, root: string): readonly Message[] {
    const known = this.#messages.get(file);
    if (known?.source === source) return known.messages;
    // Named as `fudic translate` names it: relative to the app's root, so the context — and
    // with it the key — is the catalog's.
    const messages = extractMessages(source, file.slice(root.length + 1)).value;
    this.#messages.set(file, { source, messages });
    return messages;
  }

  #catalogOf(root: string, locale: string): Catalog {
    const id = `${root}/${locale}`;
    const known = this.#catalogs.get(id);
    if (known !== undefined) return known;
    const path = `${root}/${LOCALES_DIR}/${locale}.json`;
    const text = this.#scanner.readFile(path);
    const catalog = text === undefined ? {} : parseCatalog(text, path).value;
    this.#catalogs.set(id, catalog);
    return catalog;
  }

  #appOf(start: string): App | null {
    const visited: string[] = [];
    let dir = start;
    let found: App | null = null;
    for (;;) {
      const cached = this.#appByDir.get(dir);
      if (cached !== undefined) {
        found = cached;
        break;
      }
      visited.push(dir);
      const text = this.#scanner.readFile(`${dir}/${CONFIG_FILE}`);
      if (text !== undefined) {
        const locales = readProjectConfig(dir, { exists: () => true, read: () => text }).config?.locales;
        found = locales === undefined ? null : { root: dir, locales };
        break;
      }
      const up = dir.lastIndexOf('/');
      if (up <= 0) break;
      dir = dir.slice(0, up);
    }
    for (const seen of visited) this.#appByDir.set(seen, found);
    return found;
  }
}

/** The smallest message whose span holds `offset`: an attribute inside a run wins over the run. */
function innermost(messages: readonly Message[], offset: number): Message | undefined {
  const size = ({ span }: Message): number => span.end - span.start;
  return messages
    .filter(({ span }) => span.start <= offset && offset <= span.end)
    .sort((a, b) => size(a) - size(b))[0];
}

/** The hover's markdown: one line per locale, `—` where the translation is missing. */
export function translationsMarkdown(found: MessageTranslations): string {
  return found.lines
    .map(({ locale, text }) => `${locale}: ${text === undefined ? MISSING : escapeMarkdown(text)}`)
    .join('  \n');
}

/** A message's `<0>…</0>` is text to read, not HTML for the hover to render. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_<>[\]]/gu, '\\$&');
}
