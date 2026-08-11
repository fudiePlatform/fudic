# BUG-22 — el editor no sabe dónde está

**Estado:** `Hecho` · **Rama:** `worktree-bug-vscode`

Un `.fud` son tres lenguajes en un fichero y nadie sabía decir en cuál caía un offset: «estoy
en HTML» se deducía de que ninguna proyección lo cubría. Ahora lo dice el compilador —
`regionAt` sobre el árbol— y de ahí salen los seis arreglos: el servidor deja de escanear texto
hacia atrás para los cinco contextos de completado, escribir `>` cierra el tag con el cursor en
medio, <kbd>Ctrl</kbd>+<kbd>/</kbd> comenta según la región, cada diagnóstico llega una sola vez
y un tag sin cerrar deja de acusar a sus padres.

Verde: 1148 tests del compilador, 646 del servidor, 204 de la extensión, más formatter y vite.
`pnpm typecheck` y `pnpm build` completos. Lo nuevo —el módulo `region` y el paquete `vscode`—
al 100 % en las cuatro métricas.

Queda anotado y **no** hecho: la indentación de TypeScript dentro de `@code` sigue usando reglas
de HTML (fila 5).

| ✓ | # | bug | package | fichero (función) |
|---|---|---|---|---|
| [x] | 1 | Al escribir `<div` y pulsar `>` no se autocierra: el usuario debería obtener `<div></div>` en todo elemento HTML no void. No existe ningún proveedor de auto-inserción; `>` ya es trigger de on-type formatting, pero solo reindenta | `compiler` · `language-server` · `vscode` | [region.ts `closingTagAt`](../../../packages/compiler/src/region/region.ts) · [requests.ts `AUTO_CLOSE_TAG_REQUEST`](../../../packages/language-server/src/requests.ts) · [auto-close.ts `watchTypedTags`](../../../packages/vscode/src/auto-close.ts) |
| [x] | 2 | `unclosed <div> element (FUD0052)` sale **dos veces**: el servidor contesta el pull (`textDocument/diagnostic`) y además publica push (`textDocument/publishDiagnostics`) por `interFileDependencies: true`; VS Code las guarda en dos colecciones distintas | `language-server` | [capabilities.ts `SERVER_CAPABILITIES`](../../../packages/language-server/src/capabilities.ts) |
| [x] | 3 | No existe región HTML: solo se proyectan `client_ts`, `server_ts` y `css`; «estoy en HTML» se deduce de que ningún mapping cubre el offset | `language-server` | [virtual-code.ts:97 `createFudicVirtualCode`](../../../packages/language-server/src/virtual-code.ts#L97) |
| [x] | 4 | «¿Dentro de un tag abierto?» se resuelve escaneando texto hacia atrás en vez de consultar el AST; un `>` dentro de un valor de atributo lo engaña y tumba los cinco contextos de completado | `language-server` | [position.ts:134 `openTagStart`](../../../packages/language-server/src/services/position.ts#L134) |
| [x] | 5 | Un solo `language-configuration` para todo el fichero y sin `lineComment`: <kbd>Ctrl</kbd>+<kbd>/</kbd> inserta `@* *@` dentro de `@code` y de `<style>`. En markup escribe el comentario Razor, que no viaja al navegador, y quita también el HTML que el autor haya puesto a propósito. *(La indentación de TypeScript con reglas de HTML sigue pendiente: `indentationRules` tampoco es conmutable por región y su arreglo es el formateador.)* | `compiler` · `language-server` · `vscode` | [region.ts `commentSyntaxOf`](../../../packages/compiler/src/region/region.ts) · [comment.ts `toggleComment`](../../../packages/vscode/src/comment.ts) · [commands/comment.ts](../../../packages/vscode/src/commands/comment.ts) |
| [x] | 6 | Recuperación de tag sin cerrar: el `span` se estira hasta el punto de recuperación y se traga al padre, emitiendo un `FUD0052` falso en cascada | `compiler` | [parser.ts `#closeElement`](../../../packages/compiler/src/html/parser.ts) |
| [x] | 7 | `regionAt(offset)` sobre el AST: `markup \| tag \| attr-value \| expression \| ts \| css`. Es la pieza de la que dependen 1, 4 y 5 | `compiler` | [region/region.ts `regionAt`](../../../packages/compiler/src/region/region.ts) |
