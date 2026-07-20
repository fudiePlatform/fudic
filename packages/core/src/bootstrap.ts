/**
 * Root bootstrap (SDD-14 §3.3) for page blocks that are not custom elements:
 * build the render over the live DOM and run the matching path. The page shell
 * calls `hydrateRoot` over SSR-painted markup; `mountRoot` is the cold
 * client-only entry. Independent of any custom-element base class.
 */

import { browserDom, cursorOf } from '@fudic/dom';
import { type Render, type RenderFactory } from './render.js';

/** Adopt the SSR-painted children of `target`, then mount. */
export function hydrateRoot(factory: RenderFactory<Node>, ctx: unknown, target: Node): Render<Node> {
  const render = factory(browserDom, ctx, target);
  render.hydrate(cursorOf(browserDom, target));
  render.mount();
  return render;
}

/** Cold-create under `target`, then mount. */
export function mountRoot(factory: RenderFactory<Node>, ctx: unknown, target: Node): Render<Node> {
  const render = factory(browserDom, ctx, target);
  render.create();
  render.mount();
  return render;
}
