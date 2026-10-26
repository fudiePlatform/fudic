/** The server halves of `fudapi/middlewares.fudapi` (SDD-60 §3.10): the same as before. */

import { csrfServer } from '@fudic/http/contract';
import { csrf } from 'fudic:@fudic/http/middlewares';

csrf.server(csrfServer);
