/**
 * One diagnostic at its own address, `/docs/reference/diagnostics/FUD0010`: where every
 * diagnostic links to, from the editor, the terminal and the MCP.
 */

import { redirect } from '@fudic/http';
import { load } from 'fudic:routes/docs/reference/diagnostics/[code]';
import { BASE, lookup, normalize } from '../../../../lib/diagnostics';

const none = { code: '', title: [], severity: '', why: [], fix: [], replaced: [] };

load.handle((ctx) => {
  const asked = ctx.params.code;
  const code = normalize(asked);
  // `/diagnostics/10` and `/diagnostics/fud10` are FUD0010: one address per code.
  if (code !== undefined && code !== asked && lookup(code) !== undefined) throw redirect(`${BASE}/${code}`, 301);
  const found = code === undefined ? undefined : lookup(code);
  if (found === undefined) {
    ctx.response.status = 404;
    return { asked, found: false, ...none };
  }
  return { asked, found: true, ...found };
});
