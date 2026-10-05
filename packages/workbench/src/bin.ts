#!/usr/bin/env node
/**
 * The `fudic-workbench` binary. Everything it does lives in `main()`; this file only hands it
 * the process, so the workbench stays testable without spawning anything.
 */

import { main, processIo } from './cli.js';

await main(process.argv.slice(2), processIo());
