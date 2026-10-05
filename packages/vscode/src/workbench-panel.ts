/**
 * The workbench tab's page (SDD-32 §4.10): a bar with «Open in browser» and the URL in view,
 * and under it the workbench's shell in an iframe at full height. The shell is the same page the
 * browser button opens; the tab only frames it.
 *
 * The URL is the one the process printed, as is: local VS Code only (`127.0.0.1` is this
 * machine). The CSP allows exactly that origin in a frame and nothing else from outside.
 */

/** The message the bar's button posts; the adapter answers it with `openExternal`. */
export const OPEN_IN_BROWSER = 'openInBrowser';

/** `http://127.0.0.1:<port>` of the shell's URL. */
export function panelOrigin(url: string): string {
  return new URL(url).origin;
}

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function panelHtml(url: string): string {
  const csp = `default-src 'none'; frame-src ${panelOrigin(url)}; script-src 'unsafe-inline'; style-src 'unsafe-inline'`;
  const href = escape(url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; font: 12px system-ui, sans-serif;
  color: var(--vscode-foreground); background: var(--vscode-editor-background); }
.bar { display: flex; gap: 8px; align-items: center; padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border, transparent); }
button { font: inherit; padding: 3px 10px; border: 0; border-radius: 2px; cursor: pointer;
  color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
button:hover { background: var(--vscode-button-hoverBackground); }
code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8; }
iframe { flex: 1; width: 100%; border: 0; background: #fff; }
.stopped { padding: 6px 10px; color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<div class="bar"><button id="open">Open in browser</button><code>${href}</code></div>
<div class="stopped" id="stopped" hidden></div>
<iframe src="${href}" title="Workbench"></iframe>
<script>
const vscode = acquireVsCodeApi();
document.getElementById('open').addEventListener('click', () => vscode.postMessage('${OPEN_IN_BROWSER}'));
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'stopped') {
    const note = document.getElementById('stopped');
    note.textContent = event.data.message;
    note.hidden = false;
  }
});
</script>
</body>
</html>
`;
}
