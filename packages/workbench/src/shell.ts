/**
 * The shell: a component's page in the workbench, the same in the VS Code tab and in the browser.
 * It paints what the socket says and sends back what its buttons ask for:
 *
 * - a header with the count, what ran and why, and Run all · Run failing · Pause · Cancel;
 * - one card per criterion, the ones that did not pass first; a green card folds to one line.
 *   A card has its steps — the failed one open, with expected against actual — the shots the
 *   measuring browser took, with the box of every reference a step located, and Run · Pin · Live;
 * - ONE live iframe, on demand, for the criterion chosen: the cards are shots, not pages.
 *
 * It keeps no state the server lacks beyond what is folded and what is open. Its script is the
 * page's code, carried as text, and everything it paints goes in by `textContent`: evidence is
 * whatever a term returned, and none of it is markup.
 *
 * `?theme=light|dark` fixes the theme (and a `fudic:theme` message changes it); `?host=vscode`
 * asks the editor to open files through `postMessage` instead of `vscode://` links.
 */

const STYLE = `
:root { color-scheme: light dark; --ink: #1d1d1f; --soft: #6e6e73; --line: #d2d2d7; --bg: #fff;
  --card: #fafafa; --pass: #1e7e34; --fail: #c0392b; --run: #8e8e93; --warn: #b26a00; --mark: #0a84ff;
  --hit: #ffe08a; --button: #e8e8ed; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ink: #f5f5f7; --soft: #a1a1a6;
  --line: #3a3a3c; --bg: #1c1c1e; --card: #242426; --pass: #4cd964; --fail: #ff6b5b; --warn: #ffb340;
  --hit: #6b5200; --button: #3a3a3c; } }
:root[data-theme="dark"] { --ink: #f5f5f7; --soft: #a1a1a6; --line: #3a3a3c; --bg: #1c1c1e; --card: #242426;
  --pass: #4cd964; --fail: #ff6b5b; --warn: #ffb340; --hit: #6b5200; --button: #3a3a3c; }
* { box-sizing: border-box; }
body { margin: 0; font: 13px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--bg); }
header { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center;
  padding: 8px 16px; border-bottom: 1px solid var(--line); background: var(--bg); }
header h1 { margin: 0; font-size: 15px; font-weight: 600; }
#summary { color: var(--soft); }
#summary b { color: var(--ink); font-weight: 600; }
.spacer { flex: 1; }
button { font: inherit; color: var(--ink); background: var(--button); border: 0; border-radius: 4px;
  padding: 2px 8px; cursor: pointer; }
button:hover { filter: brightness(0.95); }
button[aria-pressed="true"] { background: var(--mark); color: #fff; }
kbd { font: 11px ui-monospace, monospace; color: var(--soft); }
#state { color: var(--soft); font-size: 12px; }
#problem:empty, #diagnostics:empty { display: none; }
#problem, #diagnostics { margin: 8px 16px 0; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; }
#diagnostics ul { margin: 0; padding: 0; list-style: none; }
.error { color: var(--fail); } .warning { color: var(--warn); }
a { color: inherit; text-decoration: none; } a:hover { text-decoration: underline; }
#layout { display: flex; gap: 12px; padding: 10px 16px; align-items: flex-start; }
#criteria { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.card { padding: 6px 10px; border: 1px solid var(--line); border-left: 4px solid var(--run); border-radius: 6px;
  background: var(--card); outline: none; }
.card:focus-visible { box-shadow: 0 0 0 2px var(--mark); }
.card[data-verdict="pass"] { border-left-color: var(--pass); }
.card[data-verdict="fail"], .card[data-verdict="error"] { border-left-color: var(--fail); }
.card[data-running] .verdict { color: var(--soft); }
.card.pinned { box-shadow: inset 0 0 0 1px var(--mark); }
.head { display: flex; gap: 8px; align-items: center; }
.toggle { background: none; padding: 0 4px; color: var(--soft); font-size: 14px; }
.title { font-weight: 600; overflow-wrap: anywhere; }
.verdict { color: var(--soft); white-space: nowrap; }
.card[data-verdict="pass"] .verdict { color: var(--pass); }
.card[data-verdict="fail"] .verdict, .card[data-verdict="error"] .verdict { color: var(--fail); }
.was { font-size: 11px; color: var(--fail); border: 1px solid var(--fail); border-radius: 8px; padding: 0 6px; }
.actions { margin-left: auto; display: flex; gap: 4px; }
.card[data-open="false"] .body { display: none; }
.steps { margin: 6px 0; padding: 0; list-style: none; }
.steps li { padding: 1px 0; overflow-wrap: anywhere; }
.steps li.hot { background: color-mix(in srgb, var(--mark) 12%, transparent); }
.steps .block { display: inline-block; min-width: 3.4em; color: var(--soft); }
.steps .ignored { opacity: 0.5; }
.steps .evidence { color: var(--soft); }
.steps .bad .evidence, .steps .bad .text { color: var(--fail); }
.diff { margin: 2px 0 2px 3.4em; font: 12px ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.diff mark { background: var(--hit); color: inherit; }
.note { margin: 4px 0; color: var(--fail); white-space: pre-wrap; overflow-wrap: anywhere; }
.shots { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 2px; }
.shot { margin: 0; min-width: 0; }
.shot figcaption { color: var(--soft); font-size: 11px; }
/* At its real size, as the measuring browser saw it; a wide component scrolls instead of shrinking. */
.scroll { overflow-x: auto; max-width: 100%; }
.frame { position: relative; display: inline-block; vertical-align: top; border: 1px dashed var(--line); }
.frame img { display: block; max-width: none; }
.box { position: absolute; border: 2px solid var(--mark); border-radius: 2px; pointer-events: none; opacity: 0.55; }
.box.hot { opacity: 1; }
#live { position: sticky; top: 52px; width: min(45%, 520px); border: 1px solid var(--line); border-radius: 6px;
  background: var(--card); }
#live[hidden] { display: none; }
#live .bar { display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--line); }
#live iframe { display: block; width: 100%; height: 360px; border: 0; background: var(--bg); }
@media (max-width: 720px) { #layout { flex-direction: column; } #live { width: 100%; position: static; } }
`;

