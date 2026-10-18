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

export interface TermContext {
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

export interface TermOutcome {
  readonly pass: boolean;
  readonly evidence: string | { readonly expected: unknown; readonly actual: unknown } | null;
}

export interface TermMeta<P extends string = string> {
  readonly name: string;
  readonly block: 'given' | 'when' | 'then';
  readonly params: readonly { readonly name: P; readonly type: 'element' | 'number' | 'string' | 'token' }[];
  readonly describe?: (args: Readonly<Record<P, string | number>>) => string;
}

/**
 * A term module. In a `.js` term, on its `run`: `@type {import('@fudic/terms').Term['run']}`;
 * with the ctx a project's `fudic/bench.js` extends, `Term<string, ContextOf<…>>['run']`.
 */
export interface Term<P extends string = string, C extends TermContext = TermContext> {
  readonly meta: TermMeta<P>;
  run(ctx: C, args: Readonly<Record<P, string | number>>): Promise<TermOutcome>;
}

/** What the workbench gives the runtime: the page and where to report. */
export interface TermHost {
  readonly page: Page;
  /** Runs a gesture and waits for the page to serve it. */
  settle<T>(target: Locator, gesture: () => Promise<T>): Promise<T>;
  /** For the shot: where each resolved reference was. */
  onLocate(ref: string, box: Box): void;
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
