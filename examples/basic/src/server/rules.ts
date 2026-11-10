/**
 * The rules of `rules/people.fudapi`: they read the data, so only the server runs them. The browser
 * asks `alias-taken` while the user types (`runs remote`); the check below never reaches it.
 */

import { aliasTaken, emailTaken } from 'fudic:rules/people';
import { aliasTaken as aliasInUse } from '../data/aliases';
import { emailTaken as emailInUse } from '../data/people';

emailTaken.check(async (value) => !(await emailInUse(value)));

aliasTaken.check(async (value) => !(await aliasInUse(value)));
