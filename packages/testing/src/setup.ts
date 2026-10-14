/**
 * What the `fudic` environment installs in every test file, before its first test: the
 * recorder of shadow-root options (§4.4), the in-place upgrade happy-dom lacks, the matchers
 * of `@testing-library/jest-dom` (§3.3) and the `afterEach` that isolates one test from the
 * next (§4.8).
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, onCleanup } from './cleanup.js';
import { BASE_URL } from './constants.js';
import { blankPage } from './document.js';
import { forgetShadowInits, recordShadowInits } from './shadow.js';
import { upgradeInPlaceOnDefine } from './upgrade.js';

recordShadowInits();
upgradeInPlaceOnDefine();

onCleanup(() => {
  blankPage();
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(BASE_URL);
  forgetShadowInits();
});
afterEach(cleanup);
