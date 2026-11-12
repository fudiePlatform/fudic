/**
 * What fudic puts in a page by itself (SDD-83 §3.7): the manifest of what the runtime and the
 * compiler emit, and the floor it sets.
 *
 * fudic commits to working from a floor, and above it brings its own remedy. So what is in here never
 * warns in the user's code — `shadowrootmode` on a root `<template>` is fudic's, not its author's —
 * and the only warning fudic causes is a project asking for less than the floor (`FUD1525`).
 *
 * Each entry carries the feature and the `newly` date of its key as the table has them. They are
 * copied, not looked up, so that reading a `fudic.json` judges the floor without loading the table of
 * keys (§8.2, decision 10); a test holds them to the table, and fails on the version of web-features
 * that changes one.
 */

export interface EmittedFeature {
  /** The BCD key, or null when the data has none (`<style type="module" specifier>`). */
  readonly key: string | null;
  /** The web-features id of the key, or null with no key. */
  readonly feature: string | null;
  /** The key's `newly` date, `YYYY-MM-DD`; null with no key or when it is not in Baseline. */
  readonly newly: string | null;
  /** What makes fudic emit it. */
  readonly when: string;
  /** What fudic does where it is missing, or null when it needs it. */
  readonly remedy: string | null;
}

export const EMITTED: readonly EmittedFeature[] = [
  {
    key: 'html.elements.template.shadowrootmode',
    feature: 'declarative-shadow-dom',
    newly: '2024-02-20',
    when: 'every component: its shadow root is declarative',
    remedy: null,
  },
  {
    key: 'javascript.builtins.Promise.withResolvers',
    feature: 'promise-withresolvers',
    newly: '2024-03-05',
    when: 'the deferred fields of a data stream (`@await`)',
    remedy: null,
  },
  {
    key: 'html.elements.template.shadowrootdelegatesfocus',
    feature: 'declarative-shadow-dom',
    newly: '2024-09-16',
    when: 'every form control, and a root template that asks for it',
    remedy: 'the host delegates the focus by script when it hydrates',
  },
  {
    key: 'api.ElementInternals',
    feature: 'form-associated-custom-elements',
    newly: '2023-03-27',
    when: 'every form control: it is form-associated',
    remedy: null,
  },
  {
    key: 'api.HTMLElement.attachInternals',
    feature: 'form-associated-custom-elements',
    newly: '2023-03-27',
    when: 'every form control: it is form-associated',
    remedy: null,
  },
  {
    key: 'api.ShadowRoot.adoptedStyleSheets',
    feature: 'constructed-stylesheets',
    newly: '2023-03-27',
    when: 'the shared sheets of a component created on the client',
    remedy: null,
  },
  {
    key: 'api.CSSStyleSheet.replaceSync',
    feature: 'constructed-stylesheets',
    newly: '2023-03-27',
    when: 'the shared sheets of a component created on the client',
    remedy: null,
  },
  {
    key: null,
    feature: null,
    newly: null,
    when: 'the shared sheets of a page: `<style type="module" specifier>`',
    remedy: 'an inline polyfill',
  },
  {
    key: 'api.Window.requestIdleCallback',
    feature: 'requestidlecallback',
    newly: null,
    when: 'warming the chunks of what enters the viewport, in idle time',
    remedy: '`setTimeout`',
  },
  {
    key: 'api.CompressionStream',
    feature: 'compression-streams',
    newly: '2023-05-09',
    when: 'a request body the http chain compresses',
    remedy: 'detected, and skipped where missing',
  },
];

/** The entries fudic cannot do without, with their date: the ones that set the floor. */
const NEEDED = EMITTED.filter(
  (entry): entry is EmittedFeature & { readonly feature: string; readonly newly: string } =>
    entry.remedy === null && entry.newly !== null,
);

/** The newest `newly` date among the entries with no remedy: the oldest browsers fudic runs in. */
export const FLOOR: string = NEEDED.map((entry) => entry.newly).reduce((newest, date) => (date > newest ? date : newest));

/**
 * The features fudic needs that a level cutting on `cutoff` does not have, without repeats and in
 * manifest order: empty when the level is at or above the floor.
 */
export function needsNewer(cutoff: string): readonly string[] {
  return [...new Set(NEEDED.filter((entry) => entry.newly > cutoff).map((entry) => entry.feature))];
}
