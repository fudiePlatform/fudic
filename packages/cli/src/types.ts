/**
 * The plan types (SDD-22 §3.2). Every command is expressed as PLAN → APPLY: the `plan*`
 * functions read the disk and never write, `apply` is the only writer. That is what makes
 * `--dry-run` exact — it is literally the plan without `apply`, not a second simulation
 * that can drift — and what makes every command testable without touching the filesystem.
 */

import type { Diagnostic } from '@fudic/compiler';
import type { FileDiagnostic, ProjectDiagnostic } from '@fudic/diagnostics';

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
  /**
   * Its output is kept and shown only if it fails (BUG-50 §6.2): an install or a commit is a
   * line of the report, not a screen of it. Absent ⇒ the user sees it as it runs.
   */
  readonly quiet?: true;
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
 * missing adapter. It cannot be a source diagnostic — that requires a span, and here there
 * is no source to point at. Faking one would be exactly the lie SDD-22 §5 forbids. So it is
 * about a file, or about nothing in particular (SDD-50).
 */
export type CliError = FileDiagnostic | ProjectDiagnostic;

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
  /**
   * Files the plan removes, relative to `cwd`, after writing `changes`. Only `fudic translate`
   * removes one: the catalog of a component that no longer has a message (SDD-58 §4.10).
   */
  readonly deletions?: readonly string[];
  readonly commands: readonly PlanCommand[];
  /** From the compiler, with spans, over foreign files the CLI had to read. */
  readonly diagnostics: readonly PlanDiagnostic[];
  /** From the CLI, span-less. A plan with a non-empty `errors` is never applied. */
  readonly errors: readonly CliError[];
  /**
   * What the command tells the user once it is applied, in their words (BUG-50 §6): what was
   * created, how to run it, what to do next. Absent ⇒ one `create`/`modify` line per file.
   * Never shown under `--dry-run`, which lists the plan, nor in `--json`.
   */
  readonly report?: readonly string[];
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
  /**
   * The application's identity, written into `fudic.json`. It defaults to the name the
   * command was given — written, never derived from the directory or from the npm name,
   * because both of those change for reasons that have nothing to do with who the app is.
   *
   * **It is never changed afterwards.** It namespaces the Service Worker caches, and the
   * caches of a previous value are purged by nobody, ever (BUG-33 §2.4).
   */
  readonly id: string;
  /** What `g component` proposes here. `''` ⇒ `fudic.json` does not carry the field. */
  readonly prefix: string;
  readonly pm: PackageManager;
  readonly install: boolean;
  readonly git: boolean;
  readonly sw: boolean;
  readonly layout: AppLayout;
  readonly target: string;
}

/**
 * The frame of a new app's pages: one of its own (`--layout <name>`, `_layout` by default), one
 * it does not own — a library's, by its specifier (`--layout @shop/ui/layouts/main.fud`) —,
 * or none (`--no-layout`), its home page then a whole document.
 */
export type AppLayout = { readonly own: string } | { readonly href: string } | null;

/**
 * `fudic new <nombre> --workspace` (SDD-44 §3.2). It inherits everything `fudic new` takes,
 * because the app it creates is the one `fudic new` creates.
 *
 * What it starts with is the user's choice (decision of Pedro, 2026-10-18): nothing, an app
 * (`--app`), libraries (`--lib`), or both.
 */
export interface WorkspaceOptions extends NewOptions {
  /** `--app`: the first app's name. Absent ⇒ no app. */
  readonly app?: string;
  /**
   * `--uses`: libraries created with the workspace, in `libs/`, that the first app depends on
   * (BUG-50 §3.2; decision of Pedro, 2026-10-18: a new workspace has no library to name).
   */
  readonly uses: readonly string[];
  /** `--lib`: libraries created with the workspace that no app uses yet. */
  readonly libs: readonly string[];
}

/**
 * What `fudic g app` and `fudic g lib` share (SDD-44 §3.2).
 *
 * `dir` hangs from the WORKSPACE ROOT, not from `cwd`: `cd apps/tienda && fudic g app admin`
 * has to put the new app beside the old one, never inside it.
 */
export interface ProjectOptions extends BaseOptions {
  readonly dir: string;
  /** What `g component` proposes here. `''` ⇒ `fudic.json` does not carry the field. */
  readonly prefix: string;
  /** Workspace libraries this project depends on. */
  readonly uses: readonly string[];
}

export interface AppOptions extends ProjectOptions {
  /** Written, never derived from the directory nor from the npm name (§4.4). */
  readonly id: string;
  readonly sw: boolean;
  readonly layout: AppLayout;
  /**
   * `--base`, as given. Absent ⇒ `/` for the first app of the workspace, `/<name>/` for the
   * others (BUG-50 §3.2).
   */
  readonly base?: string;
}

