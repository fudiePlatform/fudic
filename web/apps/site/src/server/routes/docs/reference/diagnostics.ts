/**
 * The diagnostics search. A code in the query (`?code=10`, what the search box sends) redirects to
 * its own page, `/docs/reference/diagnostics/FUD0010`; anything else is answered here.
 */

import { redirect } from '@fudic/http';
import { load } from 'fudic:routes/docs/reference/diagnostics';
import { BASE, lookup, normalize } from '../../../lib/diagnostics';

load.handle((ctx) => {
  const query = (ctx.url.searchParams.get('code') ?? '').trim();
  if (query === '') return { query, missing: false };
  const code = normalize(query);
  if (code !== undefined && lookup(code) !== undefined) throw redirect(`${BASE}/${code}`, 302);
  ctx.response.status = 404;
  return { query, missing: true };
});
