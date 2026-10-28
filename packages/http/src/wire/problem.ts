/**
 * A problem as a level of `fud-bin` (SDD-67 §3.1): its fields in this order, the validators'
 * values in `errors` and `summary` as `any`.
 */

import type { Ty } from './ty.js';

const ERRORS: Ty = { map: ['str', 'any'] };

export const PROBLEM: Ty = {
  fields: () => ({
    status: 'u16',
    title: 'str',
    detail: { opt: 'str' },
    location: { opt: 'str' },
    errors: { opt: { map: ['str', ERRORS] } },
    summary: { opt: ERRORS },
  }),
};
