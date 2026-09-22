/**
 * What the build emits for an owning tag (SDD-38 §4.5): a module whose whole surface is
 * `register`. A real file on disk and not a stub, because what `installPage` is held to
 * here is that it reaches the URL its own resolver produced — the same arithmetic a
 * hydration chunk uses, with no second resolver anywhere (SDD-45 §3.4).
 */
export const registered = [];

export const register = (container) => {
  registered.push(container.label);
};
