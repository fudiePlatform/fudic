// WRITTEN BY THE DEVELOPER. `rule nif-unique`: asks the database. Server only: the build keeps
// it out of the browser, as it does today with `serverValidator`. `nifTaken` is the app's own.

import type { NifUnique } from '../generated/shared';
import { nifTaken } from '../data/people';

export default (async (value) => !(await nifTaken(value))) satisfies NifUnique;
