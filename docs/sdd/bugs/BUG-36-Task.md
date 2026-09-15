# BUG-36 — Tareas

> **BUG:** [BUG-36 — En dev ningún `.fud` tiene source map](./BUG-36-mapas-de-dev.md)
> **Paquetes:** `@fudic/vite`
> **Rama:** `worktree-worktree-sdd-39-rutas-reactivas` (salió diagnosticando SDD-39; el
> defecto es anterior y de otro paquete)
> **Progreso:** 3 / 3

El mismo orden que su hermano: **primero la corrección**, Pedro pone el punto de
interrupción en el navegador, y los tests después, vistos fallar revirtiendo la línea.

---

## Mapa de dependencias

```
1 el mapa se escribe  ──→  2 el breakpoint se pone  ──→  3 los cuatro criterios
       (hecho)                  (hecho, Pedro)                 (hecho)
```

---

## Fase 1 — la corrección (1, 2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El middleware escribe las dos mitades.** `withInlineSourceMap(code, map)` adjunta el mapa como `data:` URI —inline, porque el módulo no es un fichero y no hay segunda URL que servir— y devuelve el código tal cual cuando no hay mapa o no tiene `mappings`. El middleware de `configureServer` lo usa en lugar de escribir solo `result.code`. §3, §4 | `vite` | `src/dev.ts` · `src/plugin.ts` |
| [x] | 2 | 1 | **Probado donde se ve.** `pnpm dev`, DevTools › Sources: el `.fud` aparece y el punto de interrupción se pone y salta. Los dos chunks del ejemplo pasan de 0 a 1 `sourceMappingURL`; `fudic-main.js` sigue sin mapa, que es lo correcto | — | `examples/basic` |

---

## Fase 2 — los tests (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | 1 | **(visto fallar revirtiendo la 1)** **Los cuatro criterios.** Contra un servidor de dev real: el módulo servido trae el comentario, y el mapa decodificado nombra el `.fud` y trae su `sourcesContent`. Más los tres caminos del helper —codifica y no toca el código, sin mapa, con `mappings` vacío—. Criterios 1–4 | `vite` | `test/dev.test.ts` · `test/dev-unit.test.ts` |

---

## Notas

- **Dos ficheros de test y no uno**, porque son dos preguntas distintas: si el helper
  codifica bien es un unitario, y si el middleware lo usa solo lo puede contestar un
  servidor de dev de verdad. El segundo es el que cae al revertir la línea.
- **Fichero de `src` no hay ninguno nuevo.** El helper vive en `src/dev.ts`, que es donde
  están los otros ayudantes del servidor de dev, y `plugin.ts` cambia una línea. Lo que
  nace al 100 % es el helper: tres caminos, cuatro tests, sin un solo `ignore`.
- **El suelo del paquete sube.** 96,19 / 90,17 / 96,37 / 96,09 → 96,20 / 90,21 / 96,38 /
  96,10. Las líneas sin cubrir de `dev.ts` que quedan son de `devClientUrl`, anteriores a
  este BUG.
- **Lo que este BUG deja anotado y no toca** está en §7: los bootstraps siguen sin mapa a
  propósito, y `loadWithSourceMap` sin caché sigue donde BUG-34 §7 lo dejó.
