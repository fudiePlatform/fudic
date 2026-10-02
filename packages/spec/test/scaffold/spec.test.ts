import { describe, expect, it } from 'vitest';
import { parseSpec, specSkeleton, type ComponentInfo } from '../../src/index.js';
import { validate } from '../terms.js';

const CARD: ComponentInfo = { tag: 'app-card', path: '/ws/app-card.fud', requiredProps: ['title', 'href'] };
const PLAIN: ComponentInfo = { tag: 'app-plain', path: '/ws/app-plain.fud', requiredProps: [] };

describe('specSkeleton (criterion 1)', () => {
  it('writes the component line and the commented shape of a criterion', () => {
    expect(specSkeleton('app-plain', false)).toBe(
      [
        'component app-plain',
        '',
        '# criterion <slug>',
        '#   given',
        '#     <term> <args>',
        '#   when',
        '#     <term> <args>',
        '#   then',
        '#     <term> <args>',
        '',
      ].join('\n'),
    );
  });

  it('puts `props base` under the commented given only when asked', () => {
    expect(specSkeleton('app-card', true).split('\n').slice(3, 5)).toEqual(['#   given', '#     props base']);
    expect(specSkeleton('app-card', false)).not.toContain('props');
  });

  it.each([
    ['with props', CARD, true],
    ['without props', PLAIN, false],
  ] as const)('parses and validates clean %s, against a context where the component exists', (_, component, props) => {
    const source = specSkeleton(component.tag, props);
    const parsed = parseSpec(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.value.component?.tag?.text).toBe(component.tag);
    expect(parsed.value.criteria).toEqual([]);
    expect(validate(source, { components: [component] })).toEqual([]);
  });
});
