/**
 * The shell: the workbench's own page, the same in the VS Code tab and in the browser. It paints
 * what the socket says — a strip of diagnostics, one card per criterion with its steps, verdict,
 * evidence and a live iframe of the criterion's page — and holds no state the server lacks.
 *
 * Its script is the page's code, carried as text. Everything it paints goes in by `textContent`:
 * evidence is whatever a term returned, and none of it is markup.
 */

const STYLE = `
:root { color-scheme: light dark; --ink: #1d1d1f; --soft: #6e6e73; --line: #d2d2d7; --bg: #fff;
  --card: #fafafa; --pass: #1e7e34; --fail: #c0392b; --run: #8e8e93; --warn: #b26a00; }
@media (prefers-color-scheme: dark) { :root { --ink: #f5f5f7; --soft: #a1a1a6; --line: #3a3a3c;
  --bg: #1c1c1e; --card: #242426; --pass: #4cd964; --fail: #ff6b5b; --run: #8e8e93; --warn: #ffb340; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px 16px; font: 13px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--bg); }
header { display: flex; gap: 8px; align-items: baseline; margin-bottom: 10px; }
header h1 { margin: 0; font-size: 15px; font-weight: 600; }
header .state { color: var(--soft); }
#diagnostics:empty, #problem:empty { display: none; }
#diagnostics, #problem { margin: 0 0 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; }
#diagnostics li { list-style: none; } #diagnostics ul { margin: 0; padding: 0; }
.error { color: var(--fail); } .warning { color: var(--warn); }
.card { margin: 0 0 12px; padding: 10px; border: 1px solid var(--line); border-left: 4px solid var(--run);
  border-radius: 6px; background: var(--card); }
.card[data-verdict="pass"] { border-left-color: var(--pass); }
.card[data-verdict="fail"], .card[data-verdict="error"] { border-left-color: var(--fail); }
.card h2 { display: flex; justify-content: space-between; margin: 0 0 6px; font-size: 13px; font-weight: 600; }
.card .verdict { font-weight: 500; color: var(--soft); }
.card[data-verdict="pass"] .verdict { color: var(--pass); }
.card[data-verdict="fail"] .verdict, .card[data-verdict="error"] .verdict { color: var(--fail); }
.steps { margin: 0 0 8px; padding: 0; list-style: none; }
.steps li { padding: 1px 0; overflow-wrap: anywhere; }
.steps .block { display: inline-block; min-width: 3.4em; color: var(--soft); }
.steps .evidence { color: var(--soft); }
.steps .bad { color: var(--fail); }
.note { margin: 0 0 8px; color: var(--fail); overflow-wrap: anywhere; }
iframe { display: block; width: 100%; height: 180px; border: 1px dashed var(--line); border-radius: 4px; background: #fff; }
`;

const SCRIPT = `
const $ = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const list = document.getElementById('criteria');
const strip = document.getElementById('diagnostics');
const problem = document.getElementById('problem');
const state = document.getElementById('state');
const title = document.getElementById('title');
const cards = new Map();

function session(m) {
  title.textContent = m.tag;
  document.title = 'Workbench · ' + m.tag;
  strip.replaceChildren();
  if (m.diagnostics.length > 0) {
    const ul = $('ul');
    for (const d of m.diagnostics) {
      const where = d.file === null ? '' : ' — ' + d.file + (d.line === null ? '' : ':' + d.line + ':' + d.column);
      ul.append($('li', d.severity, d.code + ' ' + d.message + where));
    }
    strip.append(ul);
  }
  list.replaceChildren();
  cards.clear();
  for (const c of m.criteria) {
    const card = $('section', 'card');
    card.dataset.verdict = 'running';
    const h = $('h2', '', c.id);
    const verdict = $('span', 'verdict', 'waiting');
    h.append(verdict);
    const steps = $('ol', 'steps');
    const lines = c.steps.map((s) => {
      const li = $('li');
      li.append($('span', 'block', s.block), $('span', 'text', s.text), $('span', 'evidence'));
      steps.append(li);
      return li;
    });
    const note = $('p', 'note');
    note.hidden = true;
    const frame = $('iframe');
    frame.src = c.route;
    frame.title = c.id;
    card.append(h, steps, note, frame);
    list.append(card);
    cards.set(c.id, { card, verdict, lines, note, frame });
  }
}

function running(m) {
  for (const id of m.ids) {
    const c = cards.get(id);
    if (!c) continue;
    c.card.dataset.verdict = 'running';
    c.verdict.textContent = 'running…';
  }
}

function evidenceText(s) {
  if ('error' in s) return ' → ' + s.error;
  return ' → ' + (typeof s.evidence === 'string' ? s.evidence : JSON.stringify(s.evidence));
}

function result(m) {
  const c = cards.get(m.id);
  if (!c) return;
  c.card.dataset.verdict = m.verdict;
  c.verdict.textContent = m.verdict + ' · ' + m.ms + ' ms';
  c.lines.forEach((li, i) => {
    const s = m.steps[i];
    const ev = li.querySelector('.evidence');
    ev.textContent = s ? evidenceText(s) : '';
    ev.classList.toggle('bad', !!s && ('error' in s || !s.pass));
  });
  const notes = [m.error, ...m.pageErrors].filter(Boolean);
  c.note.hidden = notes.length === 0;
  c.note.textContent = notes.join('\\n');
  // The human sees the version that was just measured.
  c.frame.src = c.frame.src;
}

function connect() {
  // The shell lives at /__bench/<tag>/ and its socket next to it.
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/\\/?$/, '/') + 'ws');
  ws.onopen = () => { state.textContent = 'connected'; };
  ws.onclose = () => { state.textContent = 'disconnected — the workbench stopped'; };
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.v !== 2) return;
    if (m.type === 'session') session(m);
    else if (m.type === 'running') running(m);
    else if (m.type === 'result') result(m);
    else if (m.type === 'problem') problem.textContent = m.message;
  };
}
connect();
`;

export function shellPage(): string {
  return (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>Workbench</title>\n<style>${STYLE}</style>\n</head>\n<body>\n` +
    '<header><h1 id="title">Workbench</h1><span class="state" id="state">connecting…</span></header>\n' +
    '<div id="problem" class="error"></div>\n<div id="diagnostics"></div>\n<main id="criteria"></main>\n' +
    `<script type="module">${SCRIPT}</script>\n</body>\n</html>\n`
  );
}
