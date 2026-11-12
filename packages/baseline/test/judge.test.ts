import { describe, expect, it } from 'vitest';
import {
  CORE_BROWSERS,
  cssFunctionKeys,
  cssUnitKey,
  feature,
  firstKnown,
  passes,
  status,
  tagInterface,
  VERSION,
} from '../src/index.js';

const AS_OF = '2026-10-27';
const NONE: ReadonlySet<string> = new Set();

describe('status: what the data says of a key', () => {
  it('reads a key with its feature, its newly date and its support (web-features 3.45.0)', () => {
    expect(VERSION).toBe('3.45.0');
    expect(status('css.properties.field-sizing')).toEqual({
      key: 'css.properties.field-sizing',
      feature: 'field-sizing',
      features: ['field-sizing'],
      newly: '2026-06-16',
      support: {
        chrome: '123',
        chrome_android: '123',
        edge: '123',
        firefox: '152',
        firefox_android: '152',
        safari: '26.2',
        safari_ios: '26.2',
      },
    });
  });

  it('judges the key, not the feature: the popover attribute is older than popover', () => {
    expect(status('html.global_attributes.popover')?.newly).toBe('2024-04-16');
    expect(feature('popover')).toEqual({ kind: 'feature', id: 'popover', name: 'Popover' });
  });

  it('gives null and leaves out the browsers that lack a key not in Baseline', () => {
    const closedby = status('html.elements.dialog.closedby');
    expect(closedby?.newly).toBeNull();
    expect(CORE_BROWSERS.filter((b) => closedby?.support[b] === undefined)).toEqual(['safari', 'safari_ios']);
  });

  it('lists every feature of a key two features share', () => {
    expect(status('api.HTMLMediaElement.play')?.features).toEqual(['audio', 'video']);
  });

  it('does not know a key the table does not have, nor a prototype name', () => {
    expect(status('css.properties.not-a-property')).toBeUndefined();
    expect(status('nowhere.at.all')).toBeUndefined();
    expect(status('css.properties.toString')).toBeUndefined();
    expect(status('http.headers.Accept')).toBeUndefined();
  });
});

describe('passes: a key against a level (criterion 14)', () => {
  it('popover passes widely', () => {
    expect(passes('html.global_attributes.popover', 'widely', NONE, AS_OF)).toBe(true);
  });

  it(':state() fails widely and passes newly and 2024', () => {
    expect(passes('css.selectors.state', 'widely', NONE, AS_OF)).toBe(false);
    expect(passes('css.selectors.state', 'newly', NONE, AS_OF)).toBe(true);
    expect(passes('css.selectors.state', 2024, NONE, AS_OF)).toBe(true);
  });

  it('field-sizing passes newly and fails 2025', () => {
    expect(passes('css.properties.field-sizing', 'newly')).toBe(true);
    expect(passes('css.properties.field-sizing', 2025)).toBe(false);
  });

  it('<dialog closedby> passes no level', () => {
    for (const target of ['widely', 'newly', 2026] as const) {
      expect(passes('html.elements.dialog.closedby', target)).toBe(false);
    }
  });

  it('an allowed feature passes whatever its date', () => {
    expect(passes('css.selectors.state', 'widely', new Set(['state']))).toBe(true);
    expect(passes('html.elements.dialog.closedby', 'widely', new Set(['dialog-closedby']))).toBe(true);
    expect(passes('api.HTMLMediaElement.play', 2015, new Set(['video']))).toBe(true);
  });

  it('a key the table does not have passes: better silent than wrong', () => {
    expect(passes('css.properties.not-a-property', 2015)).toBe(true);
  });

  it('moves with the data date it is given, not with the clock (criterion 17)', () => {
    expect(passes('css.selectors.state', 'widely', NONE, '2027-01-01')).toBe(true);
    expect(passes('html.global_attributes.popover', 'widely', NONE, '2026-01-01')).toBe(false);
  });
});

describe('feature: an id of allow', () => {
  it('follows an id that moved, and one that was split', () => {
    expect(feature('masonry')).toEqual({ kind: 'moved', id: 'masonry', to: ['grid-lanes'] });
    expect(feature('text-wrap-style')).toEqual({
      kind: 'split',
      id: 'text-wrap-style',
      to: ['text-wrap', 'text-wrap-balance', 'text-wrap-pretty'],
    });
  });

  it('does not know an id that is no feature', () => {
    expect(feature('nada')).toBeUndefined();
    expect(feature('constructor')).toBeUndefined();
  });
});

describe('the indexes the detectors ask', () => {
  it('firstKnown takes the first candidate the table has', () => {
    expect(firstKnown(['html.elements.input.type_color', 'html.elements.input.type.color'])).toBe(
      'html.elements.input.type_color',
    );
    expect(firstKnown(['api.HTMLDivElement.toggle_event', 'api.HTMLElement.toggle_event'])).toBe(
      'api.HTMLElement.toggle_event',
    );
    expect(firstKnown(['css.properties.nope'])).toBeUndefined();
  });

  it('cssFunctionKeys finds a function by its name, in any case', () => {
    expect(cssFunctionKeys('light-dark')).toEqual(['css.types.color.light-dark']);
    expect(cssFunctionKeys('LIGHT-DARK')).toEqual(['css.types.color.light-dark']);
    expect(cssFunctionKeys('not-a-function')).toEqual([]);
    expect(cssFunctionKeys('constructor')).toEqual([]);
  });

  it('cssUnitKey finds a unit, in any case, and nothing for one as old as its type', () => {
    expect(cssUnitKey('dvh')).toBe('css.types.length.viewport_percentage_units_dynamic');
    expect(cssUnitKey('Q')).toBe('css.types.length.Q');
    expect(cssUnitKey('px')).toBeUndefined();
  });

  it('tagInterface gives the DOM interface of a tag, HTMLElement when it has none', () => {
    expect(tagInterface('div')).toBe('HTMLDivElement');
    expect(tagInterface('a')).toBe('HTMLAnchorElement');
    expect(tagInterface('TD')).toBe('HTMLTableCellElement');
    expect(tagInterface('search')).toBe('HTMLElement');
  });
});
