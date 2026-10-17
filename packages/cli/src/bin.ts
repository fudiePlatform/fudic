#!/usr/bin/env node
/**
 * The `fudic` binary. Everything it does lives in `run()`; this file only maps its exit
 * code onto the process, so the CLI stays testable without spawning anything.
 */

import { run } from './run.js';

// Whoever reads the output may stop reading — `fudic --help | head` —, and that is not an error
// of the CLI: no stack trace for a closed pipe.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

process.exitCode = await run(process.argv.slice(2));
