/** What `routes/raw.fudapi` declares, implemented. */

import { trustedHtml } from '@fudic/dom';
import { load } from 'fudic:routes/raw';

// Marked here, on the server: the mark does not cross the contract, so the page gets the text
// and `@raw` writes it escaped.
load.handle(() => ({ falsa: trustedHtml('<b>esto no está marcado</b>') }));
