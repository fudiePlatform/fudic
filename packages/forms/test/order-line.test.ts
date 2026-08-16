/**
 * A whole schema declared with widths — the numeric fixture of the prototype.
 *
 * It is the shape a point of sale sends all day, and the reason the typed
 * factories are in the model rather than in transport: these ranges are worth
 * having with JSON on the wire.
 */

import { describe, expect, it } from 'vitest';
import { form } from '../src/form.js';
import { orderLine } from './fixtures/order-line.js';

const line = () => form(orderLine);

describe('the order line', () => {
  it('starts on its declared defaults', () => {
    const f = line();
    expect(f.$value()).toEqual({
      itemId: 0,
      qty: 1,
      priceCts: 0,
      tax: { pct: 21, included: true },
      discount: 0,
      takeaway: false,
      invited: false,
      printed: false,
      table: 0,
      at: null,
      note: '',
      tags: [],
    });
    expect(f.$fields()).toHaveLength(12);
  });

  it('validates a well-formed line', async () => {
    const f = line();
    f.$patch({ itemId: 918_233, qty: 3, priceCts: 1_450, table: 7, tags: ['sin gluten'] });

    expect(await f.$validate()).toBe(true);
  });

  it('refuses a percentage that does not fit a byte, by range and not by truncation', async () => {
    const f = line();
    f.$patch({ tax: { pct: 300 } });

    expect(await f.$validate()).toBe(false);
    expect(f.tax.pct.errors()).toEqual({ range: 'u8' });
    expect(f.$errors()).toEqual({ 'tax.pct': { range: 'u8' } });
    // The value is still what was written: nothing was silently narrowed.
    expect(f.tax.pct()).toBe(300);
    // And the sibling inside the group was not touched by the patch.
    expect(f.tax.included()).toBe(true);
  });

  it('refuses a quantity below its business minimum', async () => {
    const f = line();
    f.$patch({ qty: 0 });

    expect(await f.$validate()).toBe(false);
    expect(f.qty.errors()).toEqual({ min: 1 });
  });

  it('keeps every instance independent', () => {
    const a = line();
    const b = line();
    a.qty.set(9);

    expect(b.qty()).toBe(1);
  });
});
