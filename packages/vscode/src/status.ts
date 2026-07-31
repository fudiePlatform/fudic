/**
 * The status bar item (SDD-25 §4.4).
 *
 * A silent failure is indistinguishable from a slow LSP. This is what turns "it isn't
 * working" into a fact: four states, one glance, and a click that goes straight to the
 * output channel where the reason is.
 *
 * It shows only while a `.fud` is the active document, because an item that is always
 * there is an item nobody reads.
 */

import type { StatusBarPort } from './ports.js';

export type ServerState = 'starting' | 'ready' | 'degraded' | 'stopped';

interface Face {
  readonly text: string;
  readonly tooltip: string;
}

const FACES: Readonly<Record<ServerState, Face>> = {
  starting: { text: 'Fudic ⟳', tooltip: 'Fudic: iniciando el servidor de lenguaje…' },
  ready: { text: 'Fudic ✓', tooltip: 'Fudic: el servidor de lenguaje está listo.' },
  degraded: {
    text: 'Fudic ⚠',
    tooltip: 'Fudic: sin el TypeScript del proyecto. HTML y CSS siguen funcionando.',
  },
  stopped: {
    text: 'Fudic ✕',
    tooltip: 'Fudic: el servidor de lenguaje no está en marcha. Pulsa para ver el registro.',
  },
};

/** The face of a state, exported so a test names the same table the user reads. */
export const faceOf = (state: ServerState): Face => FACES[state];

export interface Status {
  setState(state: ServerState): void;
  /** The language of the active editor, or `undefined` when there is no editor. */
  setActiveLanguage(languageId: string | undefined): void;
  readonly state: ServerState;
}

export const createStatus = (bar: StatusBarPort): Status => {
  let state: ServerState = 'starting';
  let onFud = false;

  const render = (): void => {
    const face = FACES[state];
    bar.setText(face.text);
    bar.setTooltip(face.tooltip);
    if (onFud) bar.show();
    else bar.hide();
  };

  return {
    get state() {
      return state;
    },
    setState: (next) => {
      state = next;
      render();
    },
    setActiveLanguage: (languageId) => {
      onFud = languageId === 'fudic';
      render();
    },
  };
};
