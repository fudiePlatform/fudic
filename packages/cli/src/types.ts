/**
 * The plan types (SDD-22 §3.2). Every command is expressed as PLAN → APPLY: the `plan*`
 * functions read the disk and never write, `apply` is the only writer. That is what makes
 * `--dry-run` exact — it is literally the plan without `apply`, not a second simulation
 * that can drift — and what makes every command testable without touching the filesystem.
 */

import type { Diagnostic } from '@fudic/compiler';

/** A file the plan creates, or an existing file it rewrites (`before` = its current text). */
export type FileChange =
  | { readonly kind: 'create'; readonly path: string; readonly contents: string }
  | {
      readonly kind: 'modify';
      readonly path: string;
      readonly contents: string;
      readonly before: string;
    };

/**
 * An effect that is not a file: `pnpm install`, `git init`, the initial commit. `apply`
 * runs them AFTER writing the files, in order; `--dry-run` lists them without running.
 * Without this the plan would be a lie: `fudic new` would do things it does not describe.
 */
export interface PlanCommand {
  readonly command: string;
  readonly args: readonly string[];
  /** Relative to `cwd`. */
  readonly dir: string;
}

/**
 * A `PlanCommand` that did not succeed, and how.
 *
 * `status` is the exit code, or `null` when the process never ran at all — a missing `pnpm`
 * and a `pnpm install` that resolved nothing are different failures, and the message the user
 * gets has to be able to tell them apart.
 */
export interface CommandFailure {
  readonly command: PlanCommand;
  readonly status: number | null;
}

/**
 * A CLI error that does NOT come from a source file: an invalid tag, a collision, a
 * missing adapter. It cannot be a `Diagnostic` — a `Diagnostic` requires a span, and here
 * there is no source to point at. Faking one would be exactly the lie SDD-22 §5 forbids.
 */
export interface CliError {
  /** FUD0440–FUD0459 (SDD-22 §3.3). */
  readonly code: string;
  readonly message: string;
  readonly file?: string;
}

/**
 * A compiler diagnostic plus the file it belongs to. The span alone is not actionable in
 * a tool that reads several files in one command — the editor knows which buffer it is
 * in, a CLI does not.
 */
export interface PlanDiagnostic {
  /** Path relative to `cwd`. */
  readonly file: string;
  readonly diagnostic: Diagnostic;
}

export interface Plan {
  readonly changes: readonly FileChange[];
  readonly commands: readonly PlanCommand[];
  /** From the compiler, with spans, over foreign files the CLI had to read. */
  readonly diagnostics: readonly PlanDiagnostic[];
  /** From the CLI, span-less. A plan with a non-empty `errors` is never applied. */
  readonly errors: readonly CliError[];
}

export interface BaseOptions {
  readonly cwd: string;
  readonly force: boolean;
}

export type PackageManager = 'pnpm' | 'npm' | 'yarn';

/**
 * `fudic fmt`. The five formatter options of SDD-26 §3 plus `--check`.
 *
 * They are carried here rather than read from a file because SDD-26 §7 has no config file:
 * the options come from the editor's settings or from this command line, and nowhere else.
 */
export interface FmtOptions extends BaseOptions {
  /** Report what would change and exit non-zero, without writing (for CI). */
  readonly check: boolean;
  readonly printWidth: number;
  readonly tabWidth: number;
  readonly useTabs: boolean;
  readonly quote: 'double' | 'single';
  readonly endOfLine: 'lf' | 'crlf' | 'auto';
}

export interface NewOptions extends BaseOptions {
  readonly pm: PackageManager;
  readonly install: boolean;
  readonly git: boolean;
  readonly sw: boolean;
  readonly layout: string;
  readonly target: string;
}

export interface ComponentOptions extends BaseOptions {
  readonly dir: string;
  readonly wireInto: readonly string[];
  readonly style: boolean;
  readonly slot: boolean;
}

export interface PageOptions extends BaseOptions {
  readonly dir: string;
  /** Path of the layout `.fud`, relative to `cwd`. `null` ⇒ --no-layout; absent ⇒ resolve. */
  readonly layout?: string | null;
  readonly server: boolean;
  /** `null` ⇒ every `@RenderSection` of the layout chain. */
  readonly sections: readonly string[] | null;
}

export interface LayoutOptions extends BaseOptions {
  readonly dir: string;
  /** One `@RenderSection(name)` per name. None is mandatory: SDD-21 §4.2. */
  readonly sections: readonly string[];
  /** Emit `@RenderHead()` inside the `<head>` (decision 86). */
  readonly head: boolean;
}

/** The empty plan: the neutral element every builder starts from. */
export const EMPTY_PLAN: Plan = { changes: [], commands: [], diagnostics: [], errors: [] };
