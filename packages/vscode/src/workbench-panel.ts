/**
 * The workbench tab's page (SDD-32 §4.10, BUG-48 §4.9): the workbench's shell in an iframe at full
 * height. The shell is the same page the browser opens; the tab only frames it, and relays between
 * it and the editor:
 *
 * - the editor's theme goes down (`?theme=` at first, a `fudic:theme` message when it changes);
 * - the shell's «open this file at this line», «light this line» and «open in browser» come up,
 *   and the editor does them.
 *
 * The URL is the one the process printed: local VS Code only (`127.0.0.1` is this machine). The
 * CSP allows exactly that origin in a frame and nothing else from outside.
 */

/** The message «open in browser» arrives as; the adapter answers it with `openExternal`. */
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
  | { readonly type: 'open'; readonly file: string; readonly line: number }
  | { readonly type: 'hover'; readonly file: string; readonly line: number | null };

/** A message from the tab's page as a request, or undefined when it is not one. */
export function panelRequest(message: unknown): PanelRequest | undefined {
  if (message === OPEN_IN_BROWSER) return { type: 'openInBrowser' };
  const asked = message as { type?: unknown; file?: unknown; line?: unknown } | null;
  if (asked?.type === 'open' && typeof asked.file === 'string' && typeof asked.line === 'number') {
    return { type: 'open', file: asked.file, line: asked.line };
  }
  if (asked?.type === 'hover' && typeof asked.file === 'string' && (asked.line === null || typeof asked.line === 'number')) {
    return { type: 'hover', file: asked.file, line: asked.line };
  }
  return undefined;
}

/** What the editor does for the tab: open a URL outside, open a file, light a line. */
export interface PanelEditor {
  openExternal(): void;
  openFile(file: string, line: number): void;
  /** Lights the 1-based `line` of `file` in the editors that show it; null puts it out. */
  highlight(file: string, line: number | null): void;
}

/** Answers a request with the editor's own hands. */
export function handlePanelRequest(message: unknown, editor: PanelEditor): void {
  const request = panelRequest(message);
  if (request?.type === 'openInBrowser') editor.openExternal();
  else if (request?.type === 'open') editor.openFile(request.file, Math.max(1, request.line));
  else if (request?.type === 'hover') editor.highlight(request.file, request.line === null ? null : Math.max(1, request.line));
}

const escape = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * The tab before its process answers: a spinner and «Starting workbench…», so the click shows
 * something at once. A `stopped` message replaces it with why it did not come up.
 */
export function startingHtml(): string {
  const csp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
html, body { margin: 0; height: 100%; }
body { display: flex; align-items: center; justify-content: center; gap: 10px; font: 13px system-ui, sans-serif;
  color: var(--vscode-foreground); background: var(--vscode-editor-background); }
.spinner { width: 14px; height: 14px; border: 2px solid var(--vscode-foreground); border-right-color: transparent;
  border-radius: 50%; opacity: 0.7; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.stopped { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<span class="spinner" id="spinner"></span><span id="status">Starting workbench…</span>
<script>
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'stopped') return;
  document.getElementById('spinner').remove();
  const status = document.getElementById('status');
  status.className = 'stopped';
  status.textContent = data.message;
});
</script>
</body>
</html>
`;
}

export function panelHtml(url: string, theme: Theme = 'light'): string {
  const origin = panelOrigin(url);
  const csp = `default-src 'none'; frame-src ${origin}; script-src 'unsafe-inline'; style-src 'unsafe-inline'`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; font: 12px system-ui, sans-serif;
  color: var(--vscode-foreground); background: var(--vscode-editor-background); }
iframe { flex: 1; width: 100%; border: 0; background: var(--vscode-editor-background); }
.stopped { padding: 6px 10px; color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<div class="stopped" id="stopped" hidden></div>
<iframe id="shell" src="${escape(shellUrl(url, theme))}" title="Workbench"></iframe>
<script>
const vscode = acquireVsCodeApi();
const shell = document.getElementById('shell');
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (event.origin === '${origin}' && data.type === 'fudic:open') {
    vscode.postMessage({ type: 'open', file: data.file, line: data.line });
  } else if (event.origin === '${origin}' && data.type === 'fudic:hover') {
    vscode.postMessage({ type: 'hover', file: data.file, line: data.line });
  } else if (event.origin === '${origin}' && data.type === 'fudic:openInBrowser') {
    vscode.postMessage('${OPEN_IN_BROWSER}');
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
