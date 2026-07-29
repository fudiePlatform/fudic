#!/usr/bin/env node
/**
 * The `fudic` binary. Everything it does lives in `run()`; this file only maps its exit
 * code onto the process, so the CLI stays testable without spawning anything.
 */

import { run } from './run.js';

process.exitCode = await run(process.argv.slice(2));
