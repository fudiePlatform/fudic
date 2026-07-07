/**
 * Hydration scheduler (SDD-14 §4.8, decision 74): defer `customElements.define`
 * per strategy. Until the upgrade the component is painted DSD — the server's
 * initial state, visible and inert.
 */

export type HydrationStrategy = 'eager' | 'viewport' | 'interaction' | 'idle';

const INTERACTION_TYPES = ['pointerdown', 'focusin', 'keydown'] as const;

/** Defer `customElements.define(tag, ctor)` per strategy. Default `interaction`. */
export function defineLazy(
  tag: string,
  ctor: CustomElementConstructor,
  strategy: HydrationStrategy = 'interaction',
): void {
  switch (strategy) {
    case 'eager':
      define(tag, ctor);
      return;
    case 'interaction':
      onInteraction(tag, ctor);
      return;
    case 'viewport':
      onViewport(tag, ctor);
      return;
    case 'idle':
      onIdle(tag, ctor);
      return;
  }
}

function define(tag: string, ctor: CustomElementConstructor): void {
  if (customElements.get(tag) === undefined) {
    customElements.define(tag, ctor);
  }
}

function onInteraction(tag: string, ctor: CustomElementConstructor): void {
  const listener = (e: Event): void => {
    const target = e.target;
    // The DSD shadow retargets inner events to the host, which carries the marker.
    if (!(target instanceof Element) || target.closest(`[data-fud-c="${tag}"]`) === null) {
      return;
    }
    for (const type of INTERACTION_TYPES) {
      document.removeEventListener(type, listener, true);
    }
    define(tag, ctor);
  };
  for (const type of INTERACTION_TYPES) {
    document.addEventListener(type, listener, true);
  }
}

function onViewport(tag: string, ctor: CustomElementConstructor): void {
  const hosts = document.querySelectorAll(`[data-fud-c="${tag}"]`);
  if (hosts.length === 0) {
    // No painted host gates the upgrade; a client-created instance still needs it.
    define(tag, ctor);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      define(tag, ctor);
    }
  });
  for (const host of hosts) {
    observer.observe(host);
  }
}

function onIdle(tag: string, ctor: CustomElementConstructor): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (typeof idle === 'function') {
    idle(() => {
      define(tag, ctor);
    });
  } else {
    setTimeout(() => {
      define(tag, ctor);
    }, 0);
  }
}
