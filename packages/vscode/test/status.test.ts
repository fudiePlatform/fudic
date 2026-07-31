/**
 * The status bar item (SDD-25 §4.4).
 */

import { describe, expect, it } from 'vitest';
import { createStatus, faceOf, type ServerState } from '../src/status.js';
import type { StatusBarPort } from '../src/ports.js';

const bar = () => {
  const seen = { text: '', tooltip: '', visible: false };
  const port: StatusBarPort = {
    setText: (text) => {
      seen.text = text;
    },
    setTooltip: (tooltip) => {
      seen.tooltip = tooltip;
    },
    show: () => {
      seen.visible = true;
    },
    hide: () => {
      seen.visible = false;
    },
  };
  return { seen, port };
};

describe('faceOf', () => {
  it.each<[ServerState, string]>([
    ['starting', 'Fudic ⟳'],
    ['ready', 'Fudic ✓'],
    ['degraded', 'Fudic ⚠'],
    ['stopped', 'Fudic ✕'],
  ])('shows %s as %s', (state, text) => {
    // The four glyphs of §4.4, spelled out. They are the entire user-visible vocabulary of
    // this extension's health, so they are worth pinning rather than reading off the code.
    expect(faceOf(state).text).toBe(text);
    expect(faceOf(state).tooltip.length).toBeGreaterThan(0);
  });
});

describe('createStatus', () => {
  it('stays hidden until a .fud is the active document', () => {
    // An item that is always there is an item nobody reads.
    const { seen, port } = bar();
    const status = createStatus(port);

    status.setState('ready');
    expect(seen.visible).toBe(false);

    status.setActiveLanguage('fudic');
    expect(seen.visible).toBe(true);
    expect(seen.text).toBe('Fudic ✓');
  });

  it('hides again when the focus moves to another language', () => {
    const { seen, port } = bar();
    const status = createStatus(port);

    status.setActiveLanguage('fudic');
    status.setActiveLanguage('typescript');

    expect(seen.visible).toBe(false);
  });

  it('hides when there is no editor at all', () => {
    const { seen, port } = bar();
    const status = createStatus(port);

    status.setActiveLanguage('fudic');
    status.setActiveLanguage(undefined);

    expect(seen.visible).toBe(false);
  });

  it('repaints on a state change without being told about the editor again', () => {
    const { seen, port } = bar();
    const status = createStatus(port);

    status.setActiveLanguage('fudic');
    status.setState('stopped');

    expect(seen.text).toBe('Fudic ✕');
    expect(seen.visible).toBe(true);
    expect(status.state).toBe('stopped');
  });

  it('starts out initialising', () => {
    const { seen, port } = bar();
    const status = createStatus(port);

    status.setActiveLanguage('fudic');

    expect(seen.text).toBe('Fudic ⟳');
  });
});
