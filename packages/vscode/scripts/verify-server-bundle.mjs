/**
 * The BUNDLED server still loads the project's TypeScript.
 *
 * This exists because it did not, and nothing noticed. Volar's `loadTsdkByPath` reaches for the
 * project's TypeScript with `eval('require')` — "webpack compatibility", says its comment — and a
 * bundler cannot see inside a string. In the ESM bundle `require` was simply not defined, so the
 * load threw, the server degraded to HTML and CSS, and the extension installed, activated,
 * coloured the file and offered no types at all. Every test passed: they run from source, where
 * `require` exists, and none of them ever ran `dist/`.
 *
 * So the check is a real editor session against the real artefact: spawn `dist/server.mjs`, open
 * a `.fud` under the id **VS Code** registers it as, and ask for a completion that only exists if
 * TypeScript is alive — the `tone` prop of `app-badge`, which is a type, not a string in a table.
 *
 * Plain JavaScript, and part of `build` rather than a test, for the same reason as its siblings:
 * the defect lives in the build output and cannot be reproduced from the sources.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const TIMEOUT_MS = 60_000;
const SERVER = fileURLToPath(new URL('../dist/server.mjs', import.meta.url));
const WORKSPACE = fileURLToPath(new URL('../../language-server/fixtures', import.meta.url));
const DOCUMENT = join(WORKSPACE, 'blog', '[slug].fud');

/**
 * The id VS Code sends, not the one the server uses internally.
 *
 * `contributes.languages` calls it `fudic`; the server's own constant is `fud`. Driving this
 * check with the server's name would exercise a client nobody ships.
 */
const LANGUAGE_ID = 'fudic';

/** The project's TypeScript, resolved the way the client resolves it: from the workspace. */
const TSDK = dirname(
  createRequire(new URL('../../language-server/package.json', import.meta.url)).resolve(
    'typescript',
  ),
);

const child = spawn(process.execPath, [SERVER, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });

let seq = 0;
const pending = new Map();
const logs = [];
let stderr = '';
let settled = false;

const fail = (message) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  child.kill();
  console.error(`the bundled server does not work: ${message}`);
  for (const line of logs.slice(-8)) console.error(`  server log: ${line}`);
  if (stderr !== '') console.error(stderr.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
};

const timer = setTimeout(() => fail(`no answer in ${String(TIMEOUT_MS)} ms`), TIMEOUT_MS);

const send = (message) => {
  const body = JSON.stringify({ jsonrpc: '2.0', ...message });
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

const request = (method, params) => {
  const id = ++seq;
  send({ id, method, params });
  return new Promise((resolve) => pending.set(id, resolve));
};

let buffer = Buffer.alloc(0);
child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const header = buffer.indexOf('\r\n\r\n');
    if (header === -1) return;
    const length = Number(/Content-Length: (\d+)/.exec(buffer.subarray(0, header).toString())?.[1]);
    if (buffer.length < header + 4 + length) return;
    const message = JSON.parse(buffer.subarray(header + 4, header + 4 + length).toString());
    buffer = buffer.subarray(header + 4 + length);

    if (message.method === 'window/logMessage') logs.push(message.params.message);
    else if (message.id !== undefined && pending.has(message.id)) {
      const resolve = pending.get(message.id);
      pending.delete(message.id);
      resolve(message.result);
    } else if (message.id !== undefined) send({ id: message.id, result: null });
  }
});

child.stderr.on('data', (chunk) => {
  stderr += chunk;
});
child.on('error', (error) => fail(String(error)));
child.on('exit', (code) => fail(`exited with code ${String(code)} before answering`));

const workspaceUri = pathToFileURL(WORKSPACE).href;
await request('initialize', {
  processId: process.pid,
  rootUri: workspaceUri,
  workspaceFolders: [{ uri: workspaceUri, name: 'fixtures' }],
  capabilities: { textDocument: { completion: { completionItem: { snippetSupport: false } } } },
  initializationOptions: { typescript: { tsdk: TSDK }, fudic: { templateDiagnostics: true } },
});
send({ method: 'initialized', params: {} });

// The tag with no attribute yet: the position where an editor asks "what can I write here".
const source = readFileSync(DOCUMENT, 'utf8').replace(
  /<app-badge [^>]*>/,
  '<app-badge ></app-badge>',
);
const uri = pathToFileURL(DOCUMENT).href;
send({
  method: 'textDocument/didOpen',
  params: { textDocument: { uri, languageId: LANGUAGE_ID, version: 1, text: source } },
});

const lines = source.split('\n');
const line = lines.findIndex((text) => text.includes('<app-badge >'));
if (line === -1) fail('the fixture no longer contains an <app-badge> to complete inside');

const completion = await request('textDocument/completion', {
  textDocument: { uri },
  position: { line, character: lines[line].indexOf('<app-badge ') + '<app-badge '.length },
});

const labels = (completion?.items ?? completion ?? []).map((item) => item.label);
// `tone?` and not `tone`: TypeScript labels an optional property with its own `?`, which is the
// tell that this came from a type and not from a table of HTML attributes.
if (!labels.includes('tone?')) {
  fail(
    `TypeScript is not alive: <app-badge> offered ${String(labels.length)} completions and none was the declared prop`,
  );
}

/**
 * And that it is the PROJECT's TypeScript, which the completion above cannot prove on its own.
 *
 * Run from the repo, `dist/server.mjs` can resolve `typescript` by walking up into this package's
 * own `node_modules` — so the fallback answers, the completion looks right, and the failure is
 * invisible until the extension is installed somewhere that has no such tree. Reading the log is
 * what tells the two apart.
 */
const fallback = logs.find((message) =>
  /Cannot load the project TypeScript|Using the bundled TypeScript|degrad/i.test(message),
);
if (fallback !== undefined) fail(`the project TypeScript did not load: ${fallback}`);

settled = true;
clearTimeout(timer);
child.kill();
console.log(`bundled server verified: loads the project TypeScript and completes ${LANGUAGE_ID}.`);
process.exit(0);
