/**
 * The order line of `docs/forms/typed-binary.mjs` §2, written with the typed
 * factories. It is the fixture that shows a WHOLE schema declared with widths,
 * without ceremony, and that its ranges validate.
 *
 * Nothing binary is measured here: the encoder is transport's. What this pins is
 * that the declaration exists first, so adopting a binary wire later does not mean
 * rewriting every schema already written.
 */

import { group } from '../../src/group.js';
import { arr } from '../../src/typed/arr.js';
import { bool } from '../../src/typed/bool.js';
import { date } from '../../src/typed/date.js';
import { str } from '../../src/typed/str.js';
import { u16 } from '../../src/typed/u16.js';
import { u32 } from '../../src/typed/u32.js';
import { u8 } from '../../src/typed/u8.js';
import { min } from '../../src/validators/min.js';
import { required } from '../../src/validators/required.js';

/**
 * The tax block travels as its own object in the API, so it is a `group`: the
 * shape of what is sent has to survive the model, not be flattened into it.
 */
const tax = group({
  pct: u8(21),
  included: bool(true),
});

export const orderLine = {
  itemId: u32(0, [required]),
  qty: u16(1, [min(1)]),
  priceCts: u32(0),
  tax,
  discount: u8(0),
  takeaway: bool(false),
  invited: bool(false),
  printed: bool(false),
  table: u16(0),
  at: date(),
  note: str(''),
  tags: arr(str, []),
};
