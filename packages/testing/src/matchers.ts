/**
 * The matchers `@fudic/testing` adds to `expect` (§3.4, §3.10), registered by the environment.
 */

import { expect } from 'vitest';
import { reaches, type ClientGraph } from './client-graph.js';

/** The `shadowroot*` attributes a template is expected to carry: `true` for one with no value. */
export type TemplateAttributes = Readonly<Record<string, string | true>>;

interface FudicMatchers<R = unknown> {
  /** The client graph reaches that file, relative to the project root. */
  toReach(path: string): R;
  /** The host's `<template>` carries exactly these `shadowroot*` attributes, no more, no fewer. */
  toContainTemplate(attrs: TemplateAttributes): R;
}

declare module 'vitest' {
  // Declared once, for both forms of a matcher; `any` because that is how vitest declares it.
  interface Assertion<T = any> extends FudicMatchers<T> {}
  interface AsymmetricMatchersContaining extends FudicMatchers {}
}

/**
 * The `shadowroot*` attributes of the first declarative template of the page's body — the
 * host's, the one the page instantiates — by name, `''` for one with no value. `null` when the
 * body has none.
 */
export function templateAttributes(html: string): Record<string, string> | null {
  const body = html.slice(html.search(/<body[\s>]/u));
  const tag = /<template\s[^>]*shadowrootmode[^>]*>/u.exec(body)?.[0];
  if (tag === undefined) return null;
  const out: Record<string, string> = {};
  for (const [, name, value] of tag.matchAll(/\s(shadowroot[a-z]*)(?:="([^"]*)")?/gu)) {
    out[name!] = value ?? '';
  }
  return out;
}

/** What `attrs` means once a valueless attribute is written the way the HTML carries it. */
function normalized(attrs: TemplateAttributes): Record<string, string> {
  return Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, value === true ? '' : value]));
}

/** Register the matchers. Once per environment. */
export function registerMatchers(): void {
  expect.extend({
    toReach(graph: ClientGraph, path: string) {
      const pass = reaches(graph, path);
      return {
        pass,
        message: () =>
          pass
            ? `the client graph reaches ${path}, and it should not:\n  ${graph.files.join('\n  ')}`
            : `the client graph does not reach ${path}:\n  ${graph.files.join('\n  ')}`,
      };
    },
    toContainTemplate(html: string, attrs: TemplateAttributes) {
      const actual = templateAttributes(html);
      const expected = normalized(attrs);
      const pass = actual !== null && this.equals(actual, expected);
      return {
        pass,
        actual,
        expected,
        message: () =>
          actual === null
            ? 'the page has no declarative <template> in its body'
            : pass
              ? `the host's <template> carries exactly ${JSON.stringify(expected)}, and it should not`
              : `the host's <template> carries ${JSON.stringify(actual)}, not exactly ${JSON.stringify(expected)}`,
      };
    },
  });
}
