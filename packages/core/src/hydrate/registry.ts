/**
 * The part of `CustomElementRegistry` the runtime uses. The runtime never defines a tag:
 * a chunk does, as a side effect of being evaluated.
 */
export interface ElementRegistry {
  get(name: string): CustomElementConstructor | undefined;
  whenDefined(name: string): Promise<unknown>;
  upgrade(node: Node): void;
}

// An object rather than `customElements` itself, so importing `@fudic/core` on a server
// does not touch a global that is not there.
export const browserRegistry: ElementRegistry = {
  get: (name) => customElements.get(name),
  whenDefined: (name) => customElements.whenDefined(name),
  upgrade: (node) => {
    customElements.upgrade(node);
  },
};

/** How this page defines a tag: by downloading its chunk. */
export type DefineTag = (tag: string) => Promise<void>;

// Published by hydration and read by `live`, so `live` stays out of the modules every page
// loads. One page per module instance, so module state is safe here.
let pageDefine: DefineTag | null = null;
let pageRegistry: ElementRegistry = browserRegistry;

export function publishTagSource(define: DefineTag, elements: ElementRegistry): void {
  pageDefine = define;
  pageRegistry = elements;
}

/** How this page downloads a definition, or `null` when hydration is not installed. */
export function tagDefiner(): DefineTag | null {
  return pageDefine;
}

export function pageElements(): ElementRegistry {
  return pageRegistry;
}
