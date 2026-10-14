/**
 * The queries of a mounted component or page (§3.3): Testing Library's, run on the root and on
 * every shadow root below it (decision 8.1.4), so they find what the user sees. Plus `query`,
 * a CSS selector with the same reach, and `errorOf`, the error slot of a labelled control.
 */

import {
  queryAllByLabelText,
  queryAllByRole,
  queryAllByText,
  type ByRoleOptions,
} from '@testing-library/dom';

export type { ByRoleOptions };

/** What a test asks a mounted root. */
export interface Queries {
  getByRole(role: string, options?: ByRoleOptions): HTMLElement;
  getByLabelText(text: string | RegExp): HTMLElement;
  getByText(text: string | RegExp): HTMLElement;
  queryByRole(role: string, options?: ByRoleOptions): HTMLElement | null;
  /** A CSS selector, also going down through shadow roots. */
  query(selector: string): Element | null;
  /** The text of the `data-fud-err` slot of the control with that label, or `null` when empty. */
  errorOf(label: string | RegExp): string | null;
}

/** `root` and every shadow root under it, outermost first. */
function rootsOf(root: ParentNode): ParentNode[] {
  const out: ParentNode[] = [root];
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot !== null) out.push(...rootsOf(el.shadowRoot));
  }
  return out;
}

/** What `find` answers in every root under `root`. */
function across(root: ParentNode, find: (container: HTMLElement) => HTMLElement[]): HTMLElement[] {
  // Testing Library types its container as an element, and only ever calls what a shadow root
  // also has on it.
  return rootsOf(root).flatMap((container) => find(container as HTMLElement));
}

/** The one element `found` holds, or an error that says what was asked and what came back. */
function single(found: HTMLElement[], what: string): HTMLElement {
  if (found.length === 1) return found[0]!;
  throw new Error(
    found.length === 0 ? `Unable to find ${what}` : `Found ${String(found.length)} elements for ${what}, expected one`,
  );
}

/** The queries of `root`, reaching into the shadow roots below it. */
export function queriesOf(root: ParentNode): Queries {
  const getByLabelText = (text: string | RegExp): HTMLElement =>
    single(across(root, (c) => queryAllByLabelText(c, text)), `an element labelled ${String(text)}`);
  return {
    getByRole: (role, options) =>
      single(across(root, (c) => queryAllByRole(c, role, options)), `an element with the role "${role}"`),
    getByLabelText,
    getByText: (text) => single(across(root, (c) => queryAllByText(c, text)), `an element with the text ${String(text)}`),
    queryByRole: (role, options) => {
      const found = across(root, (c) => queryAllByRole(c, role, options));
      return found.length === 0 ? null : single(found, `an element with the role "${role}"`);
    },
    query: (selector) => {
      for (const container of rootsOf(root)) {
        const found = container.querySelector(selector);
        if (found !== null) return found;
      }
      return null;
    },
    errorOf: (label) => {
      const control = getByLabelText(label);
      const home = control.getRootNode() as Document | ShadowRoot;
      const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
      // The slot the emit wires to the control: the element its `aria-describedby` names.
      const slot = ids.map((id) => home.getElementById(id)).find((el) => el !== null);
      if (slot === undefined) throw new Error(`The control labelled ${String(label)} has no error slot`);
      const text = slot!.textContent.trim();
      return text === '' ? null : text;
    },
  };
}
