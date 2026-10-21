/**
 * The corners of the emitter the canonicals do not reach: rules on any type or on a form,
 * middlewares with one half, lists, `when`, `require … on`, and a layout without `load`.
 */

import { createApiIndex, type ApiIndex, type ApiSource } from '../../src/index.js';
import { app, BUILT_INS } from '../project.js';

export const EXTENSIONS = [
  'rule any-value',
  '  on field *',
  '  runs both',
  '  fails bad-value',
  '',
  'rule any-list',
  '  on field *[]',
  '  runs both',
  '  fails bad-list',
  '',
  'rule whole',
  '  on form',
  '  runs both',
  '  fails whole',
  '',
  'rule dated',
  '  on field date str[]',
  '  runs both',
  '  fails dated',
  '',
  'middleware tagger',
  '  client',
  '  tags  str[]',
  '  limit  u8?',
  '',
  'middleware stamp',
  '  server',
  '  adds',
  '    who  str',
  '',
].join('\n');

export const SHOP = [
  'form shop',
  '  validate-on submit',
  '  validity rules',
  '  tags  str[] = []',
  '    any-list',
  '    min-length 1  "Al menos {n}."',
  '  day  date = "2026-01-01"',
  '    dated',
  '  since  date',
  '  qty  i32',
  '    range  "Entre {min} y {max}."',
  '    validate-on input',
  '    validity interacted',
  '    any-value',
  '  price  f64',
  '    range  "Un precio: {min}{max}."',
  '  id  uuid',
  '    range  "No es un identificador."',
  '  sure  bool',
  '  box  group',
  '    validate-on blur',
  '    validity rules',
  '    a  i32',
  '      required',
  '    b  i32',
  '    summary',
  '      require ordered  a < b  "a va antes que b"  on b',
  '      when valid a',
  '        require positive  a > 0',
  '  summary',
  '    whole',
  '    require some  not (empty tags and length tags == 0)  "Algo."',
  '    require sized  qty <= 10 or qty >= 100 and qty > 5 or 1 >= qty',
  '    require named  box.a != 3 and "x" == "x" and sure == true',
  '    require later  since > day  on since',
  '    require nope',
  '',
  'get list',
  '  use tagger',
  '    tags  a b',
  '  use tagger',
  '    tags  []',
  '    limit  3',
  '  use stamp',
  '  use ghost',
  '  skip ghost',
  '  -> str?',
  '',
  'post buy',
  '  form missing',
  '',
  'post order',
  '  form shop',
  '  -> map u8 str',
  '',
  'paths',
  '',
  'layout',
  '',
].join('\n');

/** An extensions file that also declares a contract piece: wrong, but the emitter must not care. */
export const MIXED = ['middleware here', '  server', '  adds', '    n  i32', '', 'get f', '  use here', ''].join('\n');

/** What the validator rejects and the emitter still has to write without throwing. */
export const SLOPPY = [
  'form sloppy',
  '  validate-on blur later',
  '  note  str?',
  '  pick  str[]',
  '  word  str',
  '    requird',
  '    min-length',
  '    pattern nope-pattern',
  '    pattern 5  "t"',
  '  plain  group',
  '    x  str',
  '',
  'load',
  '  fails gone 410',
  '',
  'get odd',
  '  use ghost',
  '  compress gzip',
  '  thing  Nope',
  '  grid  str[][]',
  '  loose  map str str?',
  '  -> Nope',
  '',
].join('\n');

export interface Cases {
  readonly index: ApiIndex;
  readonly extensions: ApiSource;
  readonly shop: ApiSource;
  readonly mixed: ApiSource;
  readonly sloppy: ApiSource;
}

export function cases(): Cases {
  const extensions = app('ext/rules', EXTENSIONS);
  const shop = app('routes/shop', SHOP);
  const mixed = app('mixed/here', MIXED);
  const sloppy = app('routes/sloppy', SLOPPY);
  return { index: createApiIndex([...BUILT_INS, extensions, shop, mixed, sloppy]), extensions, shop, mixed, sloppy };
}
