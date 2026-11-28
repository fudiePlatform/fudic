/**
 * A summary painted by the page itself (finding 73): the route module calls `summaryEntriesOf`
 * exactly as a component module does, so it imports it too — from its body or from a section.
 * Without the import the prerender failed with "summaryEntriesOf is not defined".
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import { emitRouteModule } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const LAYOUT =
  '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()@RenderSection(side)</body></html>';

const IMPORT = "import { summaryEntriesOf } from '@fudic/forms';";

function routeModule(body: string): string {
  const source = `<link rel="layout" href="./l.fud">
@code {
  import { signupForm } from './signup.form';
}
${body}`;
  const graph = resolveDocument('/r.fud', memoryIo({ '/r.fud': source, '/l.fud': LAYOUT })).value;
  return emitRouteModule(graph, {});
}

describe('finding 73 — a summary in a route', () => {
  it('in the body: the route imports `summaryEntriesOf`', () => {
    const code = routeModule('<form control=@signupForm><div summary=@signupForm fields></div></form>');
    expect(code).toContain('summaryEntriesOf(signupForm, "fud-s-signupForm"');
    expect(code).toContain(IMPORT);
  });

  it('in a section: the route imports it as well', () => {
    const code = routeModule(
      '<p>x</p>@section side { <form control=@signupForm><div summary=@signupForm></div></form> }',
    );
    expect(code).toContain('summaryEntriesOf(signupForm, "fud-s-signupForm"');
    expect(code).toContain(IMPORT);
  });

  it('without a summary: nothing to import', () => {
    expect(routeModule('<form control=@signupForm></form>')).not.toContain('@fudic/forms');
  });
});
