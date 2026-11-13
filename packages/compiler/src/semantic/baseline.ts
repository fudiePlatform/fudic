/**
 * The judge's side of the detectors (SDD-83 §3.6, §4.1): a detector turns code into USES — what the
 * author wrote, the compat key it reads as and where — and this turns the uses that do not pass the
 * project's level into `FUD1524`.
 *
 * A detector knows no level; this knows no language (§5). The HTML and CSS detectors of the compiler
 * and the TS one of `@fudic/typecheck` all come through here, so the three say a key the same way.
 *
 * What fudic emits by itself (the manifest, §3.7) never warns in the user's code: `shadowrootmode` on
 * a root `<template>` is fudic's, not its author's.
 */

import {
  CORE_BROWSERS,
  EMITTED,
  describeTarget,
  passes,
  status,
  widelyOn,
  type CoreBrowser,
  type Target,
} from '@fudic/baseline';
import { FUD1524 } from '@fudic/diagnostics';
import type { Diagnostic, Span } from '../types/index.js';

/** What a project asks of the browser: its level, and the features it allows above it. */
export interface BaselineContext {
  readonly target: Target;
  /** The web-features ids the project allows, already followed through their redirects. */
  readonly allow: ReadonlySet<string>;
  /** The data's date, fixed by a test (SDD-83 criterion 17); absent, the data's own. */
  readonly asOf?: string;
}

/** One thing of the browser the author wrote. */
export interface BaselineUse {
  /** As the author wrote it: `field-sizing`, `:state()`, `<search>`, `showPopover`. */
  readonly name: string;
  /** The compat key it reads as. */
  readonly key: string;
  /** Where: the property, the selector, the attribute, the tag or the name. */
  readonly span: Span;
}

/**
 * The keys of the manifest that never warn in the author's code (SDD-83 §8.2, decision 17): what
 * fudic cannot do without — the floor already answers for it, and a level below it is `FUD1525` —
 * and the HTML of the root template, whose remedy runs on whatever the template says. A key whose
 * remedy is the runtime's own (`requestIdleCallback`, `CompressionStream`) still warns when the
 * author writes it: nothing remedies the author's call.
 */
const EMITTED_KEYS: ReadonlySet<string> = new Set(
  EMITTED.flatMap((entry) =>
    entry.key !== null && (entry.remedy === null || entry.key.startsWith('html.')) ? [entry.key] : [],
  ),
);

/** How a core browser is named in a message: the mobile ones go by the desktop name. */
const BROWSER_NAMES: Readonly<Record<CoreBrowser, string>> = {
  chrome: 'Chrome',
  chrome_android: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  firefox_android: 'Firefox',
  safari: 'Safari',
  safari_ios: 'Safari',
};

/** The browsers whose first version a message lists: the desktop ones. */
const LISTED: readonly CoreBrowser[] = ['chrome', 'edge', 'firefox', 'safari'];

/** `FUD1524` for `use` when its key does not pass `context`; undefined when it passes or is fudic's. */
export function judgeUse(use: BaselineUse, context: BaselineContext): Diagnostic | undefined {
  if (EMITTED_KEYS.has(use.key) || passes(use.key, context.target, context.allow, context.asOf)) return undefined;
  // `passes` lets a key the table does not have through: a key that fails is one it has.
  const found = status(use.key)!;
  const support = LISTED.flatMap((browser) => {
    const version = found.support[browser];
    return version === undefined ? [] : [`${BROWSER_NAMES[browser]} ${version}`];
  });
  const missing = [
    ...new Set(CORE_BROWSERS.filter((browser) => found.support[browser] === undefined).map((b) => BROWSER_NAMES[b])),
  ];
  return FUD1524({
    span: use.span,
    name: use.name,
    key: use.key,
    baseline: describeTarget(context.target),
    newly: found.newly,
    ...(found.newly === null ? {} : { widely: widelyOn(found.newly) }),
    support,
    missing: found.newly === null ? missing : [],
  });
}

/** Every `FUD1524` among `uses`, in their order. */
export function judgeUses(uses: Iterable<BaselineUse>, context: BaselineContext): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const use of uses) {
    const found = judgeUse(use, context);
    if (found !== undefined) out.push(found);
  }
  return out;
}
