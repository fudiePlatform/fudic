/** Server only: no client half, and its server half is native. It adds nothing to `ctx`. */

import { middleware } from "@fudic/http";

export const audit = middleware();
