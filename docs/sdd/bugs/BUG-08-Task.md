# BUG-08 — Tareas

> **BUG:** [BUG-08 — El CSS de componente nunca se minifica, en ninguna salida](./BUG-08-css-verbatim.md)
> **Paquete:** `@fudic/compiler` · **Rama:** worktree `fix-build-output`
> **Depende de:** nada
> **Progreso:** 8 / 8

Cada tarea es un paso cerrado. Las rutas son relativas a la raíz del repo.

No toca `@fudic/vite`, así que **puede ir en paralelo** con BUG-05 y BUG-06 en su propio
worktree si interesa acortar el camino.

El orden manda en un punto: **la tarea 2 antes que la 4**. El caso de la interpolación a
mitad de declaración es el único que puede romper CSS de usuario, y si se escribe después de
tener el compactador ya hecho, se escribe para que pase.

---

## Fase 1 — Rojo primero (3)

- [x] **1. El CSS emitido sale con su indentación.**
      En `packages/compiler/test/`: el `export const css` de un componente con CSS indentado
      contiene saltos de línea y tiradas de espacios. **Verlo pasar en verde hoy** — es la
      afirmación que la corrección invierte (§6.1).
- [x] **2. La interpolación a mitad de declaración.**
      Fixture nuevo: `.badge { padding: @(size)rem @(size * 2)rem; }`. Assert de que la
      expresión se emite **byte a byte** y de que el espacio que separaba las dos se
      conserva. Contra el código de hoy pasa (todo es verbatim); tiene que **seguir
      pasando** después de la tarea 4. Es el guardarraíl del BUG (§6.2, §4.2).
- [x] **3. Equivalencia del CSS.**
      Helper de test que parsea dos hojas con `CSSStyleSheet` y compara reglas y
      declaraciones. Sobre los fixtures canónicos, hoy compara el CSS consigo mismo y pasa;
      después de la tarea 4 es lo que demuestra que compactar no cambió nada (§6.5).

## Fase 2 — Usar el AST que ya existe (2)

- [x] **4. `componentCss` se construye desde `StyleNode`.**
      `packages/compiler/src/emit/module.ts:87-93`: dejar el `source.slice(...)` y recorrer
      `StyleNode.parts` (§3.1). `CssText` se compacta; `RazorExpression`, `AtEscapeNode` y
      `RazorCommentNode` van verbatim (§4.1). Aprovechar que los `parts` tapizan el span sin
      huecos ni solapes — está documentado en `packages/compiler/src/css/nodes.ts` y es lo
      que hace que el recorrido sea completo por construcción.
      Verde en 1 invertido; **2 y 3 tienen que seguir verdes**.
- [x] **5. Compactar sin cruzar interpolaciones.**
      Dentro de cada `CssText`: tiradas de whitespace a un espacio, sin espacio alrededor de
      `{`, `}`, `;` y `:`. **Nunca** entre dos partes (§4.2). Los comentarios CSS se
      conservan (§4.3).

## Fase 3 — Lo que no se puede romper (3)

- [x] **6. El enlazado de assets sigue igual.**
      Un `url(./logo.png)` dentro del CSS compactado se sigue convirtiendo en import y
      `linker.cssTemplate` (`module.ts:107`) lo resuelve igual (§6.4). El orden de
      `componentCss` → `cssTemplate` no cambia.
- [x] **7. Los source maps no se degradan.**
      Las posiciones de las interpolaciones del `<style>` siguen resolviendo a su offset del
      `.fud` (§6.6). Es la regresión de SDD-13 sobre CSS y la razón de que las partes no
      `css-text` se emitan verbatim.
- [x] **8. Extremo a extremo.**
      Los 16 tests de `examples/basic/tests/` en verde y las cinco páginas sin diferencias
      visuales (§6.7).

---

## Cierre del BUG

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [x] Lo nuevo al **100 %** en las cuatro métricas; `packages/compiler` no baja de ramas
      respecto a `main`.
- [x] Anotar en el registro de progreso el tamaño del `<style>` de `dist/index.html` y de un
      chunk representativo, antes y después.
- [x] Marcar BUG-08 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [x] Anotar en [SDD-09](../SDD-09-css-razor.md) que el emit compacta el `CssText` y deja
      verbatim las demás partes, y en [SDD-15](../SDD-15-emit.md) que `componentCss` sale del
      AST y no del fuente, con enlace a este BUG.
