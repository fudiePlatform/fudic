# BUG-43 — Tareas

> **BUG:** [BUG-43 — Un `<link>` se escribe a ciegas](./BUG-43-el-link-que-ofrece-la-plantilla.md)
> **Paquetes:** `@fudic/language-server` · `@fudic/resolve` · `fudic-vscode` (README)
> **Rama:** `bug-43-link-rel-href`, creada desde `bug-42-formularios-desde-la-vista` y trabajada en
> el mismo worktree (`.claude/worktrees/bug-41-validacion-y-hueco-de-error`), por indicación de
> Pedro: el BUG se redacta al terminar, y se sale del worktree con todo cerrado
> **Progreso:** 9 / 9

---

## Fase 1 — Qué se puede enlazar

- [x] 1. `@fudic/resolve`: `specifierOf(pkg, file, io)`, la inversa de `exports` (sin campo,
  subruta exacta, patrón de un `*`, mapa de condiciones). Al 100 %.
- [x] 2. `WorkspaceIndex.linker(fromFile)`: mismo paquete → relativa; librería de su cadena →
  especificador; lo demás, nada.
- [x] 3. El `href`, la etiqueta de un componente sin enlazar y la acción de `FUD0191` pasan a
  usar `linker`.

## Fase 2 — `rel` y los valores de un `<link>`

- [x] 4. `linkValueAt(region)`: cualquier valor de cualquier `<link>`, clasificado o no.
- [x] 5. El plugin de etiquetas calla en los valores de un `<link>` y responde `rel` con
  `component` · `layout` · `snippet` (`relCompletions`, `isUndecided`).

## Fase 3 — Snippets

- [x] 6. `link-component`, `link-snippet` (nivel superior / `<head>` según el rol) y
  `link-layout` (solo en un fichero por decidir), con `suggest` para abrir la lista del `href`.
- [x] 7. README de la extensión: la tabla de los tres snippets y qué ofrece el `href`.

## Cierre

- [x] 8. `pnpm typecheck`, `pnpm test`, `pnpm build` en verde; `language-server` y `resolve`
  al 100/100/100/100.
- [x] 9. Sondeo con el servidor real contra `examples/workspace` (criterio 6); `INDEX.md` de
  bugs y el maestro, tabla y registro.
