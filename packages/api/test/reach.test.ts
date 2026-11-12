/**
 * SDD-82 §3.4, §8.2.7 — what a route or a flow can call: one answer for the route's `Calls`, the
 * editor and the project check.
 */

import { describe, expect, it } from 'vitest';
import { createApiIndex, projectCallables, routeCallables } from '../src/index.js';
import { app } from './project.js';

const ROUTE = app('routes/blog/[slug]', 'post like\n  n  i32\n\nput save\n  form perfil\n  id  i32\n\nget search\n  q  str\n');
const LISTA = app('components/lista', 'delete remove\n  id  i32\n\nget search\n  text  str\n');
const FORMS = app('forms/perfil', 'form perfil\n  name  str\n  datos  group\n    edad  u8\n');
const RULES = app('rules/alias', 'rule alias-taken\n  runs remote\n  on str\n  fails alias-taken\n\nrule local\n  on str\n  fails nope\n');
const INDEX = createApiIndex([ROUTE, LISTA, FORMS, RULES]);

const shape = (all: ReturnType<typeof routeCallables>) => all.map((c) => [c.name, c.args, c.path]);

describe('routeCallables', () => {
  it('reaches its functions with its params, those of its components, then the remote rules; the first name wins', () => {
    expect(shape(routeCallables(INDEX, { source: ROUTE, components: ['components/lista', 'components/none'], params: ['slug'] }))).toEqual([
      ['like', ['slug', 'n'], ROUTE.path],
      // A function with a form is called with the form's top-level fields.
      ['save', ['slug', 'id', 'name', 'datos'], ROUTE.path],
      ['search', ['slug', 'q'], ROUTE.path],
      ['remove', ['id'], LISTA.path],
      ['alias-taken', ['value', 'params'], RULES.path],
    ]);
  });

  it('carries the declaration and the span of its name', () => {
    const [like] = routeCallables(INDEX, { source: ROUTE, components: [], params: [] });
    expect(like?.decl.kind).toBe('fn');
    expect(ROUTE.file.declarations[0]).toMatchObject({ name: { span: like?.span } });
  });

  it('without a .fudapi of its own, reaches its components and the rules', () => {
    expect(routeCallables(INDEX, { components: ['components/lista'], params: [] }).map((c) => c.name)).toEqual(['remove', 'search', 'alias-taken']);
  });

  it('leaves out the fields of a form the project does not declare', () => {
    const lone = app('routes/x', 'put save\n  form nadie\n  id  i32\n');
    expect(routeCallables(createApiIndex([lone]), { source: lone, components: [], params: [] })[0]?.args).toEqual(['id']);
  });
});

describe('projectCallables', () => {
  it('reaches every function of the project and the remote rules', () => {
    expect(projectCallables(INDEX).map((c) => c.name)).toEqual(['like', 'save', 'search', 'remove', 'alias-taken']);
  });
});
