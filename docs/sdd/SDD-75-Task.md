# SDD-75 — Tareas

> **SDD:** [SDD-75 — El editor del `.fudapi`](./SDD-75-editor-del-fudapi.md)
> **Paquetes:** `@fudic/language-server` · `@fudic/api` · `@fudic/vscode`
> **Rama:** `sdd-75-editor-del-fudapi`. Nace de `main` **con SDD-74 en `Hecho`**.
> **Progreso:** 5 / 9 — `Listo`.

---

## Mapa de dependencias

```
1 snippets ─→ 2 tests
3 índice de implementaciones ─→ 4 lentes de implementación ─→ 5 tests
6 lentes de la línea 1 + comandos ─→ 7 documentos virtuales y regenerar ─→ 8 tests
2, 5, 8 ─→ 9 prueba de Pedro y cierre
```

---

## Fase 1 — snippets (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Snippets por contexto**, en lugar de la palabra suelta, con el sangrado de la línea (SDD §3.1, §4.1) | `language-server` | `src/fudapi/completion.ts` |
| [x] | 2 | 1 | **Los tests de la fase.** Criterios 1–6 | `language-server` | `test/**` |

## Fase 2 — implementaciones (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | — | **Índice** de `.handle`/`.check`/`.client`/`.server` por `<id>` y nombre, un parseo de Oxc por fichero, actualizado con los eventos de fichero (SDD §4.2) | `language-server` · `vscode` | `src/fudapi/implementations.ts` · `src/client-options.ts` (`FILE_EVENTS`) |
| [x] | 4 | 3 | **Lentes** encima de cada declaración que se implementa (SDD §3.2) | `language-server` | `src/fudapi/lenses.ts` · `src/fudapi/service.ts` |
| [x] | 5 | 4 | **Los tests de la fase.** Criterios 11–15 | `language-server` | `test/**` |

## Fase 3 — lo generado (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 6 | — | **Lentes de la línea 1** y los cinco comandos (SDD §3.2, §3.3) | `language-server` · `vscode` | `src/fudapi/service.ts` · `package.json` · `src/commands/api.ts` |
| [ ] | 7 | 6 | **`Server`/`Browser`** por el proveedor virtual, refrescados; **`Regenerate`** forzado con dependientes; el caso con errores (SDD §4.3) | `language-server` · `vscode` | `src/fudapi/**` · `src/virtual-doc-provider.ts` |
| [ ] | 8 | 7 | **Los tests de la fase.** Criterios 7–10, 16, 17 | `language-server` · `vscode` | `test/**` |

## Fase 4 — cierre (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | 2, 5, 8 | **Cobertura** (criterio 18), prueba de Pedro en VS Code, INDEX y estado | — | — |
