/**
 * The workbench tab's page (SDD-32 §4.10, criterion 26): it frames the URL of the JSON line,
 * shows it in its bar, and its CSP lets in exactly that origin.
 */

import { describe, expect, it } from 'vitest';
import { OPEN_IN_BROWSER, panelHtml, panelOrigin } from '../src/workbench-panel.js';

const URL_LINE = 'http://127.0.0.1:53411/__bench/';

const csp = (html: string): string => /http-equiv="Content-Security-Policy" content="([^"]*)"/u.exec(html)![1]!;

describe('panelOrigin', () => {
  it('is the scheme, host and port of the shell', () => {
    expect(panelOrigin(URL_LINE)).toBe('http://127.0.0.1:53411');
  });
});

describe('panelHtml — criterion 26', () => {
  it('frames the URL of the JSON line and shows it in the bar', () => {
    const html = panelHtml(URL_LINE);
    expect(html).toContain(`<iframe src="${URL_LINE}" title="Workbench"></iframe>`);
    expect(html).toContain(`<code>${URL_LINE}</code>`);
    expect(html).toContain('<button id="open">Open in browser</button>');
  });

  it('allows exactly that origin in a frame, and nothing else from outside', () => {
    expect(csp(panelHtml(URL_LINE))).toBe(
      "default-src 'none'; frame-src http://127.0.0.1:53411; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    );
  });

  it('posts the one message the adapter answers with openExternal', () => {
    expect(panelHtml(URL_LINE)).toContain(`vscode.postMessage('${OPEN_IN_BROWSER}')`);
    expect(OPEN_IN_BROWSER).toBe('openInBrowser');
  });

  it('escapes what it writes into the page', () => {
    const html = panelHtml('http://127.0.0.1:1/__bench/?a="b"&c=<d>');
    expect(html).toContain('src="http://127.0.0.1:1/__bench/?a=&quot;b&quot;&amp;c=&lt;d&gt;"');
    expect(html).not.toContain('<d>');
  });

  it('can say the process stopped, as text', () => {
    const html = panelHtml(URL_LINE);
    expect(html).toContain('<div class="stopped" id="stopped" hidden></div>');
    expect(html).toContain("event.data.type === 'stopped'");
    expect(html).toContain('note.textContent = event.data.message');
  });
});
