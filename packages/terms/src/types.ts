/**
 * The contract between the workbench, its extensions and the terms. The workbench knows only
 * `BenchExtension` and `TermHost`; a term knows only `TermContext`.
 */

import type { Locator, Page } from 'playwright-core';

/** Where an element was in the page, in pixels. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A call of the criterion, as the bench logged it (SDD-82 §4.4). */
export interface Call {
  /** The function's or the remote rule's name. */
  readonly name: string;
  /** Its arguments, decoded; a file by its name. */
  readonly args: Readonly<Record<string, unknown>>;
  /** Answered by the fixture, without running it. */
  readonly faked: boolean;
  /** The status it answered with; `0` for a network failure. */
  readonly status: number;
}

/** The last response of a document: its status, and its headers with their names in lower case. */
export interface DocumentResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
}

/** What the last `when` block did, beyond the page it left. */
export interface LastWhen {
  /** The requests that went out during it: documents, data, functions, rules, resources. */
  readonly requests: number;
  /** The names of the files it downloaded, in order. */
  readonly downloads: readonly string[];
}

/**
 * What the workbench knows of a criterion beyond its page (SDD-82 §3.7): where it opens, its
 * clocks, what it called, what the last `when` did. The host gives it and the ctx passes it on.
 */
export interface CriterionRecord {
  /** Where the criterion opens, absolute: its page, or the component's. */
  readonly url: string;
  /** A path as the `.fudspec` writes it, absolute: relative to the `.fudspec`'s folder. */
  resolve(path: string): string;
  /** Resolves once the page is quiet: nothing in flight, no short timer, no frame (§4.5). */
  quiet(): Promise<void>;
  /**
   * Stands the clock at `at` (ms since the epoch) in every browser of the criterion and in its
   * server; `label` is how the `.fudspec` wrote it.
   */
  clock(at: number, label: string): Promise<void>;
  /** Moves both clocks `ms` forward; without `clock`, waits `ms` for real. */
  advance(ms: number): Promise<void>;
  /** The calls of the criterion so far, in order: none for a component. */
  calls(): readonly Call[];
  /** The last response of a document in this browser; null when the last one got none. */
  response(): DocumentResponse | null;
  /** What the last `when` block did in this browser. */
  lastWhen(): LastWhen;
  /** Whether the document is another than before the last `when` block. */
  reloaded(): Promise<boolean>;
  /**
   * What the page's real `paths()` lists, each entry as `path <value>` writes it (`2026/hola`
   * for `/blog/:year/:slug`); null when the page has no `paths`, or the criterion is no page's.
   */
  paths(): Promise<readonly string[] | null>;
}

export interface TermContext extends CriterionRecord {
  /** The Playwright page the component is mounted in: keyboard, mouse, evaluate… */
  readonly page: Page;
  /**
   * A Playwright locator by tag (`ui-menu`) or by role (`role:menuitem/"Open"`). It pierces shadow
   * roots. Every call on it that reads or acts requires one element, and marks it in the shot.
   */
  locate(ref: string): Locator;
  /**
   * Runs a gesture and waits until the page has served what it started: requests, chunks,
   * microtasks, and the hydration of the first gesture. Every `when` that touches the page uses it.
   */
  act<T>(target: Locator, gesture: () => Promise<T>): Promise<T>;
  /** What a person sees: it enters shadow roots and puts in each slot what is assigned to it. */
  text(target: Locator): Promise<string>;
}

/** What a `then` looked for and what it found, as a person reads them. */
export interface Evidence {
  readonly expected: string;
  readonly actual: string;
}

export interface TermOutcome {
  readonly pass: boolean;
  /** For a `then`: what it looked for and what it found, as text. For a `when` or a `given`: what it did. */
  readonly evidence: string | Evidence | null;
}

export interface TermMeta<P extends string = string> {
  readonly name: string;
  readonly block: 'given' | 'when' | 'then';
  readonly params: readonly { readonly name: P; readonly type: 'element' | 'number' | 'string' | 'token' }[];
  readonly describe?: (args: Readonly<Record<P, string | number>>) => string;
  /**
   * A `then` that holds by what is NOT there (`hidden`, `count … 0`): read once, on the quiet
   * page, never retried. `true`, or a function of the arguments (SDD-82 §4.5).
   */
  readonly negative?: boolean | ((args: Readonly<Record<P, string | number>>) => boolean);
}

/**
 * A term module. In a `.js` term, on its `run`: `@type {import('@fudic/terms').Term['run']}`;
 * with the ctx a project's `fudic/bench.js` extends, `Term<string, ContextOf<…>>['run']`.
 */
export interface Term<P extends string = string, C extends TermContext = TermContext> {
  readonly meta: TermMeta<P>;
  run(ctx: C, args: Readonly<Record<P, string | number>>): Promise<TermOutcome>;
}

/** What the workbench gives the runtime: the page, where to report, and what it knows of the criterion. */
export interface TermHost extends CriterionRecord {
  readonly page: Page;
  /** Runs a gesture and waits for the page to serve it. */
  settle<T>(target: Locator, gesture: () => Promise<T>): Promise<T>;
  /**
   * For the shot: where each resolved reference was, and where its element was written — the
   * `data-fud-src` of it or of its nearest ancestor; null when none has one.
   */
  onLocate(ref: string, box: Box, source: string | null): void;
}

/**
 * An extension of the workbench. The workbench applies them in order — first `@fudic/terms`'s,
 * then the project's — and each receives what the one before left.
 */
export interface BenchExtension<In extends TermContext = TermContext, Out extends In = In> {
  /** Before the component is mounted: emulate media, intercept the network, set viewport or locale… */
  setup?(page: Page): Promise<void>;
  /** Extends the ctx: returns the one the terms will see. */
  context?(ctx: In, host: TermHost): Out;
}

/**
 * The ctx an extension leaves for the terms: `ContextOf<typeof import('../../bench.js').default>`
 * in a term of the project. The stock one when it does not extend it.
 */
export type ContextOf<E> = E extends { context?(ctx: never, host: TermHost): infer Out }
  ? Out extends TermContext
    ? Out
    : TermContext
  : TermContext;

/** The props each criterion mounts with, by name; `$content` goes inside the host, as children. */
export type Fixtures<P> = Record<string, P & { readonly $content?: string }>;
