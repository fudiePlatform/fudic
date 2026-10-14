/**
 * What the `fudic` environment installs in every test file, before its first test: the
 * recorder of shadow-root options (§4.4) and the in-place upgrade happy-dom lacks. Both live
 * as long as the file's environment does.
 */

import { recordShadowInits } from './shadow.js';
import { upgradeInPlaceOnDefine } from './upgrade.js';

recordShadowInits();
upgradeInPlaceOnDefine();
