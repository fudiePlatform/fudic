/**
 * What the `fudic` environment installs in every test file, before its first test: the
 * recorder of shadow-root options (§4.4), the in-place upgrade happy-dom lacks, the harness's
 * `fetch` (§4.6), the matchers of `@testing-library/jest-dom` (§3.3) and the `afterEach` that
 * isolates one test from the next (§4.8).
 */

import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach } from 'vitest';
import { cleanup, onCleanup } from './cleanup.js';
import { closeClientGraphs } from './client-graph.js';
import { BASE_URL } from './constants.js';
import { blankPage } from './document.js';
import { answerWith, forgetCookies, installFetch } from './fetch.js';
import { installInternals } from './internals.js';
import { controlWith } from './sw.js';
import { registerMatchers } from './matchers.js';
import { serveOverrides } from './providers.js';
import { forgetShadowInits, recordShadowInits } from './shadow.js';
import { upgradeInPlaceOnDefine } from './upgrade.js';

recordShadowInits();
installInternals();
upgradeInPlaceOnDefine();
installFetch();
registerMatchers();

onCleanup(() => {
  blankPage();
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(BASE_URL);
  forgetShadowInits();
  answerWith(undefined);
  forgetCookies();
  controlWith(false);
  serveOverrides([]);
});
afterEach(cleanup);
afterAll(closeClientGraphs);
