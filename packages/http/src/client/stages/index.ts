/**
 * The two pipelines a stub can be given (SDD-56 §4.17). A function with `.form` gets the four
 * stages; one without gets `json` and `compress`, so it never downloads the binary format.
 */

import type { Stage } from '../pipeline.js';
import { binary } from './binary.js';
import { compress } from './compress.js';
import { json } from './json.js';
import { positional } from './positional.js';

export const KEYED_STAGES: readonly Stage[] = [json, compress];

export const FORM_STAGES: readonly Stage[] = [positional, binary, json, compress];
