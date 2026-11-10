/** The server halves of `fudapi/middlewares.fudapi` (SDD-60 §3.10, SDD-81 §3.13). */

import { csrfServer } from '@fudic/http/contract';
import { csrf } from 'fudic:@fudic/http/middlewares';

csrf.server(csrfServer);
