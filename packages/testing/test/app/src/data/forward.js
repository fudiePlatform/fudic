// Plain JavaScript, so no TypeScript transform drops the imports nothing uses: they reach the
// bundler as written. One names a module with effects, which a bundler keeps; the other a
// module without, which it prunes.
import { unused } from './effectful';
import { quiet } from './quiet';

export const label = 'forwarded';
