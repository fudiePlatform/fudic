import { describe, expect, it } from 'vitest';
import { flowSpecSkeleton, pageSpecSkeleton, parseSpec, specSkeleton, type ComponentInfo, type PageInfo } from '../../src/index.js';
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
    expect(parsed.value.header?.name?.text).toBe(component.tag);
    expect(parsed.value.criteria).toEqual([]);
    expect(validate(source, { components: [component] })).toEqual([]);
  });
});

describe('pageSpecSkeleton and flowSpecSkeleton (SDD-82 §3.10)', () => {
  const USUARIOS: PageInfo = {
    route: '/usuarios',
    path: '/ws/src/routes/usuarios.fud',
    pattern: '/usuarios',
    params: [],
    fixture: '/ws/src/routes/usuarios.fixture.ts',
    paths: false,
    functions: [],
  };

  it('the page line, and the given a page opens with: its data, how its params are given', () => {
    expect(pageSpecSkeleton('/usuarios', { data: 'base' })).toBe(
      [
        'page /usuarios',
        '',
        '# criterion <slug>',
        '#   given',
        '#     data base',
        '#   when',
        '#     <term> <args>',
        '#   then',
        '#     <term> <args>',
        '',
      ].join('\n'),
    );
    expect(pageSpecSkeleton('/blog/[slug]', { params: 'path' }).split('\n').slice(3, 5)).toEqual(['#   given', '#     path <value>']);
    expect(pageSpecSkeleton('/x/[id]', { data: 'base', params: 'url' }).split('\n').slice(4, 6)).toEqual(['#     data base', '#     url <url>']);
    expect(pageSpecSkeleton('/').split('\n').slice(3, 5)).toEqual(['#   given', '#     <term> <args>']);
  });

  it('the flow line, its criterion opening a URL', () => {
    expect(flowSpecSkeleton('alta').split('\n').slice(0, 5)).toEqual(['flow alta', '', '# criterion <slug>', '#   given', '#     url /']);
  });

  it('both parse and validate clean', () => {
    const page = pageSpecSkeleton('/usuarios', { data: 'base' });
    expect(parseSpec(page).diagnostics).toEqual([]);
    expect(validate(page, { pages: [USUARIOS] })).toEqual([]);
    const flow = flowSpecSkeleton('alta');
    expect(parseSpec(flow).diagnostics).toEqual([]);
    expect(validate(flow)).toEqual([]);
  });
});
