/**
 * The default of a `<select>` the browser creates: the `selected` attribute of the `<option>` its
 * value picks, as the server paints it (SDD-85 §4.2, decision 42).
 *
 * Its own piece, and not a branch of `browserDom.setDefault`: the adapter travels with every page,
 * and a page with no `<select>` must not pay for one (SDD-34 §6.15). The compiler knows which
 * elements are a `<select>`, so only the chunk that creates one imports this.
 */

/**
 * Mark `selected` on the options whose value is `value`'s text, and take it off the rest. The
 * server's reading of the value: `false` and `null` pick none, `true` the empty value.
 */
export function selectDefault(el: Node, value: unknown): void {
  const text = value === false || value == null ? null : value === true ? '' : String(value);
  for (const option of (el as HTMLSelectElement).options) option.toggleAttribute('selected', option.value === (text ?? ''));
}
