/**
 * SDD-45 §3.6 — the host's half of `?inline`: reading the bytes, and reporting where the
 * layout asked.
 *
 * The compiler decides WHAT an embedded resource becomes; reading a file is the host's, and
 * it is read at emit time and not before — `?inline` is rare, and a project's assets are not
 * something to load into memory on the chance one of them is asked for.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { transformFud } from '../src/transform.js';
import { nodeIo } from '../src/io.js';
import { LinkedAssets } from '../src/linked-assets.js';
import { policyDeclaresNonce } from '../src/diagnostics.js';
import { DEFAULT_CSP } from '@fudic/transport';

/** A project on disk: a layout, a route that hydrates, and whatever else is given. */
function project(
  head: string,
  files: Readonly<Record<string, string>> = {},
): { readonly root: string; readonly routeId: string } {
  const root = mkdtempSync(join(tmpdir(), 'fudic-inline-'));
  writeFileSync(
    join(root, 'l.fud'),
    `<!DOCTYPE html><html><head>\n${head}\n@RenderHead()</head>\n` +
      '<body><main>@RenderBody()</main></body></html>\n',
  );
  writeFileSync(
    join(root, 'r.fud'),
    '<link rel="layout" href="./l.fud">\n' +
      '@code { @client { const n = signal(1); } }\n' +
      '<output>@n()</output>\n',
  );
  for (const [name, text] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
  }
  return { root, routeId: join(root, 'r.fud') };
}

const SHEET = ':root {\n  --gap:   1rem;\n}\n';

/**
 * A standalone page, which owns its own `<head>` — so the module the transform emits is the
 * one that carries the embedded sheet. (A layout's head lands in the LAYOUT's module, which
 * `@fudic/compiler` covers on its own side.)
 */
function page(
  head: string,
  files: Readonly<Record<string, string>> = {},
): { readonly root: string; readonly id: string } {
  const root = mkdtempSync(join(tmpdir(), 'fudic-inline-page-'));
  const id = join(root, 'p.fud');
  writeFileSync(
    id,
    `<!DOCTYPE html><html><head><title>t</title>\n${head}\n` +
      '@code { @client { const n = signal(1); } }\n' +
      '</head><body><output>@n()</output></body></html>\n',
  );
  for (const [name, text] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
  }
  return { root, id };
}

describe('assetText — the bytes of a resource the author asked to embed', () => {
  it('reads a relative sheet and puts it in the document', () => {
    // A RELATIVE sheet is pruned against the page (SDD-49), so its token has to be used for
    // anything to be embedded: a `?inline` sheet that ends empty writes nothing.
    const { root, id } = page('<link rel="stylesheet" href="./tokens.css?inline">', {
      'tokens.css': `${SHEET}output { margin: var(--gap); }\n`,
    });
    const result = transformFud(id, nodeIo(), 'ruta', undefined, new LinkedAssets('/', root));

    // Compacted on the way in, like every other stylesheet in this framework: there is one
    // path for CSS on purpose, because the day there are two, one of the outputs stops being
    // minified and nobody notices.
    expect(result?.code).toContain('--gap:1rem');
    expect(result?.code).toContain("'<style' + $nonce + '>'");
  });

  it('reads a PUBLIC sheet through the registry that owns public files', () => {
    const { root, id } = page('<link rel="stylesheet" href="/tokens.css?inline">', {
      'public/tokens.css': SHEET,
    });
    const result = transformFud(
      id,
      nodeIo(),
      'ruta',
      undefined,
      new LinkedAssets('/', join(root, 'public')),
    );

    // `/tokens.css` means *the file at the root of what this project serves*, and only the
    // registry knows where that is.
    expect(result?.code).toContain('--gap:1rem');
  });

  it('a public sheet that is not there stays a URL', () => {
    const { root, id } = page('<link rel="stylesheet" href="/nope.css?inline">', {
      'public/tokens.css': SHEET,
    });
    const result = transformFud(
      id,
      nodeIo(),
      'ruta',
      undefined,
      new LinkedAssets('/', join(root, 'public')),
    );

    // The reference the author wrote is what comes out; the missing-asset path (FUD0363)
    // already reports the typo, and embedding an empty `<style>` would hide it.
    expect(result?.code).not.toContain("'<style' + $nonce + '>'");
  });

  it('a relative sheet that cannot be read stays a URL too', () => {
    // Unreadable is the same answer as absent: a directory where a file was named is the
    // shape that reaches the `catch`, and it must not stop a build.
    const { root, id } = page('<link rel="stylesheet" href="./tokens.css?inline">');
    mkdirSync(join(root, 'tokens.css'));
    const result = transformFud(id, nodeIo(), 'ruta', undefined, new LinkedAssets('/', root));

    expect(result?.code).not.toContain("'<style' + $nonce + '>'");
  });
});

describe('inlineRuntimeOf — where this render asked for the inline form', () => {
  it('finds the marker in the LAYOUT, which is where it usually is', () => {
    const { routeId, root } = project('<script src="fudic:runtime?inline"></script>');
    const result = transformFud(routeId, nodeIo(), 'ruta');

    // Asked over the resolved GRAPH and not over one file: the marker belongs to whoever
    // owns the `<head>`, and for a route that is the layout it links. Without this the
    // question was asked only of the route's own file, where it never is.
    expect(result?.inlineRuntime?.file).toBe(join(root, 'l.fud'));
    expect(result?.inlineRuntime?.offset).toBeGreaterThan(0);
  });

  it('finds it in a standalone page’s own head', () => {
    const { id } = page('<script src="fudic:runtime?inline"></script>');
    expect(transformFud(id, nodeIo(), 'pagina')?.inlineRuntime?.file).toBe(id);
  });

  it('reports nothing for the file form, and nothing when there is no marker', () => {
    const file = project('<script src="fudic:runtime"></script>');
    expect(transformFud(file.routeId, nodeIo(), 'ruta')?.inlineRuntime).toBeUndefined();
    const none = project('<title>t</title>');
    expect(transformFud(none.routeId, nodeIo(), 'ruta')?.inlineRuntime).toBeUndefined();
  });
});

/**
 * FUD0803 — `?inline` under a policy that does not declare the nonce (SDD-45 §4.5.2).
 *
 * An error and not a warning, because the page it produces renders and does not hydrate: the
 * browser drops the module and nothing connects that silence to the line that caused it.
 */
describe('policyDeclaresNonce', () => {
  it('cannot fire today, and that is what makes it worth testing directly', () => {
    // The document policy is a constant of the framework and declares the nonce, so the
    // check in the plugin is unreachable as things stand. What is testable is the question
    // it asks — written where it will keep working the day the policy is the project's,
    // which is the only reason a build check is worth anything.
    expect(policyDeclaresNonce(DEFAULT_CSP.document)).toBe(true);
    expect(policyDeclaresNonce("script-src 'self'")).toBe(false);
    // The TOKEN and not a parsed policy: the token is what the response substitutes, so a
    // policy that never writes it cannot produce a nonce for the page, and no amount of
    // reading `script-src` changes that.
    expect(policyDeclaresNonce("script-src 'self' 'nonce-{nonce}'")).toBe(true);
    expect(policyDeclaresNonce("script-src 'self' 'nonce-abc'")).toBe(false);
  });
});
