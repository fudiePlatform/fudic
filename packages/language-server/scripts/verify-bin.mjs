/**
 * The built binary actually starts (SDD-24 §3.1).
 *
 * This exists because it did not. `src/cli.ts` imported `@volar/language-server/node`
 * without an extension: TypeScript accepts it under `moduleResolution: bundler` and emits it
 * verbatim, and Node's ESM resolver rejects it — that package has no `exports` map, so a
 * subpath is a file path and the file is `node.js`. Every one of the 344 tests passed,
 * because Vitest resolves like a bundler and none of them ever ran `dist/`.
 *
 * Note 5 of the task list called the spawn "smoke, not coverage", which was the right call;
 * what was missing is that nobody ever lit it. So it runs as part of `build`, not as a test:
 * the defect is in the build *output*, it cannot be reproduced from source, and a broken
 * artefact should not survive the command that produced it.
 *
 * Plain JavaScript on purpose: it is build tooling, so it is neither typechecked nor
 * measured, and it must run against the emitted `dist/` rather than the sources.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/fudic-language-server.js', import.meta.url));
const TIMEOUT_MS = 20_000;

const request = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    processId: null,
    rootUri: null,
    capabilities: {},
    // Deliberately empty: the degraded path is the one with the fewest dependencies, so a
    // failure here is about loading the server, never about the workspace it was given.
    initializationOptions: { typescript: { tsdk: '' } },
  },
});

const child = spawn(process.execPath, [BIN, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });

let stdout = '';
let stderr = '';
let settled = false;

const finish = (code, message) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  child.kill();
  if (code === 0) console.log(message);
  else {
    console.error(`fudic-language-server does not start: ${message}`);
    if (stderr !== '') console.error(stderr.split('\n').slice(0, 12).join('\n'));
  }
  process.exit(code);
};

const timer = setTimeout(() => finish(1, `no answer to initialize in ${TIMEOUT_MS} ms`), TIMEOUT_MS);

child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

child.stdout.on('data', (chunk) => {
  stdout += chunk;
  // The declared capabilities are the proof: the process not only loaded, it built the
  // server and answered the handshake.
  if (stdout.includes('semanticTokensProvider')) {
    finish(0, 'fudic-language-server starts and answers initialize.');
  }
});

child.on('error', (error) => finish(1, String(error)));
child.on('exit', (code) => finish(1, `exited with code ${String(code)} before answering`));

child.stdin.write(`Content-Length: ${Buffer.byteLength(request)}\r\n\r\n${request}`);
