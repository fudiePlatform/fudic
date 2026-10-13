/**
 * The `?server` module (SDD-19 §4.3): the RenderChunk wrapper imports `load`/`paths` from
 * `<page>.fud?server`, and since SDD-56 the server functions are served from it too — a
 * component's as much as a route's. Server-only code never reaches any client bundle because
 * it is only ever imported by the server side.
 *
 * What goes in is the compiler's to say, off the same reading of `@code` the rest of the emit
 * uses: a route's whole `@server`, a component's server functions and what they are built of,
 * and the imports those statements read, the neutral zone's included (SDD-56 §4.13).
 */

export { emitServerModule } from '@fudic/compiler';
