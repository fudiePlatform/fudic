/**
 * A page that goes out in parts (SDD-70 §3.5, §4.2).
 *
 * Part 0 is the body up to the first `@await`; each `@await` starts a new one. Every part
 * carries ONE data block in front of it and a marker behind it:
 *
 *     <script type="application/json" data-fud-part="1">{…}</script>
 *     …what part 1 painted…
 *     <!--fud-end-->
 *
 * The block holds what that part produced and nothing else: the state of the instances it
 * claimed (the ids keep counting), the `later` fields it awaited, what it published to the
 * container; and in part 0, what the page publishes once — its static maps, its route, its
 * `data`. The marker tells the browser the parser has read the part whole. A comment, so it
 * renders nothing and is legal anywhere, inside a `<table>` as much as a `<ul>`.
 *
 * The block is text yielded in FRONT of the part, and not a node of the tree: when a part is
 * written its content is already built, and its state only exists once it is. Part 0's goes
 * right after the `<body>` start tag, so the browser reads it inside the body.
 */

import type { SsrNode } from './tree.js';
import type { SsrDom } from './ssr-dom.js';
import { escapeJson } from './json-block.js';
import { partSerializer, type PartSerializer } from './parts.js';
import { publishedSeed } from './seed.js';
import { FLUSH, type HtmlPiece } from './stream.js';
import type { IocNode } from './ioc.js';

/** The marker that closes every part. */
export const PART_END = '<!--fud-end-->';

/** What a `later` field came to, as the wrapper settled it (SDD-70 §3.4). */
export type Settled = { readonly ok: unknown } | { readonly error: unknown; readonly cause?: unknown };

export interface PagePartsOptions {
  /** What part 0 publishes once, by key: `tree`, `bus`, `eager`, `route`, `data`. */
  readonly first: Readonly<Record<string, unknown>>;
  /** Whether the `later` fields travel: only when the route publishes its `data`. */
  readonly fields: boolean;
  /** The request's container, when the page injects: its map and its published seed. */
  readonly ioc?: IocNode;
}

export class PageParts {
  readonly #dom: SsrDom;
  readonly #parts: PartSerializer;
  readonly #options: PagePartsOptions;
  #index = 0;
  #fields: Record<string, Settled> = {};
  /** The container map last written: it is written again only when it grew. */
  #ioc = '';
  /** The keys of the seed already published. */
  readonly #seeded = new Set<string>();

  constructor(dom: SsrDom, body: SsrNode, options: PagePartsOptions) {
    this.#dom = dom;
    this.#parts = partSerializer(body);
    this.#options = options;
  }

  /** What a `later` field came to, for the block of the part being painted. */
  field(name: string, settled: Settled): void {
    if (!this.#options.fields) return;
    this.#fields[name] = 'ok' in settled ? { ok: settled.ok } : { error: settled.error };
  }

  /** The part built so far, and `FLUSH`: it leaves before the page waits. */
  *cut(): Generator<HtmlPiece> {
    yield* this.#write();
    yield FLUSH;
  }

  /** The last part, and the rest of the body: every element still open is closed. */
  *end(): Generator<HtmlPiece> {
    yield* this.#write();
    yield* this.#parts.end();
  }

  *#write(): Generator<string> {
    const pieces = this.#parts.part();
    // Part 0 opens the `<body>`, and its block goes inside it.
    if (this.#index === 0) yield pieces.next().value as string;
    const block = this.#block();
    if (Object.keys(block).length > 0) {
      yield `<script type="application/json" data-fud-part="${this.#index}">${escapeJson(JSON.stringify(block))}</script>`;
    }
    yield* pieces;
    yield PART_END;
    this.#index++;
  }

  #block(): Record<string, unknown> {
    const block: Record<string, unknown> = this.#index === 0 ? { ...this.#options.first } : {};
    const state = this.#dom.hydrationPart();
    if (state.offsets.length > 1) block['state'] = [state.first, state.offsets, state.data];
    if (Object.keys(this.#fields).length > 0) block['fields'] = this.#fields;
    this.#fields = {};
    const ioc = this.#options.ioc;
    if (ioc !== undefined) this.#container(ioc, block);
    return block;
  }

  /**
   * The container tree as rendered so far, when it grew — the whole map, which the browser
   * replaces — and the entries of the seed published since the last part.
   */
  #container(ioc: IocNode, block: Record<string, unknown>): void {
    const map = ioc.map();
    const text = JSON.stringify(map);
    if (map[0].length > 1 && text !== this.#ioc) {
      block['ioc'] = map;
      this.#ioc = text;
    }
    const seed = publishedSeed(ioc) ?? {};
    const fresh = Object.entries(seed).filter(([key]) => !this.#seeded.has(key));
    for (const [key] of fresh) this.#seeded.add(key);
    if (fresh.length > 0) block['di'] = Object.fromEntries(fresh);
  }
}
