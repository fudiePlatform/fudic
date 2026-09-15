# BUG-35 — Tareas

> **BUG:** [BUG-35 — Una ruta reactiva reclama un id y la página no carga el runtime que lo lee](./BUG-35-ruta-reactiva-sin-runtime.md)
> **Paquetes:** `@fudic/compiler`
> **Rama:** `worktree-worktree-sdd-39-rutas-reactivas` (el defecto nace con SDD-39 y se
> arregla donde vive)
> **Progreso:** 3 / 3

El orden es el de este repositorio para un defecto que se ve en el navegador: **primero la
corrección**, Pedro la prueba, y los tests después, escritos contra el código ya arreglado
y vistos fallar revirtiendo la línea.

---

## Mapa de dependencias

```
1 la tercera puerta  ──→  2 probado en el navegador  ──→  3 los ocho criterios
      (hecho)                    (hecho, Pedro)                 (hecho)
```

---

## Fase 1 — la corrección (1, 2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **La ruta es la tercera puerta.** `needsRuntime` recibe `reactiveRoute` y abre con él. Se le pasa `blocks !== undefined` —el resultado de `routeBlocksOf`, la misma expresión que hace al `<body>` reclamar su id— en los dos sitios que preguntan. En `module.ts` esa llamada sube por encima de `writeHeadElements`, que es donde se decide la etiqueta. §3, §4 | `compiler` | `src/emit/maps.ts` · `src/emit/layout.ts` · `src/emit/module.ts` |
| [x] | 2 | 1 | **Probado donde se ve.** `/ruta-evento` pasa de `boot` a `boot + main`, el clic pide el chunk y el `<output>` sube; `/about` sigue con `boot` solo. Chrome, en `vite preview` y en `pnpm dev`. Criterios medidos en §6 | — | `examples/basic` |

---

## Fase 2 — los tests (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | 1 | **(visto fallar revirtiendo la 1)** **Los ocho criterios.** Las tres formas que ahora cargan el runtime —signal en la ruta, manejador solo, página autónoma—, las tres que siguen sin cargarlo —sin mitad de cliente, página autónoma sin ella, ruta reactiva sin nombre—, la que ya funcionaba, y `needsRuntime` en sus tres puertas. Contra la puerta revertida caen 4 de 8. Criterios 1–8 | `compiler` | `test/emit/runtime-tag.test.ts` |

---

## Notas

- **Se afirma sobre el módulo, no sobre el HTML.** `io.runtime` lo pone el wrapper de
  `@fudic/vite`; el compilador decide **si**, y esa decisión es la presencia de la línea
  `io.runtime.main`. Un test que renderizara tendría que fabricar el `io` del otro paquete
  para comprobar una condición de este.
- **El marcador hay que escribirlo.** En una página autónoma el runtime solo aparece donde
  el autor puso `<script src="fudic:runtime">`: BUG-31 §T1 dejó al autor diciendo *dónde* y
  al emit diciendo *si*. Las fixtures de página lo llevan, y sin él el test no mide nada.
- **El suelo del paquete sube.** 99,22 / 98,03 / 99,38 / 99,66 → 99,25 / 98,06 / 99,47 /
  99,70, sin un solo `ignore`. La rama nueva queda cubierta por sus dos caras.
- **Lo que este BUG no toca** está en §7, y lo primero es la regla de SDD-39 §4.5: que un
  `@evento` haga reactiva una ruta es diseño, no defecto.
