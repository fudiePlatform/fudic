/**
 * `FudicElement` — the N3 custom-element base (SDD-14 §4.5, decision 73). Owns
 * the state (signals live as subclass fields) and delegates the view to the
 * `Render` built by the emit-generated `render()`. `connectedCallback` resolves
 * the shadow root, hydrates when the SSR sent it as DSD, creates otherwise,
 * then mounts. `disconnectedCallback` tears down symmetrically.
 */

import { browserDom, cursorOf, type DomClient } from '@fudic/dom';
import { type Render } from './render.js';
import { styles } from './styles.js';

export abstract class FudicElement extends HTMLElement {
  #view: Render<Node> | null = null;

  /** Implemented by the emit: builds the Render over the resolved shadow root. */
  protected abstract render(dom: DomClient<Node>, root: ShadowRoot): Render<Node>;

  connectedCallback(): void {
    const existing = this.shadowRoot;
    // DSD from the SSR arrives as a populated shadow root before the upgrade.
    const hydrating = existing !== null && existing.firstChild !== null;
    const root = existing ?? this.attachShadow({ mode: 'open' });
    const view = (this.#view = this.render(browserDom, root));
    if (hydrating) {
      view.hydrate(cursorOf(browserDom, root));
    } else {
      view.create();
      // Cold path only: DSD instances were already adopted by the page polyfill.
      styles.adopt(root, this.localName);
    }
    view.mount();
  }

  disconnectedCallback(): void {
    this.#view?.remove();
    this.#view = null;
  }
}
