/**
 * Entry of the `http/bin` piece: the binary format, which a function speaks unless its chain says
 * `use json`, and the reader of the data frames a `load` answers with, which are binary too. A
 * page whose functions all speak JSON, and that has no `load`, never downloads it.
 */
export { binWire, BIN_TYPE, BIN_PROBLEM_TYPE } from '../src/wire/bin.js';
export { readFrames } from '../src/wire/frames.js';
