# BUG-57 — Tareas

> **BUG:** [BUG-57 — `@fudic/http` no se publica como pieza, y `conventions` llega suelto al navegador](./BUG-57-http-como-pieza-del-runtime.md)
> **Paquetes:** `@fudic/http` · `@fudic/vite` · `examples/pieces-bench`
> **Rama:** `sdd-68-llamadas-sin-fontaneria` (a petición de Pedro: se cierra el producto aquí)
> **Progreso:** 2 / 2 — `Hecho`.

---

## Fase 1 — `http`, una fila más

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **Las piezas de `http`** (`contract`, `json`), su `rolldown.config.ts` con las fronteras y la forma de `forms`, `fudic.runtime` y `build:runtime`; el enlace de un paquete que se importa a sí mismo; las excepciones de la mitad de servidor en la comprobación. Criterios 1–5 | `http` · `vite` · `examples/pieces-bench` | `bundle/contract.ts` · `rolldown.config.ts` · `package.json` · `tsconfig.json` · `src/runtime-link.ts` · `src/plugin.ts` · `test/runtime-link.test.ts` · `check.mjs` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [x] | 2 | `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; BUG-57 a `Hecho` con su fila y su entrada en `bugs/INDEX.md` |

## Notas de la implementación

- **Tamaños.** `http/contract` 17,3 kB (6,9 kB gzip), `http/json` 1,1 kB (0,6 kB gzip). El chunk
  de `/usuarios` pasa de 15,9 kB a 1,9 kB: lo que llevaba de `http` ahora es la pieza, que se
  cachea y se comparte entre aplicaciones del origen.
- **Un primer intento descartado.** Importar el registro de `forms` desde la raíz generada en vez
  de desde `@fudic/http/contract` rompía las aplicaciones que dependen de `http` sin declarar
  `forms` (`i18n-serve.test.ts`). La pieza reexporta esos nombres por la URL de `forms/contract`.
- **La comprobación de piezas ya estaba en rojo antes** por `core`, `di`, `dom` e `i18n`, y por
  `conventions` dentro de tres piezas (`http/contract` es la cuarta: son constantes, y copiarlas
  es lo buscado). Nada de eso es de este BUG; ningún valor de `http` queda sin pieza.
- **Suelos.** `http` 100 / 100 / 100 / 100 (la pieza nace de `bundle/`, fuera del denominador
  igual que en `forms`). `vite` 99,03 / 96,28 / 99,71 / 99,14, por encima de su suelo.
- Playwright entero: 283 en verde, 4 saltados.
- **Tras la prueba de Pedro.** DevTools seguía listando `conventions/dist/index.js` entero, con
  sus comentarios: no es una descarga, es la fuente que el mapa de cada pieza declara para las
  constantes que lleva copiadas. Las cuatro piezas que las copian (`core/route-data`,
  `http/contract`, `transport/urls`, `i18n/href`) lo marcan ahora en su `ignoreList`, y Chrome
  oculta del árbol lo que está en esa lista. La marca sobrevive a la copia al `dist`.
