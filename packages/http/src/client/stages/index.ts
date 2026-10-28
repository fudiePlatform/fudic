/**
 * The upload pipeline of every call (SDD-67 §3.6): the body in the function's format, then
 * compressed when the chain asks for it.
 */

import type { Stage } from '../pipeline.js';
import { compress } from './compress.js';
import { encode } from './encode.js';

export const STAGES: readonly Stage[] = [encode, compress];
