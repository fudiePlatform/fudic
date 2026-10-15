/**
 * The shell: a component's page in the workbench, the same in the VS Code tab and in the browser.
 * It paints what the socket says and sends back what its buttons ask for:
 *
 * - a header: the count, what ran, when, in which browser and viewport, and whether the socket is
 *   up; under it Run all · Run failing · Pause · Cancel · Expand all, and how the shots are
 *   shown — side by side, or the final one only;
 * - one card per criterion, the failing ones open, in two columns: its steps — the `props` first,
 *   each with its line in the `.fudspec` — and the shots the measuring browser took, with the box
 *   of every reference a step located. A card has Run · Pin · Live;
 * - ONE live iframe, on demand, for the criterion chosen: the cards are shots, not pages.
 *
 * Nothing moves under the reader while a run comes in: a shot keeps its room from the size the
 * result announces and is swapped once the new image is decoded, a card does not fold by itself,
 * and the failing ones go first only when the run is over.
 *
 * It keeps no state the server lacks beyond what is folded, what is open and the shot mode. Its
 * script is the page's code, carried as text, and everything it paints goes in by `textContent`:
 * evidence is whatever a term returned, and none of it is markup.
 *
 * `?theme=light|dark` fixes the theme (and a `fudic:theme` message changes it); `?host=vscode`
 * asks the editor, through `postMessage`, to open files, to show the line under the pointer and
 * to open the shell in the browser.
 */

