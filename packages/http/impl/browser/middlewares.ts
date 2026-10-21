/** The client halves of `fudapi/middlewares.fudapi` (SDD-60 §3.10): the same as before. */

import { csrfClient, errorPagesStep } from '@fudic/http/contract';
import { csrf, errorPages } from 'fudic:@fudic/http/middlewares';

csrf.client(csrfClient);
errorPages.client((ctx, next, { routes }) => errorPagesStep(routes)(ctx, next));
