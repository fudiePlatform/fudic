// Throwaway probe: Ctrl+K V stand-in. Spawns the workbench (../bank.mjs) and frames its shell in a
// webview. `server.mjs` beside this file is the earlier, smaller probe (webview + iframes + WS, no
// Vite): point the spawn at it to repeat that check alone.
const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
let child;
function open() {
  child = spawn('node', [path.join(__dirname, '..', 'bank.mjs'), path.join(__dirname, 'bank-live.json')], { stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdout.once('data', async buf => {
    const { url } = JSON.parse(buf.toString().split('\n')[0]);
    const tabs = 'C:/Users/Home/Documents/Cursos 2026/fudic/examples/basic/src/components/app-bench-tabs.fud';
    await vscode.window.showTextDocument(vscode.Uri.file(tabs), { viewColumn: vscode.ViewColumn.One, preview: false });
    const panel = vscode.window.createWebviewPanel('probe', 'Preview · workbench', vscode.ViewColumn.Beside, { enableScripts: true });
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:*; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>html,body{margin:0;height:100%}body{display:flex;flex-direction:column}iframe{flex:1;border:0;background:#fff}</style></head>
<body><div><button id="b">Open in browser</button> <code>${url}</code></div><iframe src="${url}"></iframe>
<script>const vs = acquireVsCodeApi(); document.getElementById('b').onclick = () => vs.postMessage('open');</script></body></html>`;
    panel.webview.onDidReceiveMessage(() => vscode.env.openExternal(vscode.Uri.parse(url)));
  });
}
exports.activate = ctx => {
  ctx.subscriptions.push(vscode.commands.registerCommand('probe.open', open));
  open();
};
exports.deactivate = () => child && child.stdin.end(); // the bank cleans up on stdin end
