# SDD-45 — Tareas

> **SDD:** [SDD-45 — El runtime se publica, no se empaqueta](./SDD-45-runtime-publicado.md)
> **Paquetes:** `@fudic/core` · `@fudic/dom` · `@fudic/forms` · `@fudic/di` ·
> `@fudic/conventions` · `@fudic/vite` · `@fudic/example-basic`
> **Rama:** `sdd-45-runtime-publicado`
> **Progreso:** 0 / 11
> **Bloqueado por:** [SDD-43](./SDD-43-librerias.md) — la tarea 11 de aquel SDD es el
> `peerDependencies` que aquí se endurece, y su criterio 12 es el workspace sobre el que se
> mide la evidencia de este. **Va después de la 44**, que es donde acaba la tanda.

Once tareas. El orden manda en un punto y es el primero: **la tarea 2 antes que todas las
demás**. Si los paquetes de runtime no producen bytes idénticos entre dos construcciones, no
hay nada que compartir y el resto del SDD no tiene sentido — es la propiedad sobre la que se
apoya todo, y se afirma con un test antes de escribir el enlazador.

---

## Mapa de dependencias

```
1 el directorio ──→ 2 LOS BYTES SON LOS MISMOS ──→ 3 publicar ──→ 4 enlazar ──→ 5 copiar
                                                                                    │
                                                        6 la poda se conserva ──────┤
                                                        7 dos apps, una descarga ───┤
                                                        8 dos versiones ────────────┤
                                                        9 FUD0800 ──────────────────┤
                                                       10 dev intacto ──────────────┤
                                                                                    └→ 11 cierre
```

---

## Fase 1 — la propiedad de la que cuelga todo (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **El nombre del directorio.** `RUNTIME_DIR = '_fudic'` en `@fudic/conventions`, que es donde cabe por su propia regla: un nombre que dos paquetes deben acordar —el que publica y el que enlaza— y ninguno posee. Empieza por `_` para que ninguna ruta de aplicación pueda colisionar | `conventions` | `src/index.ts` |
| [ ] | 2 | 1 | **(rojo primero)** **Los bytes no dependen de quién construya.** Construir un paquete de runtime dos veces produce ficheros **idénticos byte a byte**. Es el criterio 2 y es la condición de existencia del SDD: si esto no se sostiene, compartir es imposible por mucho que la URL coincida. Se escribe antes que el publicador y se ve fallar si el build arrastra fechas, rutas absolutas o cualquier cosa del entorno | `core` | `test/reproducible.test.ts` |

---

## Fase 2 — publicar (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 3 | 2 | **Los cuatro paquetes publican su runtime.** Además del `dist` que consume un bundler, un directorio `runtime/` con **una unidad por módulo público**, minificada, importándose entre ellas por ruta relativa. `@fudic/core`, `@fudic/dom`, `@fudic/forms` y `@fudic/di`. La frontera no se inventa: es la que el build ya produce hoy (§1.3). Criterio 1 | `core` · `dom` · `forms` · `di` | `tsconfig.runtime.json` · `scripts/` |

---

## Fase 3 — enlazar (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 4 | 3 | **(rojo primero)** **El plugin enlaza en vez de empaquetar.** Los imports de `@fudic/core` y hermanos dejan de entrar en el bundle y se reescriben a `/_fudic/<version>/<unidad>.js`, con la versión del `package.json` resuelto y **sin** el `base` de la app. El autor sigue escribiendo `@fudic/core` y esa es la única superficie que ve (§4.1). Se ve fallar antes: hoy emite `assets/signal-<build>.js`. Criterios 3, 4 | `vite` | `src/runtime-link.ts` · `src/plugin.ts` |
| [ ] | 5 | 4 | **Copiar al `dist` lo que se enlaza, y solo eso.** Un `dist` sigue siendo un árbol completo y desplegable solo — es lo que permite desplegar dos apps por separado y en cualquier orden. Y `FUD0802`: si el destino ya tiene esa unidad con bytes distintos, se avisa, porque significa que alguien publicó dos veces la misma versión con contenido distinto | `vite` | `src/runtime-link.ts` |
| [ ] | 6 | 5 | **La poda se conserva, y se mide.** Una app que no usa signals derivadas no emite `computed.js`. Se cuenta sobre el `dist`, no se razona. Compartir no puede costarle a la app pequeña llevarse lo de la grande. Criterio 5 | `vite` | `test/runtime-prune.test.ts` |

---

## Fase 4 — lo que esto compra (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 7 | 6 | **Dos apps, una descarga.** El caso de §4.4, que es el que motiva el SDD entero: un build con `signal` y otro con `signal` y `computed` producen el **mismo** `signal.js` byte a byte, y solo el segundo produce `computed.js`. Criterio 6 | `vite` | `test/runtime-share.test.ts` |
| [ ] | 8 | 6 | **Dos versiones conviven.** Dos directorios, ninguno pisa al otro, y la versión se **lee** en la URL sin traducir nada. Criterio 7 | `vite` | `test/runtime-versions.test.ts` |
| [ ] | 9 | 6 | **`FUD0800`: la librería manda.** El rango de `peerDependencies` de una librería del grafo que no incluye la versión resuelta **rompe el build**, con la librería, su rango y la versión en el mensaje. Sube de warning a error respecto a SDD-43 §4.7, y el motivo está en §4.6: desde que las versiones mezcladas son una promesa, un aviso describe algo que rompe tarde. `FUD0762` queda anotado como superado. Criterio 8 | `vite` | `src/peer-check.ts` |

---

## Fase 5 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | 7, 8, 9 | **La evidencia, en un navegador.** El workspace de [SDD-43](./SDD-43-librerias.md) criterio 12 —dos apps, dos librerías— desplegado en un origen: la pestaña de red de la segunda app **no descarga ni un byte de framework** que la primera ya trajo, y `Application → Cache Storage` lo confirma. En Chrome real. Y `pnpm dev` sin `_fudic/`, igual que hoy (§4.8). Criterios 9, 10 | `examples` | `examples/workspace/*` |
| [ ] | 11 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 11 criterios de §6 verdes — con los dos de «rojo primero» (2 y 4) vistos fallar antes. El código nuevo al 100 % en las cuatro métricas y ningún paquete por debajo de donde empezó. SDD-45 a `Hecho` en [INDEX.md](./INDEX.md), con su fila y su línea de progreso | — | [INDEX.md](./INDEX.md) |
