// WRITTEN BY THE DEVELOPER. The browser half of `rule nif`.

import type { Nif } from '../generated/shared';

const LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const SHAPE = /^[XYZxyz0-9][0-9]{7}[A-Za-z]$/;

export default ((value) => {
  if (!SHAPE.test(value)) return false;
  const v = value.toUpperCase();
  const lead = 'XYZ'.indexOf(v.charAt(0)); // NIE: X → 0, Y → 1, Z → 2
  const number = Number((lead === -1 ? v.charAt(0) : String(lead)) + v.slice(1, 8));
  return LETTERS.charAt(number % 23) === v.charAt(8);
}) satisfies Nif;