const STYLE = `
:root { color-scheme: light dark; --ink: #1d1d1f; --soft: #6e6e73; --faint: #8e8e93; --line: #d2d2d7; --bg: #fff;
  --card: #fafafa; --well: #ececf0; --pass: #1e7e34; --fail: #c0392b; --warn: #8a5a00; --warn-bg: #fff1d6;
  --mark: #2f6fe0; --hot: rgba(47, 111, 224, 0.12); --hit: #ffe08a; --button: #fff; --live: #1e7e34;
  --live-bg: #e3f4e8; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ink: #d6d7da; --soft: #8b8f98;
  --faint: #6f7480; --line: #2d2f34; --bg: #18191c; --card: #1e1f22; --well: #2a2c31; --pass: #4fb07a;
  --fail: #ff6b5b; --warn: #e0b45a; --warn-bg: #3a3220; --mark: #4c8dff; --hot: #26324a; --hit: #6b5200;
  --button: #26282d; --live: #7fd3a3; --live-bg: #1f3a2b; } }
:root[data-theme="dark"] { --ink: #d6d7da; --soft: #8b8f98; --faint: #6f7480; --line: #2d2f34; --bg: #18191c;
  --card: #1e1f22; --well: #2a2c31; --pass: #4fb07a; --fail: #ff6b5b; --warn: #e0b45a; --warn-bg: #3a3220;
  --mark: #4c8dff; --hot: #26324a; --hit: #6b5200; --button: #26282d; --live: #7fd3a3; --live-bg: #1f3a2b; }
* { box-sizing: border-box; }
body { margin: 0; font: 13px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--bg); }
.mono, kbd, .line { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
header.top { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); }
.row { display: flex; align-items: center; gap: 10px; padding: 0 16px; min-width: 0; }
.row1 { height: 40px; border-bottom: 1px solid var(--line); }
.row2 { height: 48px; gap: 8px; }
h1 { margin: 0; font-size: 14px; font-weight: 600; white-space: nowrap; }
#count { font-weight: 500; white-space: nowrap; }
#count.pass { color: var(--pass); } #count.fail { color: var(--fail); }
#summary { color: var(--soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.spacer { flex: 1; }
#state { display: flex; align-items: center; gap: 6px; color: var(--soft); font-size: 12px; white-space: nowrap; }
#state .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
#state[data-up="true"] .dot { background: var(--pass); }
#state[data-up="false"] .dot { background: var(--fail); }
button { font: inherit; color: var(--ink); background: var(--button); border: 1px solid var(--line); border-radius: 6px;
  height: 30px; padding: 0 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
button:hover { filter: brightness(1.08); }
button.primary { background: var(--mark); border-color: var(--mark); color: #fff; font-weight: 500; }
button.ghost { background: transparent; color: var(--soft); }
button.icon { width: 30px; padding: 0; justify-content: center; background: transparent; color: var(--soft); }
button[hidden] { display: none; }
kbd { font-size: 11px; padding: 1px 5px; border-radius: 4px; background: var(--well); color: var(--soft); }
button.primary kbd { background: rgba(255, 255, 255, 0.18); color: #fff; }
#pause[aria-pressed="true"] { color: var(--warn); border-color: var(--warn); }
.modes { display: flex; gap: 4px; padding: 3px; border-radius: 6px; background: var(--well); font-size: 12px; }
.modes button { height: 24px; padding: 0 10px; border: 0; border-radius: 4px; background: transparent; color: var(--soft); }
.modes button[aria-pressed="true"] { background: var(--button); color: var(--ink); }
#problem:empty, #diagnostics:empty { display: none; }
#problem, #diagnostics { margin: 12px 16px 0; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; }
#diagnostics ul { margin: 0; padding: 0; list-style: none; }
.error { color: var(--fail); } .warning { color: var(--warn); }
a { color: inherit; text-decoration: none; } a:hover { text-decoration: underline; }
#layout { display: flex; gap: 12px; padding: 16px; align-items: flex-start; }
#criteria { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.card { border: 1px solid var(--line); border-radius: 8px; background: var(--card); outline: none; }
.card:focus-visible { box-shadow: 0 0 0 2px var(--mark); }
.card.pinned { border-color: var(--mark); }
.head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-width: 0; cursor: default; }
.card[data-open="true"] .head { border-bottom: 1px solid var(--line); }
.status { width: 12px; height: 12px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.status::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
.card[data-verdict="pass"] .status::before { background: var(--pass); }
.card[data-verdict="fail"] .status::before, .card[data-verdict="error"] .status::before { background: var(--fail); }
.card[data-running] .status::before { width: 8px; height: 8px; background: transparent; border: 2px solid var(--soft);
  border-right-color: transparent; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.title { font-weight: 600; overflow-wrap: anywhere; }
.verdict { color: var(--soft); font-size: 12px; white-space: nowrap; }
.card[data-verdict="pass"] .verdict { color: var(--pass); }
.card[data-verdict="fail"] .verdict, .card[data-verdict="error"] .verdict { color: var(--fail); }
.card[data-running] .verdict { color: var(--soft); }
.was { font-size: 11px; color: var(--fail); border: 1px solid var(--fail); border-radius: 8px; padding: 0 6px; white-space: nowrap; }
.line { font-size: 12px; color: var(--soft); }
.actions { margin-left: auto; display: flex; gap: 6px; }
.actions button { height: 28px; padding: 0 10px; font-size: 12px; background: transparent; }
.actions button[aria-pressed="true"] { background: var(--live-bg); border-color: var(--live); color: var(--live); }
.card[data-open="false"] .body { display: none; }
.toggle { width: 20px; height: 20px; padding: 0; justify-content: center; border: 0; background: transparent;
  color: var(--soft); font-size: 12px; }
/* Thin scrollbars in one colour, no arrows: the shots scroll, they should not be framed by it. */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: var(--faint); border-radius: 3px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-button { display: none; }
@supports not selector(::-webkit-scrollbar) { * { scrollbar-width: thin; scrollbar-color: var(--faint) transparent; } }
.body { display: grid; grid-template-columns: minmax(220px, 340px) minmax(0, 1fr); gap: 16px; padding: 12px 14px; }
.steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; line-height: 20px; min-width: 0; }
.steps li { display: flex; gap: 10px; align-items: baseline; margin: 0 -8px; padding: 0 8px; border-radius: 4px; min-width: 0; }
.steps li.hot { background: var(--hot); box-shadow: inset 2px 0 0 var(--mark); }
.steps .block { width: 40px; flex: none; color: var(--faint); }
.steps .says { min-width: 0; overflow-wrap: anywhere; }
.steps .props b { font-weight: 500; }
.steps .ok { color: var(--pass); }
.steps .ko { color: var(--fail); }
.steps .evidence { color: var(--soft); }
.steps .then.passed .evidence { color: var(--pass); }
.steps .bad .says, .steps .bad .evidence { color: var(--fail); }
.steps .ignored { color: var(--soft); }
.steps .badge { font-size: 11px; padding: 0 6px; border-radius: 4px; background: var(--warn-bg); color: var(--warn); white-space: nowrap; }
.steps .at { margin-left: auto; font-size: 11px; color: var(--mark); visibility: hidden; }
.steps li.hot .at { visibility: visible; }
.diff { flex-basis: 100%; margin: 2px 0 2px 50px; font: 12px ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.steps li.has-diff { flex-wrap: wrap; }
.diff mark { background: var(--hit); color: inherit; }
.note { margin: 4px 0; color: var(--fail); white-space: pre-wrap; overflow-wrap: anywhere; }
.shots { min-width: 0; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); align-content: start; }
.shots.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.shot { margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.shot figcaption { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--soft); }
.shot figcaption .kind { font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.shot figcaption .size { color: var(--faint); }
.shot figcaption .zoom { margin-left: auto; color: var(--mark); background: none; border: 0; height: auto; padding: 0; font-size: 11px; }
.well { padding: 10px; background: var(--well); border-radius: 6px; overflow-x: auto; }
/* At its real size, as the measuring browser saw it; a wide component scrolls instead of shrinking. */
.frame { position: relative; display: inline-block; vertical-align: top; outline: 1px dashed var(--mark); outline-offset: 2px; }
.frame img { display: block; max-width: none; }
.frame .before { position: absolute; top: 0; left: 0; }
.box { position: absolute; border: 2px solid var(--mark); border-radius: 2px; pointer-events: none; opacity: 0.45; }
.box.hot { opacity: 1; background: rgba(76, 141, 255, 0.22); }
#live { position: sticky; top: 104px; width: min(45%, 520px); border: 1px solid var(--line); border-radius: 8px;
  background: var(--card); overflow: hidden; }
#live[hidden] { display: none; }
#live .bar { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); }
#live .bar button { height: 24px; padding: 0 8px; }
#live iframe { display: block; width: 100%; height: 360px; border: 0; background: #fff; }
#zoom { max-width: 95vw; max-height: 95vh; padding: 12px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--card); color: var(--ink); }
#zoom::backdrop { background: rgba(0, 0, 0, 0.6); }
#zoom .bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#zoom .bar button { height: 24px; padding: 0 8px; }
@media (max-width: 760px) { .body { grid-template-columns: minmax(0, 1fr); } #layout { flex-direction: column; }
  #live { width: 100%; position: static; } .row2 { height: auto; flex-wrap: wrap; padding: 8px 16px; } }
`;

