/**
 * The workbench tab's page (SDD-32 §4.10, BUG-48 §4.9): it frames the shell in the editor's theme,
 * shows the URL in its bar, lets in exactly that origin, and relays between the shell and the
 * editor. The relay script runs here against a stand-in for the webview's window.
 */

import { describe, expect, it } from 'vitest';
import {
  handlePanelRequest,
  OPEN_IN_BROWSER,
  panelHtml,
  panelOrigin,
  panelRequest,
  shellUrl,
  themeOf,
} from '../src/workbench-panel.js';

const URL_LINE = 'http://127.0.0.1:53411/__bench/app-card/';
const ORIGIN = 'http://127.0.0.1:53411';

const csp = (html: string): string => /http-equiv="Content-Security-Policy" content="([^"]*)"/u.exec(html)![1]!;

/** Runs the page's script with a window, a document and the VS Code API it talks to, all recorded. */
function relay(html: string) {
  const script = /<script>([\s\S]*)<\/script>/u.exec(html)![1]!;
  const toEditor: unknown[] = [];
  const toShell: [unknown, string][] = [];
  const listeners: ((event: { origin: string; data: unknown }) => void)[] = [];
  const clicks: (() => void)[] = [];
  const stopped = { textContent: '', hidden: true };
  const elements: Record<string, unknown> = {
    shell: { contentWindow: { postMessage: (data: unknown, origin: string) => toShell.push([data, origin]) } },
    open: { addEventListener: (_type: string, listener: () => void) => clicks.push(listener) },
    stopped,
  };
  const window = { addEventListener: (_type: string, listener: (typeof listeners)[number]) => listeners.push(listener) };
  const document = { getElementById: (id: string) => elements[id] };
  const acquireVsCodeApi = () => ({ postMessage: (message: unknown) => toEditor.push(message) });
  new Function('window', 'document', 'acquireVsCodeApi', script)(window, document, acquireVsCodeApi);
  return {
    toEditor,
    toShell,
    stopped,
    click: () => clicks.forEach((c) => c()),
    message: (origin: string, data: unknown) => listeners.forEach((l) => l({ origin, data })),
  };
}

describe('the theme', () => {
  it('is dark for dark and high contrast, light for light and high contrast light', () => {
    expect([1, 2, 3, 4].map(themeOf)).toEqual(['light', 'dark', 'dark', 'light']);
  });

  it('goes into the shell\'s URL with the host, keeping its path', () => {
    expect(shellUrl(URL_LINE, 'dark')).toBe(`${URL_LINE}?host=vscode&theme=dark`);
    expect(shellUrl(`${URL_LINE}?theme=light`, 'dark')).toBe(`${URL_LINE}?theme=dark&host=vscode`);
  });
});

describe('panelHtml', () => {
  it('frames the shell in the editor\'s theme, and shows its URL in the bar', () => {
    const html = panelHtml(URL_LINE, 'dark');
    expect(html).toContain(`<iframe id="shell" src="${URL_LINE}?host=vscode&amp;theme=dark" title="Workbench"></iframe>`);
    expect(html).toContain(`<code>${URL_LINE}</code>`);
    expect(html).toContain('<button id="open">Open in browser</button>');
    expect(panelHtml(URL_LINE)).toContain('theme=light');
  });

  it('allows exactly that origin in a frame, and nothing else from outside', () => {
    expect(panelOrigin(URL_LINE)).toBe(ORIGIN);
    expect(csp(panelHtml(URL_LINE))).toBe(
      `default-src 'none'; frame-src ${ORIGIN}; script-src 'unsafe-inline'; style-src 'unsafe-inline'`,
    );
  });

  it('escapes what it writes into the page', () => {
    const html = panelHtml('http://127.0.0.1:1/__bench/?a="b"&c=<d>');
    expect(html).toContain('<code>http://127.0.0.1:1/__bench/?a=&quot;b&quot;&amp;c=&lt;d&gt;</code>');
    expect(html).not.toContain('<d>');
  });
});

describe('the relay — criterion 14', () => {
  it('the button asks the editor to open the shell in the browser', () => {
    const r = relay(panelHtml(URL_LINE));
    r.click();
    expect(r.toEditor).toEqual([OPEN_IN_BROWSER]);
  });

  it('a file the shell asks for goes to the editor, only from the shell\'s origin', () => {
    const r = relay(panelHtml(URL_LINE));
    r.message(ORIGIN, { type: 'fudic:open', file: 'C:/p/app-card.fudspec', line: 3 });
    r.message('http://evil.example', { type: 'fudic:open', file: 'C:/secret', line: 1 });
    r.message(ORIGIN, null);
    expect(r.toEditor).toEqual([{ type: 'open', file: 'C:/p/app-card.fudspec', line: 3 }]);
  });

  it('a theme change goes down to the shell, to its origin', () => {
    const r = relay(panelHtml(URL_LINE));
    r.message('vscode-webview://x', { type: 'theme', theme: 'dark' });
    expect(r.toShell).toEqual([[{ type: 'fudic:theme', theme: 'dark' }, ORIGIN]]);
  });

  it('says the process stopped, as text', () => {
    const r = relay(panelHtml(URL_LINE));
    r.message('vscode-webview://x', { type: 'stopped', message: '<b>The workbench stopped.</b>' });
    expect(r.stopped).toEqual({ textContent: '<b>The workbench stopped.</b>', hidden: false });
    r.message('vscode-webview://x', { type: 'other' });
    expect(r.toEditor).toEqual([]);
  });
});

describe('panelRequest and handlePanelRequest', () => {
  it('reads the two requests and nothing else', () => {
    expect(panelRequest(OPEN_IN_BROWSER)).toEqual({ type: 'openInBrowser' });
    expect(panelRequest({ type: 'open', file: 'C:/a.fud', line: 4 })).toEqual({ type: 'open', file: 'C:/a.fud', line: 4 });
    for (const message of [null, 'other', { type: 'open', file: 1, line: 1 }, { type: 'open', file: 'a', line: '1' }, { type: 'x' }]) {
      expect(panelRequest(message)).toBeUndefined();
    }
  });

  it('answers each with the editor, a line below 1 at the first one', () => {
    const done: unknown[] = [];
    const editor = { openExternal: () => void done.push('external'), openFile: (file: string, line: number) => void done.push([file, line]) };
    handlePanelRequest(OPEN_IN_BROWSER, editor);
    handlePanelRequest({ type: 'open', file: 'C:/a.fud', line: 0 }, editor);
    handlePanelRequest({ type: 'open', file: 'C:/a.fud', line: 7 }, editor);
    handlePanelRequest('noise', editor);
    expect(done).toEqual(['external', ['C:/a.fud', 1], ['C:/a.fud', 7]]);
  });
});
