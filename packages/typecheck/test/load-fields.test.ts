/**
 * SDD-82 §3.10 — `loadFields`: what the `load` of a route returns, as the fields `fudic g spec
 * /<route>` and the editor write a sample `data` for.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, parseApi, type ApiSource } from '@fudic/api';
import { sampleValue } from '@fudic/spec';
import { loadFields } from '../src/api-project.js';

const source = (id: string, text: string): ApiSource => ({ id, path: `/p/src/${id}.fudapi`, origin: 'app', file: parseApi(text).value });

const lines = (...l: string[]): string => [...l, ''].join('\n');

const ROUTE = source(
  'routes/gente',
  lines(
    'load ssr',
    '  title    str',
    '  id       uuid',
    '  age      i32',
    '  ratio    f64',
    '  active   bool',
    '  when     date',
    '  bio      html',
    '  photo    file',
    '  note     str?',
    '  tags     str[]',
    '  scores   map str i32',
    '  tone     Tone',
    '  owner    Person',
    '  users    Person[]  later',
    '  nobody   Missing',
    '',
    'enum Tone',
    '  calm',
    '  loud',
    '',
    'type Person',
    '  name     str',
    '  boss     Person',
    '  nick     str?',
  ),
);
const index = createApiIndex([ROUTE]);

describe('loadFields', () => {
  it('each field of load, a later one by what it resolves to, an optional one not required', () => {
    const fields = loadFields(ROUTE, index)!;
    expect(fields.map((f) => [f.name, f.required])).toEqual([
      ['title', true],
      ['id', true],
      ['age', true],
      ['ratio', true],
      ['active', true],
      ['when', true],
      ['bio', true],
      ['photo', true],
      ['note', false],
      ['tags', true],
      ['scores', true],
      ['tone', true],
      ['owner', true],
      ['users', true],
      ['nobody', true],
    ]);
    const shape = Object.fromEntries(fields.map((f) => [f.name, f.shape]));
    expect(shape['title']).toEqual({ kind: 'string' });
    expect(shape['id']).toEqual({ kind: 'string' });
    expect(shape['age']).toEqual({ kind: 'number' });
    expect(shape['ratio']).toEqual({ kind: 'number' });
    expect(shape['active']).toEqual({ kind: 'boolean' });
    expect(shape['note']).toEqual({ kind: 'string' });
    expect(shape['tags']).toEqual({ kind: 'array', element: { kind: 'string' } });
    expect(shape['scores']).toEqual({ kind: 'record' });
    expect(shape['tone']).toEqual({ kind: 'union', members: [{ kind: 'literal', value: 'calm' }, { kind: 'literal', value: 'loud' }] });
    expect(shape['nobody']).toEqual({ kind: 'any' });
  });

  it('what a fixture cannot write as a literal is opaque, and a type that names itself stops there', () => {
    const shape = Object.fromEntries(loadFields(ROUTE, index)!.map((f) => [f.name, f.shape]));
    for (const name of ['when', 'bio', 'photo']) expect(shape[name]).toEqual({ kind: 'opaque' });
    expect(shape['owner']).toEqual({
      kind: 'object',
      props: [
        { name: 'name', required: true, shape: { kind: 'string' } },
        { name: 'boss', required: true, shape: { kind: 'opaque' } },
        { name: 'nick', required: false, shape: { kind: 'string' } },
      ],
    });
    expect(sampleValue(shape['users']!)).toBe('[]');
  });

  it('no load, no fields', () => {
    const page = source('routes/about', 'get ping\n');
    expect(loadFields(page, createApiIndex([page]))).toBeUndefined();
  });
});
