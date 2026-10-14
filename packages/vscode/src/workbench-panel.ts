/**
 * The workbench tab's page (SDD-32 §4.10, BUG-48 §4.9): a bar with «Open in browser» and the URL
 * in view, and under it the workbench's shell in an iframe at full height. The shell is the same
 * page the browser button opens; the tab only frames it, and relays between it and the editor:
 *
 * - the editor's theme goes down (`?theme=` at first, a `fudic:theme` message when it changes);
 * - the shell's «open this file at this line» comes up, and the editor opens it.
 *
 * The URL is the one the process printed: local VS Code only (`127.0.0.1` is this machine). The
 * CSP allows exactly that origin in a frame and nothing else from outside.
 */

/** The message the bar's button posts; the adapter answers it with `openExternal`. */
export const OPEN_IN_BROWSER = 'openInBrowser';

export type Theme = 'light' | 'dark';

/** VS Code's `ColorThemeKind`: 1 light, 2 dark, 3 high contrast, 4 high contrast light. */
export function themeOf(kind: number): Theme {
  return kind === 2 || kind === 3 ? 'dark' : 'light';
}

/** `http://127.0.0.1:<port>` of the shell's URL. */
export function panelOrigin(url: string): string {
  return new URL(url).origin;
}

/** The shell's URL inside the tab: it is in the editor, in the editor's theme. */
export function shellUrl(url: string, theme: Theme): string {
  const inside = new URL(url);
  inside.searchParams.set('host', 'vscode');
  inside.searchParams.set('theme', theme);
  return inside.toString();
}

/** What the tab's page can ask of the extension. */
export type PanelRequest =
  | { readonly type: 'openInBrowser' }
  | { readonly type: 'open'; readonly file: string; readonly line: number };

/** A message from the tab's page as a request, or undefined when it is not one. */
export function panelRequest(message: unknown): PanelRequest | undefined {
  if (message === OPEN_IN_BROWSER) return { type: 'openInBrowser' };
  const asked = message as { type?: unknown; file?: unknown; line?: unknown } | null;
  if (asked?.type === 'open' && typeof asked.file === 'string' && typeof asked.line === 'number') {
    return { type: 'open', file: asked.file, line: asked.line };
  }
  return undefined;
}

/** Answers a request with the editor's own hands. */
export function handlePanelRequest(
  message: unknown,
  editor: { openExternal(): void; openFile(file: string, line: number): void },
): void {
  const request = panelRequest(message);
  if (request?.type === 'openInBrowser') editor.openExternal();
  else if (request?.type === 'open') editor.openFile(request.file, Math.max(1, request.line));
}

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function panelHtml(url: string, theme: Theme = 'light'): string {
  const origin = panelOrigin(url);
  const csp = `default-src 'none'; frame-src ${origin}; script-src 'unsafe-inline'; style-src 'unsafe-inline'`;
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
iframe { flex: 1; width: 100%; border: 0; background: var(--vscode-editor-background); }
.stopped { padding: 6px 10px; color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<div class="bar"><button id="open">Open in browser</button><code>${href}</code></div>
<div class="stopped" id="stopped" hidden></div>
<iframe id="shell" src="${escape(shellUrl(url, theme))}" title="Workbench"></iframe>
<script>
const vscode = acquireVsCodeApi();
const shell = document.getElementById('shell');
document.getElementById('open').addEventListener('click', () => vscode.postMessage('${OPEN_IN_BROWSER}'));
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (event.origin === '${origin}' && data.type === 'fudic:open') {
    vscode.postMessage({ type: 'open', file: data.file, line: data.line });
  } else if (data.type === 'stopped') {
    const note = document.getElementById('stopped');
    note.textContent = data.message;
    note.hidden = false;
  } else if (data.type === 'theme') {
    shell.contentWindow.postMessage({ type: 'fudic:theme', theme: data.theme }, '${origin}');
  }
});
</script>
</body>
</html>
`;
}
