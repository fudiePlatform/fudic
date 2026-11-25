// What the editor shows for a file: its diagnostics and the code actions (the light bulb) on the
// first one, asked to the Fudic language server over LSP.
// Usage: node lsp.mjs <path to fudic-language-server.js> <project folder> <file>
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [server, root, file] = process.argv.slice(2);
const p = spawn(process.execPath, [server, '--stdio'], { cwd: root });
let buf = Buffer.alloc(0), id = 0; const waits = new Map();
const send = (m) => { const s = JSON.stringify({ jsonrpc: '2.0', ...m }); p.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); };
const req = (method, params) => new Promise((r) => { const i = ++id; waits.set(i, r); send({ id: i, method, params }); });
let onDiag;
p.stdout.on('data', (d) => { buf = Buffer.concat([buf, d]); for (;;) { const h = buf.indexOf('\r\n\r\n'); if (h < 0) return; const len = +/Content-Length: (\d+)/.exec(buf.slice(0, h).toString())[1]; if (buf.length < h + 4 + len) return; const m = JSON.parse(buf.slice(h + 4, h + 4 + len)); buf = buf.slice(h + 4 + len);
  if (m.id !== undefined && waits.has(m.id)) { waits.get(m.id)(m.result); waits.delete(m.id); }
  else if (m.id !== undefined && m.method) send({ id: m.id, result: m.method === 'workspace/configuration' ? (m.params.items || []).map(() => null) : null });
  if (m.method === 'textDocument/publishDiagnostics' && decodeURIComponent(m.params.uri).toLowerCase() === decodeURIComponent(uri).toLowerCase() && m.params.diagnostics.length && onDiag) onDiag(m.params.diagnostics); } });
const uri = pathToFileURL(file).href;
await req('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: { textDocument: { codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', ''] } } } } }, workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'app' }] });
send({ method: 'initialized', params: {} });
const diags = new Promise((r) => { onDiag = r; });
send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'fud', version: 1, text: readFileSync(file, 'utf8') } } });
const ds = await Promise.race([diags, new Promise((r) => setTimeout(() => r([]), 30000))]);
for (const d of ds) console.log('DIAG', d.code, d.severity, JSON.stringify(d.range), d.message);
if (ds[0]) { const acts = await req('textDocument/codeAction', { textDocument: { uri }, range: ds[0].range, context: { diagnostics: ds } }); for (const a of acts || []) console.log('ACTION', a.kind, '|', a.title, a.edit ? JSON.stringify(a.edit).slice(0, 300) : ''); }
p.kill(); process.exit(0);
