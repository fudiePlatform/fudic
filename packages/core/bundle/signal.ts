// Entry of the `core/signal` runtime piece. `batch` and `now` travel inside it, so they are
// exported from it too: a name inside a piece that no URL offers cannot be imported.

export { signal, type Signal } from '../src/signal.js';
export { batch } from '../src/batch.js';
export { now } from '../src/now.js';