const OPEN_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
  '<path d="M14 3h7v7"></path><path d="M10 14L21 3"></path><path d="M21 14v7H3V3h7"></path></svg>';

const SCRIPT = `
const params = new URLSearchParams(location.search);
const inEditor = params.get('host') === 'vscode';
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

const $ = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const byId = (id) => document.getElementById(id);
const list = byId('criteria'), strip = byId('diagnostics'), problem = byId('problem'), state = byId('state');
const title = byId('title'), countEl = byId('count'), summary = byId('summary');
const live = byId('live'), liveFrame = byId('live-frame'), liveTitle = byId('live-title');
const zoom = byId('zoom'), zoomTitle = byId('zoom-title'), zoomBody = byId('zoom-body');
const pauseButton = byId('pause');
const foldAllButton = byId('fold-all');

let tag = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
let browserName = '';
let viewport = null;
let spec = null;
let ws;
const cards = new Map();
/** The last result of each criterion, for the count and for a cancelled card. */
const results = new Map();
/** What the person folded or unfolded: it outlives a new session. */
const folded = new Map();
let run = null;
let paused = false, pinned = null, pending = 0;
let liveId = null;

const MODES = ['side', 'final'];
let mode = 'side';
try { const kept = localStorage.getItem('fudic:shots'); if (MODES.includes(kept)) mode = kept; } catch {}

function send(command) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(Object.assign({ v: 2, tag: tag }, command))); }

function toEditor(message) { if (inEditor) parent.postMessage(message, '*'); }

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
  toEditor({ type: 'fudic:open', file: link.dataset.file, line: Number(link.dataset.line) });
});

function session(m) {
  tag = m.tag;
  spec = m.spec;
  if (m.browser) browserName = m.browser;
  if (m.viewport) viewport = m.viewport;
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
    card.line.textContent = 'L' + c.line;
    fileLink(card.line, m.spec, c.line);
    paintSteps(card);
    const r = results.get(c.id);
    if (r) paintEvidence(card, r);
    paint(card);
  });
  for (const [id, card] of cards) if (!seen.has(id)) { card.el.remove(); cards.delete(id); results.delete(id); }
  if (liveId !== null && !cards.has(liveId)) closeLive();
  if (liveId !== null) liveFrame.src = cards.get(liveId).criterion.route;
  reorder();
  count();
}

function makeCard(id) {
  const el = $('article', 'card');
  el.tabIndex = 0;
  el.dataset.id = id;
  el.dataset.verdict = 'waiting';
  const head = $('header', 'head');
  const toggle = $('button', 'toggle', '▸');
  toggle.title = 'Fold or unfold (Enter)';
  const status = $('span', 'status');
  status.setAttribute('aria-hidden', 'true');
  const titleLink = $('a', 'title', id);
  const verdict = $('span', 'verdict', 'waiting');
  const was = $('span', 'was');
  was.hidden = true;
  const line = $('a', 'line');
  const actions = $('span', 'actions');
  const runButton = $('button', '', '▶ Run');
  runButton.title = 'Run this criterion';
  const pinButton = $('button', '', 'Pin');
  pinButton.title = 'Pinned, saving a file runs only this criterion; click again to unpin';
  const liveButton = $('button', '', '◉ Live');
  liveButton.title = 'Open its page, alive (l)';
  actions.append(runButton, pinButton, liveButton);
  head.append(toggle, status, titleLink, verdict, was, line, actions);
  const body = $('div', 'body');
  const left = $('div');
  const steps = $('ol', 'steps');
  const note = $('p', 'note');
  note.hidden = true;
  left.append(steps, note);
  const shots = $('div', 'shots');
  body.append(left, shots);
  el.append(head, body);
  const card = { id: id, el: el, toggle: toggle, title: titleLink, line: line, verdict: verdict, was: was, steps: steps, note: note, shots: shots, pin: pinButton, live: liveButton, lines: [], index: 0, criterion: null, running: false, render: 0, autoOpen: false };
  // The head and its arrow fold the card; its links and other buttons do their own thing.
  toggle.addEventListener('click', () => flip(card));
  head.addEventListener('click', (event) => { if (!event.target.closest('a, button')) flip(card); });
  runButton.addEventListener('click', () => send({ type: 'run', ids: [id] }));
  pinButton.addEventListener('click', () => send({ type: 'pin', id: pinned === id ? null : id }));
  liveButton.addEventListener('click', () => (liveId === id ? closeLive() : openLive(id)));
  return card;
}

/** The steps as written: the props it mounts with, then each step, with its line. */
function paintSteps(card) {
  card.steps.replaceChildren();
  const c = card.criterion;
  if (c.props) {
    const li = $('li', 'given');
    const says = $('span', 'says props');
    says.append('props ', $('b', '', c.props.name));
    li.append($('span', 'block', 'given'), says, lineMark(c.props.line));
    hover(li, card, -1, c.props.line);
    card.steps.append(li);
  }
  card.lines = c.steps.map((s, i) => {
    const li = $('li', s.block);
    const text = $('a', 'says', s.text);
    fileLink(text, s.file, 1);
    li.append($('span', 'block', s.block), text, $('span', 'mark'), $('span', 'evidence'), lineMark(s.line));
    hover(li, card, i, s.line);
    card.steps.append(li);
    return li;
  });
}

function lineMark(line) {
  const a = $('a', 'at line', 'L' + line);
  fileLink(a, spec, line);
  return a;
}

/** Pointing at a step lights its boxes in the shots and, in the editor, its line. */
function hover(li, card, step, line) {
  li.addEventListener('mouseenter', () => { li.classList.add('hot'); boxes(card, step, true); toEditor({ type: 'fudic:hover', file: spec, line: line }); });
  li.addEventListener('mouseleave', () => { li.classList.remove('hot'); boxes(card, step, false); toEditor({ type: 'fudic:hover', file: spec, line: null }); });
}

function boxes(card, step, on) {
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
  card.el.classList.toggle('pinned', pinned === card.id);
  card.pin.setAttribute('aria-pressed', String(pinned === card.id));
  card.live.setAttribute('aria-pressed', String(liveId === card.id));
  // What the person chose, or else what the last finished run decided: never mid-run.
  const open = folded.has(card.id) ? folded.get(card.id) : card.autoOpen;
  card.el.dataset.open = String(open);
  card.toggle.textContent = open ? '▾' : '▸';
  card.toggle.setAttribute('aria-expanded', String(open));
  foldAllButton.textContent = [...cards.values()].every((c) => c.el.dataset.open === 'true') ? 'Collapse all' : 'Expand all';
}

/**
 * The failing ones first and open, the rest folded: only between runs, so no card jumps or
 * changes height while results arrive.
 */
function reorder() {
  if (run && !run.end) return;
  for (const card of cards.values()) {
    const r = results.get(card.id);
    const red = !!r && isRed(r.verdict);
    card.el.style.order = String((red ? 0 : 1000) + card.index);
    card.autoOpen = red;
    paint(card);
  }
}

/** Expand every card, or collapse every one when all are open. */
function foldAll() {
  const open = ![...cards.values()].every((c) => c.el.dataset.open === 'true');
  for (const card of cards.values()) { folded.set(card.id, open); paint(card); }
}

function flip(card) {
  folded.set(card.id, card.el.dataset.open !== 'true');
  paint(card);
}

function asText(e) { return typeof e === 'string' ? e : JSON.stringify(e); }

/** Expected against actual, from the first character where they part. */
function diff(e) {
  const expected = asText(e.expected);
  const actual = asText(e.actual);
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

function isPair(e) { return !!e && typeof e === 'object' && 'expected' in e && 'actual' in e; }

/**
 * What a step got, next to what it says: a passing then gets ✓, a failing one ✗ and what it got;
 * an evidence the text already says is not repeated.
 */
function paintEvidence(card, m) {
  card.lines.forEach((li, i) => {
    const s = m.steps[i];
    li.querySelector('.diff')?.remove();
    li.querySelector('.badge')?.remove();
    li.classList.remove('bad', 'passed', 'ignored', 'has-diff');
    const mark = li.querySelector('.mark'), ev = li.querySelector('.evidence');
    mark.textContent = ''; mark.className = 'mark'; ev.textContent = '';
    if (!s) return;
    const text = li.querySelector('.says').textContent;
    if ('error' in s) {
      li.classList.add('bad');
      mark.textContent = '✗'; mark.className = 'mark ko';
      ev.textContent = '→ ' + s.error;
      return;
    }
    if (s.ignored) {
      li.classList.add('ignored');
      li.insertBefore($('span', 'badge', 'skipped here'), li.querySelector('.at'));
      return;
    }
    const e = s.evidence;
    const said = e === null || e === undefined || isPair(e) ? '' : asText(e);
    const repeated = said === '' || text.includes(said);
    if (s.block === 'then') {
      li.classList.add(s.pass ? 'passed' : 'bad');
      mark.textContent = s.pass ? '✓' : '✗';
      mark.className = 'mark ' + (s.pass ? 'ok' : 'ko');
      if (!repeated) ev.textContent = '→ ' + said;
      if (!s.pass && isPair(e)) { li.classList.add('has-diff'); li.append(diff(e)); }
      return;
    }
    if (!repeated) ev.textContent = '(' + said + ')';
  });
}

function result(m) {
  results.set(m.id, m);
  const card = cards.get(m.id);
  if (!card) return;
  card.running = false;
  paintEvidence(card, m);
  const notes = [m.error, ...m.pageErrors].filter(Boolean);
  card.note.hidden = notes.length === 0;
  card.note.textContent = notes.join('\\n');
  void paintShots(card);
  paint(card);
  if (liveId === m.id) liveFrame.src = card.criterion.route;
  if (run && !run.end && run.ids.every((id) => results.get(id) && !cards.get(id)?.running)) run.end = Date.now();
  reorder();
  count();
}

/** A shot at its real size, its room kept by the size the result announced, with its boxes. */
function frameOf(ref, marks, scale) {
  const frame = $('div', 'frame');
  const img = $('img');
  img.alt = 'What the measuring browser saw';
  img.width = Math.round(ref.width * scale);
  img.height = Math.round(ref.height * scale);
  img.src = ref.url;
  frame.append(img);
  for (const mark of marks) {
    const box = $('div', 'box');
    box.dataset.step = String(mark.step);
    box.title = mark.ref;
    box.style.left = (mark.box.x / ref.width * 100) + '%';
    box.style.top = (mark.box.y / ref.height * 100) + '%';
    box.style.width = (mark.box.width / ref.width * 100) + '%';
    box.style.height = (mark.box.height / ref.height * 100) + '%';
    frame.append(box);
  }
  return frame;
}

function caption(kind, ref, open) {
  const cap = $('figcaption');
  cap.append($('span', 'kind', kind === 'before' ? 'Before the when' : 'At the end'));
  const scale = viewport ? viewport.scale : 1;
  cap.append($('span', 'size', '· ' + Math.round(ref.width) + '×' + Math.round(ref.height) + ' · ' + scale + 'x'));
  const zoomButton = $('button', 'zoom', 'Expand ⤢');
  zoomButton.title = 'See it larger';
  zoomButton.addEventListener('click', open);
  cap.append(zoomButton);
  return cap;
}

function figure(card, kind, ref, marks) {
  const fig = $('figure', 'shot');
  const well = $('div', 'well');
  well.append(frameOf(ref, marks, 1));
  fig.append(caption(kind, ref, () => openZoom(card, kind)), well);
  return fig;
}

/**
 * The shots of a card, in the chosen mode. The new ones are built aside and swapped in only once
 * their images are decoded: the card never shrinks to nothing and grows back.
 */
async function paintShots(card) {
  const m = results.get(card.id);
  const token = ++card.render;
  const shots = m ? m.shots : {};
  const marks = m ? m.marks : [];
  const parts = [];
  if (shots.before && mode === 'side') parts.push(figure(card, 'before', shots.before, []));
  if (shots.after) parts.push(figure(card, 'after', shots.after, marks));
  await Promise.all(parts.flatMap((p) => [...p.querySelectorAll('img')]).map((img) => img.decode().catch(() => undefined)));
  if (token !== card.render) return;
  card.shots.classList.toggle('two', parts.length === 2);
  card.shots.replaceChildren(...parts);
}

function openZoom(card, kind) {
  const m = results.get(card.id);
  const ref = m && m.shots[kind];
  if (!ref) return;
  zoomTitle.textContent = card.id + ' · ' + (kind === 'before' ? 'before the first when' : 'at the end');
  zoomBody.replaceChildren(frameOf(ref, kind === 'after' ? m.marks : [], 2));
  zoom.showModal();
}

function setMode(next) {
  mode = next;
  try { localStorage.setItem('fudic:shots', next); } catch {}
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  for (const card of cards.values()) void paintShots(card);
}

function running(m) {
  run = { ids: m.ids, start: Date.now(), end: null, trigger: m.trigger };
  for (const id of m.ids) { const card = cards.get(id); if (card) { card.running = true; paint(card); } }
  count();
}

function cancelled(m) {
  for (const id of m.ids) { const card = cards.get(id); if (card) { card.running = false; paint(card); } }
  if (run) run.end = Date.now();
  reorder();
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
  const red = ids.some((id) => isRed(results.get(id)?.verdict));
  countEl.textContent = pass + '/' + ids.length + ' pass';
  countEl.className = red ? 'fail' : ids.length > 0 && pass === ids.length ? 'pass' : '';
  const parts = [];
  if (run && run.end) parts.push(((run.end - run.start) / 1000).toFixed(1) + ' s');
  if (run) parts.push(run.trigger.file ? 'after saving ' + run.trigger.file.split('/').pop() + ' ' + clock(run.trigger.at) : clock(run.trigger.at));
  if (browserName) parts.push(browserName);
  if (viewport) parts.push('viewport ' + viewport.width + '×' + viewport.height);
  if (pinned) parts.push('pinned: ' + pinned);
  if (paused) parts.push('paused' + (pending > 0 ? ', ' + pending + ' waiting' : ''));
  summary.textContent = parts.join(' · ');
}

function openLive(id) {
  const card = cards.get(id);
  if (!card) return;
  liveId = id;
  live.hidden = false;
  liveTitle.textContent = id;
  liveFrame.src = card.criterion.route;
  for (const c of cards.values()) paint(c);
}

function closeLive() {
  liveId = null; live.hidden = true; liveFrame.removeAttribute('src');
  for (const c of cards.values()) paint(c);
}

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
  if (event.ctrlKey || event.metaKey || event.altKey || zoom.open) return;
  if (event.target.closest && event.target.closest('button, a, input') && (event.key === 'Enter' || event.key === ' ')) return;
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
foldAllButton.addEventListener('click', foldAll);
byId('live-close').addEventListener('click', closeLive);
byId('zoom-close').addEventListener('click', () => zoom.close());
for (const b of document.querySelectorAll('.modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));
setMode(mode);
const openBrowser = byId('open-browser');
openBrowser.hidden = !inEditor;
openBrowser.addEventListener('click', () => toEditor({ type: 'fudic:openInBrowser' }));

window.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'fudic:theme' && (data.theme === 'light' || data.theme === 'dark')) document.documentElement.dataset.theme = data.theme;
});

function setUp(up, text) { state.dataset.up = String(up); state.lastChild.textContent = text; }

function connect() {
  // The shell lives at /__bench/<tag>/ and its socket next to it.
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/\\/?$/, '/') + 'ws');
  ws.onopen = () => setUp(true, 'connected');
  ws.onclose = () => setUp(false, 'disconnected — the workbench stopped');
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
    '<header class="top">' +
    '<div class="row row1"><h1 id="title">Workbench</h1><span id="count"></span><span id="summary"></span>' +
    '<span class="spacer"></span><span id="state"><span class="dot"></span><span>connecting…</span></span>' +
    `<button id="open-browser" class="icon" title="Open in browser" aria-label="Open in browser" hidden>${OPEN_ICON}</button></div>` +
    '<div class="row row2">' +
    '<button id="run-all" class="primary" title="Run every criterion">▶ Run all <kbd>R</kbd></button>' +
    '<button id="run-failing" title="Run the ones that did not pass">Run failing <kbd>F</kbd></button>' +
    '<button id="pause" class="ghost" title="Saving does not run (p)">Pause</button>' +
    '<button id="cancel" class="ghost" title="Stop the running criteria (Esc)">Cancel</button>' +
    '<button id="fold-all" class="ghost" title="Expand every card, or collapse them all">Expand all</button>' +
    '<span class="spacer"></span>' +
    '<span class="modes" role="group" aria-label="How the shots are shown">' +
    '<button data-mode="side" title="Before the when and at the end, side by side">Side by side</button>' +
    '<button data-mode="final" title="Only the shot at the end">Final only</button></span>' +
    '</div></header>\n' +
    '<div id="problem" class="error"></div>\n<div id="diagnostics"></div>\n' +
    '<div id="layout"><main id="criteria"></main>' +
    '<aside id="live" hidden><div class="bar"><b id="live-title"></b><span class="spacer"></span>' +
    '<button id="live-close" title="Close">×</button></div><iframe id="live-frame" title="The criterion\'s page, alive"></iframe></aside></div>\n' +
    '<dialog id="zoom"><div class="bar"><b id="zoom-title"></b><span class="spacer"></span>' +
    '<button id="zoom-close" title="Close (Esc)">×</button></div><div id="zoom-body" class="well"></div></dialog>\n' +
    `<script type="module">${SCRIPT}</script>\n</body>\n</html>\n`
  );
}
