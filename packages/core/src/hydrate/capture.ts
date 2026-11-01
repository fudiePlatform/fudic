// One capture-phase listener sees a gesture before any component listener. Three cases:
//
// - the instance is already up: do nothing, its own listener handles the event;
// - its tag is defined but it was never touched: its listener already got the event, so
//   only mark and report it (replaying would run the handler twice);
// - its tag is not defined: withhold the gesture, bring the instance up, then replay it.

import { replayer } from './replay.js';
import { type ElementRegistry } from './registry.js';
import { ID_ATTR, idOf, type InstanceState } from './instances.js';

export interface CaptureConfig {
  readonly state: InstanceState;
  readonly registry: ElementRegistry;
  /** Brings the instance up and then calls `replay`. */
  readonly onCold: (host: Element, id: number, replay: () => void) => void;
  readonly onShared: (host: Element, id: number) => void;
}

// The nearest hydratable host in the composed path, which crosses shadow boundaries.
function targeted(path: readonly EventTarget[]): { host: Element; target: EventTarget } | null {
  const target = path[0];
  // An event that is not being dispatched has an empty path.
  if (target === undefined) return null;
  for (const node of path) {
    if (node instanceof Element && node.hasAttribute(ID_ATTR)) return { host: node, target };
  }
  return null;
}

// Input types whose default action is not typing.
const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'image',
  'file',
  'color',
  'range',
  'hidden',
]);

// Where the user types, cancelling the default would drop the character: a replayed
// event does not type it back.
function isEditable(target: EventTarget): boolean {
  const el = target as Partial<HTMLInputElement>;
  if (el.isContentEditable === true) return true;
  if (el.localName === 'textarea' || el.localName === 'select') return true;
  return el.localName === 'input' && !NON_TEXT_INPUTS.has((target as HTMLInputElement).type);
}

function withhold(event: Event, target: EventTarget): void {
  if (!isEditable(target)) event.preventDefault();
  event.stopImmediatePropagation();
}

export function createCapturer(config: CaptureConfig): (event: Event) => void {
  const { state, registry, onCold, onShared } = config;
  // Gestures that land while an instance is coming up wait behind the first one, so a click
  // right after the focus that started the download is not lost.
  const pending = new Map<number, (() => void)[]>();

  return (event: Event): void => {
    const hit = targeted(event.composedPath());
    if (hit === null) return;
    const id = idOf(hit.host);
    const queue = pending.get(id);
    if (queue !== undefined) {
      withhold(event, hit.target);
      queue.push(replayer(event, hit.target));
      return;
    }
    if (state.hydrated.has(id)) return;
    const wasDefined = registry.get(hit.host.localName) !== undefined;
    // Marked before anything async, so the replay itself finds the instance up.
    state.hydrated.add(id);
    if (wasDefined) {
      onShared(hit.host, id);
      return;
    }
    withhold(event, hit.target);
    const waiting = [replayer(event, hit.target)];
    pending.set(id, waiting);
    onCold(hit.host, id, () => {
      pending.delete(id);
      for (const replay of waiting) replay();
    });
  };
}
