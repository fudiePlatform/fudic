/** BUG-60 §3.1 — the shape of a route's `data`, as the compiler writes it into the page. */

import { describe, expect, it } from 'vitest';
import { createApiIndex, dataShape, framesShape } from '../src/index.js';
import { app } from './project.js';

describe('dataShape', () => {
  it('the fields of load, and every type they reach by its name, a type of another file included', () => {
    const shared = app('shared', 'type Tag\n  label  str\n');
    const route = app(
      'routes/x',
      [
        'load ssr',
        '  users  Person[]',
        '  grid   i32[][]',
        '  byId   map str Person',
        '  tone   Tone',
        '  note   str?',
        '  odd    Nobody',
        '',
        'type Person',
        '  id    i32',
        '  boss  Person?',
        '  tags  Tag[]',
        '  when  date',
        '',
        'enum Tone',
        '  info',
        '  warn',
        '',
      ].join('\n'),
    );
    expect(dataShape(route, createApiIndex([shared, route]))).toEqual({
      fields: {
        users: { list: { ref: 'Person' } },
        grid: { list: { list: 'i32' } },
        byId: { map: ['str', { ref: 'Person' }] },
        tone: { oneOf: ['info', 'warn'] },
        note: { opt: 'str' },
        odd: 'any',
      },
      types: {
        Person: { id: 'i32', boss: { opt: { ref: 'Person' } }, tags: { list: { ref: 'Tag' } }, when: 'date' },
        Tag: { label: 'str' },
      },
    });
  });

  it('nothing for a file with no load', () => {
    const source = app('routes/y', 'get search\n  -> str\n');
    expect(dataShape(source, createApiIndex([source]))).toBeUndefined();
  });
});

describe('framesShape (SDD-70 §3.7)', () => {
  it('every field of load, a `later` one by what it resolves to, and which are `later`', () => {
    const route = app('routes/y', ['load ssr', '  title  str', '  users  Person[]  later', '', 'type Person', '  id  i32', ''].join('\n'));
    expect(framesShape(route, createApiIndex([route]))).toEqual({
      fields: { title: 'str', users: { list: { ref: 'Person' } } },
      types: { Person: { id: 'i32' } },
      later: ['users'],
    });
  });

  it('a file without load has none', () => {
    const route = app('routes/z', 'get f\n');
    expect(framesShape(route, createApiIndex([route]))).toBeUndefined();
  });
});
