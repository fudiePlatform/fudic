/**
 * The `ctx` a term receives, built over one page of the browser. It is the contract the term
 * modules of `fudic/terms/` already use, and the workbench builds it without changing it.
 */

import type { LocatorLike, PageLike, Target } from './browser.js';
import { FLAT_TEXT } from './flat-text.js';
import type { Box } from './protocol.js';
import { settled } from './settle.js';

export interface TermLocator {
  box(): Promise<{ readonly width: number; readonly height: number }>;
  textContent(): Promise<string>;
  isVisible(): Promise<boolean>;
  click(): Promise<void>;
  /** Sets it and answers the value it had: null when it had none. */
  setAttribute(name: string, value: string): Promise<string | null>;
}

export interface TermContext {
  /** What `given route` asks for. The workbench does not navigate: see `navigated`. */
  goto(path: string): Promise<void>;
  /** A `tag` or `role:<role>[/"<name>"]` reference. */
  locate(ref: string): TermLocator;
}

const ROLE = /^role:([a-z]+)(?:\/"(.*)")?$/u;

/** A reference as a Playwright target. */
export function parseRef(ref: string): Target {
  const role = ROLE.exec(ref);
  if (role === null) return { css: ref };
  return role[2] === undefined ? { role: role[1]! } : { role: role[1]!, name: role[2] };
}

const SET_ATTRIBUTE = `(element, [name, value]) => {
  const before = element.getAttribute(name);
  element.setAttribute(name, value);
  return before;
}`;

/**
 * `goto` never navigates — the workbench mounts the component alone, on its own page — and
 * tells `onGoto` instead, so the step can say it was ignored. Every reference a call resolves
 * tells `onLocate` where it was, so the shot can mark it.
 */
export function createTermContext(
  page: PageLike,
  onGoto: (path: string) => void = () => undefined,
  onLocate: (ref: string, box: Box) => void = () => undefined,
): TermContext {
  return {
    goto(path) {
      onGoto(path);
      return Promise.resolve();
    },
    locate(ref) {
      const element = page.locate(parseRef(ref));
      /** One element, or the step fails saying how many: a measure must say what it measured. */
      const one = async (): Promise<LocatorLike> => {
        const count = await element.count();
        if (count > 1) throw new Error(`${ref} matches ${count} elements; a reference must match one`);
        const box = count === 1 ? await element.box() : null;
        if (box !== null) onLocate(ref, box);
        return element;
      };
      return {
        async box() {
          const box = await (await one()).box();
          if (box === null) throw new Error(`${ref} is not rendered`);
          return { width: box.width, height: box.height };
        },
        textContent: async () => (await one()).evaluate<string>(FLAT_TEXT),
        isVisible: async () => (await one()).isVisible(),
        async click() {
          const target = await one();
          await settled(page, target, () => target.click());
        },
        async setAttribute(name, value) {
          const target = await one();
          let before: string | null = null;
          await settled(page, target, async () => {
            before = await target.evaluate<string | null>(SET_ATTRIBUTE, [name, value]);
          });
          return before;
        },
      };
    },
  };
}