const SCRIPT = `
const params = new URLSearchParams(location.search);
const inEditor = params.get('host') === 'vscode';
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

const $ = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const byId = (id) => document.getElementById(id);
const list = byId('criteria'), strip = byId('diagnostics'), problem = byId('problem'), state = byId('state');
const title = byId('title'), summary = byId('summary');
const live = byId('live'), liveFrame = byId('live-frame'), liveTitle = byId('live-title');
const pauseButton = byId('pause');

let tag = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
let browserName = '';
let ws;
const cards = new Map();
/** The last result of each criterion, for the count and for a cancelled card. */
const results = new Map();
/** What the person folded or unfolded: it outlives a new session. */
const folded = new Map();
let run = null;
let paused = false, pinned = null, pending = 0;
let liveId = null;

function send(command) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(Object.assign({ v: 2, tag: tag }, command))); }

/** A link that opens a file at a line: a vscode:// link in a browser, a request to the editor in its tab. */
function fileLink(el, file, line) {
  if (!file) return;
  el.href = 'vscode://file/' + encodeURI(file.charAt(0) === '/' ? file.slice(1) : file) + (line ? ':' + line : '');
  el.title = file + (line ? ':' + line : '');
  el.dataset.file = file;
  el.dataset.line = String(line || 1);
}

document.addEventListener('click', (event) => {
  const link = event.target.closest && event.target.closest('a[data-file]');
  if (!link || !inEditor) return;
  event.preventDefault();
  parent.postMessage({ type: 'fudic:open', file: link.dataset.file, line: Number(link.dataset.line) }, '*');
});

function session(m) {
  tag = m.tag;
  if (m.browser) browserName = m.browser;
  title.textContent = m.tag;
  document.title = m.tag + ' · workbench';
  strip.replaceChildren();
  if (m.diagnostics.length > 0) {
    const ul = $('ul');
    for (const d of m.diagnostics) {
      const li = $('li', d.severity);
      const a = $('a', '', d.code + ' ' + d.message + (d.file ? ' — ' + d.file.split('/').pop() + (d.line === null ? '' : ':' + d.line) : ''));
      fileLink(a, d.file, d.line);
      li.append(a);
      ul.append(li);
    }
    strip.append(ul);
  }
  const seen = new Set();
  m.criteria.forEach((c, index) => {
    seen.add(c.id);
    let card = cards.get(c.id);
    if (!card) { card = makeCard(c.id); cards.set(c.id, card); list.append(card.el); }
    card.index = index;
    card.criterion = c;
    fileLink(card.title, m.spec, c.line);
    paintSteps(card);
    paint(card);
  });
  for (const [id, card] of cards) if (!seen.has(id)) { card.el.remove(); cards.delete(id); results.delete(id); }
  if (liveId !== null && !cards.has(liveId)) closeLive();
  if (liveId !== null) liveFrame.src = cards.get(liveId).criterion.route;
  count();
}

function makeCard(id) {
  const el = $('section', 'card');
  el.tabIndex = 0;
  el.dataset.id = id;
  el.dataset.verdict = 'waiting';
  const head = $('div', 'head');
  const toggle = $('button', 'toggle', '▸');
  toggle.title = 'Fold or unfold (Enter)';
  const titleLink = $('a', 'title', id);
  const was = $('span', 'was');
  was.hidden = true;
  const verdict = $('span', 'verdict', 'waiting');
  const actions = $('span', 'actions');
  const runButton = $('button', '', '▶');
  runButton.title = 'Run this criterion';
  const pinButton = $('button', '', 'Pin');
  pinButton.title = 'Saving runs only this criterion';
  const liveButton = $('button', '', 'Live');
  liveButton.title = 'Open its page, alive (l)';
  actions.append(runButton, pinButton, liveButton);
  head.append(toggle, titleLink, was, verdict, actions);
  const body = $('div', 'body');
  const steps = $('ol', 'steps');
  const note = $('p', 'note');
  note.hidden = true;
  const shots = $('div', 'shots');
  body.append(steps, note, shots);
  el.append(head, body);
  const card = { id: id, el: el, title: titleLink, toggle: toggle, was: was, verdict: verdict, steps: steps, note: note, shots: shots, pin: pinButton, lines: [], index: 0, criterion: null, running: false };
  toggle.addEventListener('click', () => flip(card));
  runButton.addEventListener('click', () => send({ type: 'run', ids: [id] }));
  pinButton.addEventListener('click', () => send({ type: 'pin', id: pinned === id ? null : id }));
  liveButton.addEventListener('click', () => openLive(id));
  return card;
}

function paintSteps(card) {
  card.steps.replaceChildren();
  card.lines = card.criterion.steps.map((s, i) => {
    const li = $('li');
    const text = $('a', 'text', s.text);
    fileLink(text, s.file, 1);
    li.append($('span', 'block', s.block), text, $('span', 'evidence'));
    li.addEventListener('mouseenter', () => hot(card, i, true));
    li.addEventListener('mouseleave', () => hot(card, i, false));
    card.steps.append(li);
    return li;
  });
}

function hot(card, step, on) {
  card.lines[step]?.classList.toggle('hot', on);
  for (const box of card.shots.querySelectorAll('.box')) if (Number(box.dataset.step) === step) box.classList.toggle('hot', on);
}

function isRed(verdict) { return verdict === 'fail' || verdict === 'error'; }

function paint(card) {
  const r = results.get(card.id);
  const verdict = r ? r.verdict : 'waiting';
  card.el.dataset.verdict = verdict;
  if (card.running) card.el.dataset.running = '';
  else delete card.el.dataset.running;
  card.verdict.textContent = card.running ? 'running…' : r ? r.verdict + ' · ' + r.ms + ' ms' : 'waiting';
  const worse = r && r.was === 'pass' && isRed(r.verdict);
  card.was.hidden = !worse;
  card.was.textContent = worse ? 'was pass' : '';
  card.el.style.order = String((isRed(verdict) ? 0 : 1000) + card.index);
  card.el.classList.toggle('pinned', pinned === card.id);
  card.pin.setAttribute('aria-pressed', String(pinned === card.id));
  const open = folded.has(card.id) ? folded.get(card.id) : verdict !== 'pass';
  card.el.dataset.open = String(open);
  card.toggle.textContent = open ? '▾' : '▸';
  card.toggle.setAttribute('aria-expanded', String(open));
}

function flip(card) {
  folded.set(card.id, card.el.dataset.open !== 'true');
  paint(card);
}

function evidenceText(s) {
  if ('error' in s) return ' → ' + s.error;
  if (s.ignored) return ' (does not apply in the workbench)';
  const e = s.evidence;
  if (e && typeof e === 'object' && 'expected' in e && 'actual' in e) return '';
  return ' → ' + (typeof e === 'string' ? e : JSON.stringify(e));
}

/** Expected against actual, from the first character where they part. */
function diff(e) {
  const expected = typeof e.expected === 'string' ? e.expected : JSON.stringify(e.expected);
  const actual = typeof e.actual === 'string' ? e.actual : JSON.stringify(e.actual);
  let same = 0;
  while (same < expected.length && same < actual.length && expected[same] === actual[same]) same++;
  const box = $('div', 'diff');
  for (const [label, value] of [['expected  ', expected], ['actual    ', actual]]) {
    const line = $('div');
    line.append(label + value.slice(0, same), $('mark', '', value.slice(same)));
    box.append(line);
  }
  return box;
}

function result(m) {
  results.set(m.id, m);
  const card = cards.get(m.id);
  if (!card) return;
  card.running = false;
  card.lines.forEach((li, i) => {
    const s = m.steps[i];
    li.querySelector('.diff')?.remove();
    const ev = li.querySelector('.evidence');
    ev.textContent = s ? evidenceText(s) : '';
    const bad = !!s && ('error' in s || (s.block === 'then' && !s.pass));
    li.classList.toggle('bad', bad);
    li.classList.toggle('ignored', !!s && !!s.ignored);
    if (bad && s.evidence && typeof s.evidence === 'object' && 'expected' in s.evidence && 'actual' in s.evidence) li.append(diff(s.evidence));
  });
  const notes = [m.error, ...m.pageErrors].filter(Boolean);
  card.note.hidden = notes.length === 0;
  card.note.textContent = notes.join('\\n');
  paintShots(card, m);
  paint(card);
  if (liveId === m.id) liveFrame.src = card.criterion.route;
  if (run && run.ids.every((id) => results.get(id) && !cards.get(id)?.running)) run.end = Date.now();
  count();
}

function paintShots(card, m) {
  card.shots.replaceChildren();
  for (const kind of ['before', 'after']) {
    const url = m.shots[kind] && m.shots[kind].url;
    if (!url) continue;
    const figure = $('figure', 'shot');
    const frame = $('div', 'frame');
    const img = $('img');
    img.alt = kind + ' — what the measuring browser saw';
    img.src = url;
    frame.append(img);
    if (kind === 'after') {
      img.addEventListener('load', () => {
        for (const mark of m.marks) {
          const box = $('div', 'box');
          box.dataset.step = String(mark.step);
          box.title = mark.ref;
          box.style.left = (mark.box.x / img.naturalWidth * 100) + '%';
          box.style.top = (mark.box.y / img.naturalHeight * 100) + '%';
          box.style.width = (mark.box.width / img.naturalWidth * 100) + '%';
          box.style.height = (mark.box.height / img.naturalHeight * 100) + '%';
          frame.append(box);
        }
      });
    }
    const scroll = $('div', 'scroll');
    scroll.append(frame);
    figure.append(scroll, $('figcaption', '', kind === 'before' ? 'before the first when' : 'at the end'));
    card.shots.append(figure);
  }
}

function running(m) {
  run = { ids: m.ids, start: Date.now(), end: null, trigger: m.trigger };
  for (const id of m.ids) { const card = cards.get(id); if (card) { card.running = true; paint(card); } }
  count();
}

function cancelled(m) {
  for (const id of m.ids) { const card = cards.get(id); if (card) { card.running = false; paint(card); } }
  if (run) run.end = Date.now();
  count();
}

function setState(m) {
  paused = m.paused; pinned = m.pinned; pending = m.pending;
  pauseButton.textContent = paused ? 'Resume' + (pending > 0 ? ' (' + pending + ')' : '') : 'Pause';
  pauseButton.setAttribute('aria-pressed', String(paused));
  for (const card of cards.values()) paint(card);
  count();
}

function clock(at) { return new Date(at).toLocaleTimeString(); }

function count() {
  const ids = [...cards.keys()];
  const pass = ids.filter((id) => results.get(id)?.verdict === 'pass').length;
  const parts = [];
  const b = $('b', '', pass + '/' + ids.length + ' pass');
  summary.replaceChildren(b);
  if (run && run.end) parts.push(((run.end - run.start) / 1000).toFixed(1) + ' s');
  if (run) parts.push(run.trigger.file ? 'after saving ' + run.trigger.file.split('/').pop() + ' ' + clock(run.trigger.at) : 'run ' + clock(run.trigger.at));
  if (pinned) parts.push('pinned: ' + pinned);
  if (paused) parts.push('paused' + (pending > 0 ? ', ' + pending + ' waiting' : ''));
  if (browserName) parts.push(browserName);
  if (parts.length > 0) summary.append(' · ' + parts.join(' · '));
}

function openLive(id) {
  const card = cards.get(id);
  if (!card) return;
  liveId = id;
  live.hidden = false;
  liveTitle.textContent = id;
  liveFrame.src = card.criterion.route;
}

function closeLive() { liveId = null; live.hidden = true; liveFrame.removeAttribute('src'); }

/** Cards in the order they are shown. */
function shown() { return [...cards.values()].sort((a, b) => Number(a.el.style.order) - Number(b.el.style.order)); }

function focused() { const el = document.activeElement; return el && el.dataset && cards.get(el.dataset.id); }

function move(step) {
  const order = shown();
  if (order.length === 0) return;
  const at = order.indexOf(focused());
  order[Math.max(0, Math.min(order.length - 1, at + step))].el.focus();
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest && event.target.closest('button, a') && event.key === 'Enter') return;
  const card = focused();
  switch (event.key) {
    case 'r': send({ type: 'run' }); break;
    case 'f': send({ type: 'run', failing: true }); break;
    case 'p': send({ type: 'pause', paused: !paused }); break;
    case 'Escape': send({ type: 'cancel' }); break;
    case 'j': move(1); break;
    case 'k': move(-1); break;
    case 'Enter': if (card) flip(card); else return; break;
    case 'l': if (card) openLive(card.id); else return; break;
    default: return;
  }
  event.preventDefault();
});

byId('run-all').addEventListener('click', () => send({ type: 'run' }));
byId('run-failing').addEventListener('click', () => send({ type: 'run', failing: true }));
pauseButton.addEventListener('click', () => send({ type: 'pause', paused: !paused }));
byId('cancel').addEventListener('click', () => send({ type: 'cancel' }));
byId('live-close').addEventListener('click', closeLive);

window.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'fudic:theme' && (data.theme === 'light' || data.theme === 'dark')) document.documentElement.dataset.theme = data.theme;
});

function connect() {
  // The shell lives at /__bench/<tag>/ and its socket next to it.
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/\\/?$/, '/') + 'ws');
  ws.onopen = () => { state.textContent = 'connected'; };
  ws.onclose = () => { state.textContent = 'disconnected — the workbench stopped'; };
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.v !== 2) return;
    if (m.type === 'session') session(m);
    else if (m.type === 'running') running(m);
    else if (m.type === 'result') result(m);
    else if (m.type === 'state') setState(m);
    else if (m.type === 'cancelled') cancelled(m);
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
    '<header><h1 id="title">Workbench</h1><span id="summary"></span><span class="spacer"></span>' +
    '<button id="run-all" title="Run every criterion">Run all <kbd>r</kbd></button>' +
    '<button id="run-failing" title="Run the ones that did not pass">Run failing <kbd>f</kbd></button>' +
    '<button id="pause" title="Saving does not run (p)">Pause</button>' +
    '<button id="cancel" title="Stop the running criteria (Esc)">Cancel</button>' +
    '<span id="state">connecting…</span></header>\n' +
    '<div id="problem" class="error"></div>\n<div id="diagnostics"></div>\n' +
    '<div id="layout"><main id="criteria"></main>' +
    '<aside id="live" hidden><div class="bar"><b id="live-title"></b><span class="spacer"></span>' +
    '<button id="live-close" title="Close">×</button></div><iframe id="live-frame" title="The criterion\'s page, alive"></iframe></aside></div>\n' +
    `<script type="module">${SCRIPT}</script>\n</body>\n</html>\n`
  );
}
