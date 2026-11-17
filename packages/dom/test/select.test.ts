import { describe, expect, it } from 'vitest';

import { selectDefault } from '../src/index.js';

describe('selectDefault (SDD-85 decision 42)', () => {
  it('marks the option the value picks, and only that one, inside a group too', () => {
    const select = document.createElement('select');
    select.innerHTML = '<option value="a" selected>A</option><optgroup><option>b</option></optgroup>';
    selectDefault(select, 'b');
    const [a, b] = [...select.options];
    expect(a!.hasAttribute('selected')).toBe(false);
    expect(b!.hasAttribute('selected')).toBe(true);
    expect(select.value).toBe('b');
  });

  it('reads the value as the server does: `false` and `null` pick none, `true` the empty one', () => {
    const select = document.createElement('select');
    select.innerHTML = '<option value="">—</option><option value="1">1</option>';
    const picked = (): string[] => [...select.options].filter((o) => o.hasAttribute('selected')).map((o) => o.value);
    selectDefault(select, 1);
    expect(picked()).toEqual(['1']);
    selectDefault(select, true);
    expect(picked()).toEqual(['']);
    selectDefault(select, false);
    expect(picked()).toEqual(['']);
    selectDefault(select, null);
    expect(picked()).toEqual(['']);
    select.innerHTML = '<option value="a">A</option>';
    selectDefault(select, undefined); // no option has the empty value
    expect(select.querySelector('[selected]')).toBeNull();
  });
});
