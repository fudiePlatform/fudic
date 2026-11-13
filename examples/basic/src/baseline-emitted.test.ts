import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { renderToHtml } from '@fudic/testing';
import * as AppForm from './components/app-form.fud';
import * as AppCalendar from './components/app-calendar.fud';
import * as AppCounter from './components/app-counter.fud';
import { cutoff, EMITTED, status } from '@fudic/baseline';
import { atConstructs, htmlBaselineUses, parseDocument } from '@fudic/compiler';

// SDD-83 §4.7, the HTML half of the test that holds the manifest to what fudic does: the pages
// the server answers for a form with its controls, a delegated calendar and a hydrated counter,
// read by the HTML detector. What the author wrote in a `.fud` is the author's; every other key newer than `widely` is fudic's, and has to be in `EMITTED`. The TS
// half reads the runtime, in `@fudic/typecheck`.

const SRC = fileURLToPath(new URL('.', import.meta.url));

/** Every `.fud` of the app. */
function fuds(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) return fuds(path);
    return name.endsWith('.fud') ? [path] : [];
  });
}

/** The keys of the browser in some markup. */
function keysOf(html: string): string[] {
  return htmlBaselineUses(parseDocument(html, { atConstructs }).value.children).map((use) => use.key);
}

/** What the author wrote: the keys of every `.fud` of the app, as written. */
const written = new Set(fuds(SRC).flatMap((file) => keysOf(readFileSync(file, 'utf8'))));

/** What fudic writes the most of: form controls, delegation and hydration. */
const COMPONENTS = [AppForm, AppCalendar, AppCounter];

test('every key of a painted page newer than widely is the author’s or in the manifest', async () => {
  const widely = cutoff('widely');
  const listed = new Set(EMITTED.map((entry) => entry.key));
  const painted: string[] = [];
  for (const component of COMPONENTS) painted.push(...keysOf(await renderToHtml(component)));
  expect(painted.length).toBeGreaterThan(50);
  // What only fudic writes is read: the focus a control's shadow root delegates.
  expect(painted).toContain('html.elements.template.shadowrootdelegatesfocus');
  const fudics = [...new Set(painted)].filter((key) => !written.has(key));
  const unlisted = fudics.filter((key) => {
    const newly = status(key)?.newly;
    return newly !== undefined && (newly === null || newly > widely) && !listed.has(key);
  });
  expect(unlisted).toEqual([]);
});