/**
 * What the three generators share since SDD-44: the project the piece goes to.
 *
 * `dir` stays relative to the PROJECT, and `--cwd` keeps its meaning — the root to operate
 * on. What changed is that the project's root is searched from `cwd` upwards (§4.3).
 */
export interface TargetedOptions extends BaseOptions {
  /** A project's directory name. Absent ⇒ the nearest `fudic.json` at or above `cwd`. */
  readonly project?: string;
}

export interface ComponentOptions extends TargetedOptions {
  readonly dir: string;
  readonly wireInto: readonly string[];
  readonly style: boolean;
  readonly slot: boolean;
  /** Write its unit test in its folder; `--skip-test` is `false` (BUG-50 §4.3). */
  readonly test: boolean;
  /** Write its `.fudspec` and its fixture in its folder; `--skip-spec` is `false` (BUG-50 §4.3). */
  readonly spec: boolean;
}

/** `fudic g spec <component>` (SDD-53 §4.1): only the project the component is in. */
export type SpecOptions = TargetedOptions;

/** `fudic g term <block> <name>` (SDD-53 §4.2), its arguments as given, checked by the plan. */
export interface TermOptions extends TargetedOptions {
  readonly block: string;
  /** Every `--param`, in order, as written: `<name>:<type>`. */
  readonly params: readonly string[];
}

export interface PageOptions extends TargetedOptions {
  readonly dir: string;
  /** Path of the layout `.fud`, relative to `cwd`. `null` ⇒ --no-layout; absent ⇒ resolve. */
  readonly layout?: string | null;
  readonly server: boolean;
  /** `null` ⇒ every `@RenderSection` of the layout chain. */
  readonly sections: readonly string[] | null;
  /** Write its unit test beside it; `--skip-test` is `false` (BUG-50 §4.4). */
  readonly test: boolean;
}

export interface LayoutOptions extends TargetedOptions {
  readonly dir: string;
  /** One `@RenderSection(name)` per name. None is mandatory: SDD-21 §4.2. */
  readonly sections: readonly string[];
  /** Emit `@RenderHead()` inside the `<head>` (decision 86). */
  readonly head: boolean;
  /** Write its unit test beside it; `--skip-test` is `false` (BUG-50 §4.4). */
  readonly test: boolean;
}

/**
 * `fudic translate` (SDD-58 §3.5): the project to translate, and nothing else. Its languages are
 * the project's own `locales`; there is no flag that could disagree with them.
 */
export type TranslateOptions = TargetedOptions;

/** What `fudic translate` found for one locale, for the summary the binary prints. */
export interface LocaleSummary {
  readonly locale: string;
  /** Messages in its catalog after the merge. */
  readonly total: number;
  /** Messages its catalog did not have. */
  readonly added: number;
  /** Messages whose text changed under a translation: `review` set. */
  readonly review: number;
  /** Messages with no translation, or an empty one. */
  readonly missing: number;
}

/** The plan of `fudic translate`: a plan, plus the summary per locale. */
export interface TranslatePlan extends Plan {
  readonly summary: readonly LocaleSummary[];
}

/** The empty plan: the neutral element every builder starts from. */
export const EMPTY_PLAN: Plan = { changes: [], commands: [], diagnostics: [], errors: [] };

/** `fudic dev` and `fudic preview` (BUG-50 §4.5): which apps, and the one port they share. */
export interface ServeOptions extends TargetedOptions {
  readonly port: number;
}

/** `fudic g lib` (SDD-44, BUG-50 §4.7). */
export interface LibOptions extends ProjectOptions {
  /** `--styles-only`: a global stylesheet and nothing else — no components, no tests, no spec. */
  readonly stylesOnly?: true;
}

/** `fudic add <module>` (BUG-50 §4.6). */
export interface AddOptions extends TargetedOptions {
  /** `--locales es,en`, with `add i18n`: written as `"locales"` in `fudic.json`. */
  readonly locales: readonly string[];
}

/** `fudic g service <name>` (BUG-50 §4.7). */
export interface ServiceOptions extends TargetedOptions {
  /** Not registered in the root: a component provides it (`--provided`). */
  readonly provided: boolean;
  /** Write its unit test; `--skip-test` is `false`. */
  readonly test: boolean;
}

/** `fudic g form <name>` (BUG-50 §4.7). */
export interface FormOptions extends TargetedOptions {
  /** Typed controls (`--binary`): the upload travels in binary. */
  readonly binary: boolean;
  /** Write its unit test; `--skip-test` is `false`. */
  readonly test: boolean;
}
