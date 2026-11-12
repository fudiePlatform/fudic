/**
 * `ctx.locate`: a reference as a Playwright locator that holds the workbench's rule — one
 * reference, one element — and tells the host where that element was, for the shot.
 */

import type { Locator, Page } from 'playwright-core';
import type { Box } from './types.js';

type AriaRole = Parameters<Page['getByRole']>[0];

/** One step of a reference: a tag, or a role with its name, exact or contained. */
type Step =
  | { readonly tag: string }
  | { readonly role: AriaRole; readonly name?: string; readonly exact: boolean };

/** `role:<role>`, `role:<role>/"<name>"` or `role:<role>/~"<text>"`, the name with `\"` and `\\` escaped. */
const ROLE = /^role:([a-z]+)(?:\/(~?)"((?:[^"\\]|\\.)*)")?$/u;

/** The steps of a reference, split at every `>` outside quotes. */
function stepsOf(ref: string): readonly Step[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < ref.length; i++) {
    const c = ref[i];
    if (quoted && c === '\\') i++;
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === '>') {
      parts.push(ref.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(ref.slice(start));
  return parts.map((part): Step => {
    const role = ROLE.exec(part);
    if (role === null) return { tag: part };
    const name = role[3];
    return name === undefined
      ? { role: role[1] as AriaRole, exact: true }
      : { role: role[1] as AriaRole, name: name.replace(/\\(.)/gu, '$1'), exact: role[2] === '' };
  });
}

/**
 * A reference as Playwright locates it: steps joined by `>`, each a tag or a `role:` with an
 * optional name — `/"…"` exact, `/~"…"` contained — and each searched inside the one before it.
 * Every step pierces shadow roots.
 */
export function locatorOf(page: Page, ref: string): Locator {
  let at: Page | Locator = page;
  for (const step of stepsOf(ref)) {
    if ('tag' in step) at = at.locator(step.tag);
    else at = step.name === undefined ? at.getByRole(step.role) : at.getByRole(step.role, { name: step.name, exact: step.exact });
  }
  return at as Locator;
}

/**
 * The calls of a `Locator` that do not touch one element: they build another locator, or speak of
 * all the elements it matches. Every other call is checked first.
 */
const FREE = new Set<string>([
  'all',
  'allInnerTexts',
  'allTextContents',
  'and',
  'contentFrame',
  'count',
  'describe',
  'evaluateAll',
  'filter',
  'first',
  'frameLocator',
  'getByAltText',
  'getByLabel',
  'getByPlaceholder',
  'getByRole',
  'getByTestId',
  'getByText',
  'getByTitle',
  'last',
  'locator',
  'nth',
  'or',
  'page',
  'toString',
]);

/** Free too: Playwright's own (`_…`) and the language's (symbols), which other code calls on it. */
function free(key: string | symbol): boolean {
  return typeof key === 'symbol' || key.startsWith('_') || FREE.has(key);
}

/**
 * Runs in the page, so it travels as source text: the `data-fud-src` of the element, or of the
 * nearest ancestor that has one — leaving a shadow root by its host — so a text inside an element
 * no `.fud` wrote lands on the element that wrote it. Null when none has it.
 */
const sourceOf = new Function(
  'element',
  `for (let at = element; at; ) {
    const source = at.getAttribute && at.getAttribute('data-fud-src');
    if (source) return source;
    const parent = at.parentNode;
    at = parent && parent.host ? parent.host : parent;
  }
  return null;`,
) as (element: unknown) => string | null;

/**
 * A reference matched more than one element. Recognised by its `name`, not by its class: the
 * workbench and the project may each load their own copy of this package.
 */
export class AmbiguousReference extends Error {
  override readonly name = 'AmbiguousReference';

  constructor(
    readonly ref: string,
    readonly count: number,
  ) {
    super(`${ref} matches ${count} elements; a reference must match one`);
  }
}

/**
 * The locator of `ref`, guarded: before each call that reads or acts on the element, it counts
 * them. More than one is an error that says how many; exactly one is reported to `onLocate`.
 * None is left to the call itself, which waits for it to appear.
 */
export function guardedLocator(
  page: Page,
  ref: string,
  onLocate: (ref: string, box: Box, source: string | null) => void,
): Locator {
  const locator = locatorOf(page, ref);
  const one = async (): Promise<void> => {
    const count = await locator.count();
    if (count > 1) throw new AmbiguousReference(ref, count);
    if (count === 0) return;
    const box = await locator.boundingBox();
    if (box !== null) onLocate(ref, box, await locator.evaluate(sourceOf));
  };
  const guarded = new Proxy(locator, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function' || free(key)) return value;
      return async (...args: unknown[]) => {
        await one();
        return (value as (...args: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  unguardedOf.set(guarded, locator);
  return guarded;
}

/** Each guarded locator's own. */
const unguardedOf = new WeakMap<Locator, Locator>();

/**
 * The locator without its guard: what the host reads when it waits for a gesture. Its reads are
 * the workbench's, not the term's — they must neither count nor mark. Any other locator, as is.
 */
export function unguarded(locator: Locator): Locator {
  return unguardedOf.get(locator) ?? locator;
}
