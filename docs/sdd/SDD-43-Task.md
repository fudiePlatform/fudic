# SDD-43 — Tareas

> **SDD:** [SDD-43 — Librerías fudic: qué se publica y cómo se resuelve](./SDD-43-librerias.md)
> **Paquetes:** `@fudic/resolve` (**nuevo**) · `@fudic/vite` · `@fudic/cli` ·
> `@fudic/language-server` · `@fudic/compiler` · `@fudic/config` (consumido, no modificado)
> **Rama:** `sdd-43-librerias`
> **Progreso:** 13 / 13
> **Bloqueado por:** [SDD-41](./SDD-41-configuracion-de-aplicacion.md) — `kind: "lib"` es lo que
> hace descubrible una librería. Conviene, no es obligatorio, tener
> [SDD-44](./SDD-44-cli-de-workspace.md) para generar el caso de prueba en vez de escribirlo a
> mano.

Trece tareas, y **la primera no es código**. Doce en el plan original; la **2b** la sacó la
medición.

**La 1 antes que todo, y su resultado cambia las demás.** En un workspace pnpm,
`node_modules/@acme/ui` es un symlink al directorio real bajo la raíz, así que el barrido del
índice puede que ya vea esos `.fud` y un `href` relativo puede que ya resuelva. Medirlo cuesta
una tarde; especificar lo que ya funciona cuesta un documento y dos rondas de tests. **Lo que
salga en verde se marca aquí como hecho, con el commit que lo demuestra, y no se
reimplementa.**

Después, dos ramas que no se tocan: la **resolución** (2–5) y el **índice** (6–8). Pueden ir
en paralelo.

---

## Mapa de dependencias

```
1 LA MEDICIÓN ──┬──→ 2 resolutor ─┬→ 3 href de paquete ──→ 4 FUD0760 ──→ 5 FUD0763
                │     2b href literal ┘
                │
                ├──→ 6 findLibraries ──→ 7 índice + Program ──→ 8 solo lectura
                │
                └──→ 9 tags del grafo ──→ 10 cadena de guías ──→ 11 peer ──→ 12 cierre
```

---

## Fase 1 — la medición (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El informe, no el código.** Un workspace con una app y una librería, la app enlazando un componente de la librería, y las **cinco preguntas de §4.2** contestadas por escrito: ¿compone el build? ¿está en el índice? ¿`$Props` resuelve o es `any` (medido pasando una prop de tipo incorrecto)? ¿funciona el `href` relativo, y el de paquete? ¿cambia algo con el paquete instalado de verdad en vez de enlazado? Una línea por pregunta, **funciona** o **no funciona y por qué**. Al cerrar la tarea se reescribe este fichero marcando lo que ya está. Criterio 1 | — | `docs/sdd/SDD-43-medicion.md` |

---

**Resultado de la fase 1 → [SDD-43-medicion](./SDD-43-medicion.md).** Nada sale en verde
entero: las once tareas siguen en pie. Lo que la medición cambia es el orden de importancia —
la rama del índice (6–8) arregla un fallo que ya se puede provocar hoy con el `href` relativo,
mientras que la de la resolución (2–5) añade una forma nueva de escribir lo mismo.

**El suelo de cobertura**, medido en `4143ef8`, antes de tocar una línea de `src`. Cada fase
se compara contra esto, no contra el `thresholds` del `vitest.config`. `@fudic/resolve` nace
al 100 en las cuatro y no aparece aquí porque todavía no existe.

| paquete | stmts | branch | funcs | lines |
|---|---|---|---|---|
| `@fudic/compiler` | 99,33 | 98,38 | 99,49 | 99,76 |
| `@fudic/vite` | 96,46 | 91,06 | 96,66 | 96,29 |
| `@fudic/cli` | 93,37 | 89,44 | 93,44 | 95,21 |
| `@fudic/language-server` | 100 | 100 | 100 | 100 |
| `@fudic/language-core` | 100 | 100 | 100 | 100 |

**Y sacó una tarea que no estaba**: `@acme/ui/card.fud` no se podía escribir, porque `@` abre
un `@`-construct y el specifier perdía el scope antes de llegar al resolutor. Decidido: el
`href` de un `<link>` se lee verbatim ([§4.3](./SDD-43-librerias.md)). Es la tarea **2b**, y
va antes que los hosts — sin ella el criterio 2 no se puede cerrar por mucho que se resuelvan
bare specifiers.

---

## Fase 2 — la resolución (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 2 | 1 | **Un resolutor, un paquete.** `@fudic/resolve`, nuevo (SDD-43 §3.1): el andamiaje del paquete —`package.json`, los dos `tsconfig`, `vitest.config.ts` con los cuatro umbrales al 100, README— y la función que resuelve un `href` desde un fichero: relativo contra el directorio, y **bare specifier** con el algoritmo de módulos de Node, `exports` del paquete incluido. Depende de `@fudic/config` y de nada más; los tres hosts lo importan y `@fudic/config` no se toca | `resolve` (nuevo) | `packages/resolve/**` |
| [x] | 2b | 1 | **El `href` se lee literal** (§4.3). En el valor de `href` de un `<link rel="component">` / `<link rel="layout">` no se reconoce ningún `@`-construct: el valor se toma verbatim, y `@acme/ui/card.fud` llega entero al resolutor. Sale de la medición, y sin ella el criterio 2 no se cierra: hoy el parser lee la expresión `@acme` y `linkHref` la descarta en silencio. Nada que hoy tenga significado lo pierde | `compiler` | `src/html/parser.ts` |
| [x] | 3 | 2, 2b | **(rojo primero)** **Los hosts la usan.** `vite/src/io.ts` y el barrido del language server (`node-fs.ts`, sobre el puerto `FileSystemScanner`) pasan a construir su resolución sobre ella. `ResolveIo` **no gana un método** y el compilador no lo toca. Se vio fallar antes: `href="@acme/ui/card.fud"` no encontraba nada. Y el `href` relativo que cruza de paquete **sigue funcionando**. Criterios 2, 3. **La CLI queda fuera, y no por olvido:** hoy no resuelve ningún `href` —solo compara cadenas en `alreadyLinked`— así que no tiene `ResolveIo` que convertir. Lo tendrá cuando aterrice `fudic check` (SDD-35) | `vite` · `language-server` | `vite/src/io.ts` · `ls/src/{types,node-fs,workspace-index}.ts` |
| [x] | 4 | 3 | **`FUD0760`, con sus dos mensajes.** Paquete no instalado y paquete que no exporta el fichero son dos arreglos distintos —`pnpm add` frente a abrir el `package.json` de la librería— y un mensaje único manda a leer el fichero equivocado. Criterio 4. Va en un paso propio (`checkLinks`) que corre **antes** del recorrido del grafo: el compilador lee cada fichero que alcanza y moría con un `ENOENT` sobre una ruta que el autor no escribió | `vite` | `src/diagnostics.ts` · `src/link-check.ts` |
| [x] | 5 | 4 | **`FUD0763`.** El `href` apunta a un `.fud` de un paquete que no declara `kind: "lib"`. Error: es acoplamiento al interior de algo que no se pensó para consumirse. Criterio 5 | `vite` | `src/link-check.ts` |

---

## Fase 3 — el índice y el editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | 1 | **`findLibraries`.** Recorre las dependencias **declaradas** de cada proyecto, resuelve cada paquete y se queda con los que tienen `fudic.json` con `kind: "lib"`. **La poda de `node_modules` no se toca**: esto no es una excepción a ella, es otra fuente, y su coste es proporcional a las dependencias y no al almacén. Criterio 9 | `language-server` | `src/libraries.ts` · `test/libraries.test.ts` |
| [x] | 7 | 6 | **(rojo primero)** **Al índice y al `Program`.** Los `.fud` de librería entran en `WorkspaceIndex` como un `IndexEntry` más y en `mountWorkspaceFuds`. Es lo que hace que `$Props` sea un tipo y no `any`. Se ve fallar antes con la prueba de BUG-23: pasar una prop del tipo equivocado a un componente de librería y que **no** se marque. Criterios 6, 7, 8 | `language-server` | `src/workspace-index.ts` · `src/project-files.ts` |
| [x] | 8 | 7 | **Solo lectura.** Un `.fud` de librería se navega, se hace hover y se le va a la definición; **no** se publican sus diagnósticos como propios ni se formatea al guardar. El autor de una app no arregla los warnings de una librería (§4.4) | `language-server` | `src/services/read-only.ts` · `src/server.ts` |

---

## Fase 4 — el grafo compartido (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | 3 | **El espacio de tags.** `FUD0761` cuando dos componentes del grafo definen el mismo tag, con los **dos** ficheros en el mensaje; `validateTag` de la CLI comprueba contra el grafo y no solo contra el proyecto; `FUD0622` (SDD-39) igual. El prefijo **sigue sin comprobarse** (§4.5): lo que protege el registro global es el tag repetido, no que todos se llamen igual — y una app no tiene autoridad sobre cómo nombra sus componentes una librería. Criterio 10 | `compiler` · `cli` | `src/emit/resolve.ts` · `cli/src/tag.ts` |
| [x] | 10 | 3 | **La cadena de guías.** La lista adoptada de un componente es la unión de las `styles` de la cadena de dependencias **del paquete que lo define**, de la raíz hacia la hoja, y el componente al final. La hoja del consumidor **no entra**. Es la respuesta a la condición de reapertura de SDD-42 §7. Criterio 11 | `compiler` · `vite` | `src/emit/parts.ts` · `vite/src/styles.ts` |
| [x] | 11 | 3 | **`FUD0762`: la gramática compartida.** La librería declara `peerDependencies` sobre `@fudic/compiler`; un consumidor fuera del rango recibe un warning **una vez por librería**, no uno por fichero. Warning porque un rango conservador de más no debe romper un build que funciona — pero tampoco puede fallar en silencio (§4.7) | `vite` | `src/peer-check.ts` |

---

---

**Resultado de la fase 4**, y las tres cosas que decidió por el camino:

- **`FUD0761` compara lo que el documento alcanza, no la entrada.** Un fichero compilado solo no
  es un documento —nadie ejecuta un `define` por él— y el caso que importa, dos ficheros
  definiendo un tag, lo ve igual la página que compone los dos. Meter la entrada en la
  comparación acusaba a un fichero cuyo único elemento raíz es un tag de componente (que
  estructura *como* componente) de chocar con su propia dependencia.
- **El recorrido de paquetes vive en `@fudic/resolve`**, no en el language server: ahora lo
  preguntan el índice, la CLI (`validateTag` contra las librerías) y el build (la cadena de
  §4.6). `findLibraries` mantiene su firma y su sitio en la interfaz pública; lo que se movió es
  la implementación, más `dependencyChain` y `owningPackage`, que son la misma travesía.
- **La colisión de especificadores entre paquetes es `FUD0741`**, el de `@fudic/config`, aplicado
  a un par nuevo: dos `tokens.css` en la cadena adoptan como `_tokens` y una taparía a la otra en
  el module map. Se reporta una vez, nombrando los dos paquetes, y se queda la primera. No hace
  falta código nuevo del rango porque no es un hecho nuevo.
- **`FUD0622` ya comparaba contra el grafo entero** (`discoverComponents` lo recorre), así que la
  tarea 9 solo añadió la prueba de que un tag de librería cuenta igual. No se reimplementó nada.

---

## Fase 5 — la evidencia y el cierre (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 12 | todas | **La evidencia y el cierre.** Un workspace en `examples/` con una librería de guía, una de componentes y **dos apps** que la comparten — la forma exacta que motivó esta tanda. Construye, el componente compartido sale idéntico en las dos, verificado en Chrome real. Después: `pnpm typecheck`, `pnpm test`, `pnpm build`, los 13 criterios de §6 verdes con los tres de «rojo primero» (2, 6 y el de la tarea 7) vistos fallar antes, cobertura del código nuevo al 100 % en las cuatro y ningún paquete por debajo de donde empezó. SDD-43 a `Hecho` en [INDEX.md](./INDEX.md) | `examples` | `examples/workspace/*` · [INDEX.md](./INDEX.md) |

---

**Resultado de la fase 5.** `examples/workspace` ya tenía las dos apps (las trajo BUG-33); lo
que se le añade es `libs/guia` —tokens y ningún componente— y `libs/ui`, que la consume y define
`ui-card`, sin `vite.config.ts` y sin `dist`. Las dos apps lo enlazan por nombre de paquete y
sale **idéntico** en las dos, con `_tokens _ui ui-card`, mientras cada app pinta sus propios
componentes con su propia hoja (`_tokens _ui _tienda tienda-card`, `_tokens _ui _admin
admin-panel`): las dos ponen `--guia-accent` a colores distintos y la tarjeta compartida no se
entera, que es §4.6 visto desde fuera. Cinco pruebas e2e en Chrome real, las tres de cachés que
ya estaban más dos nuevas. La librería **no lleva script `build`** y eso es a propósito: no hay
nada que construir, y `pnpm -r` la ordenaría antes de los paquetes que necesita.

**Cierre:** `pnpm typecheck`, `pnpm test` (todos los paquetes) y `pnpm build` —examples
incluidos— en verde. Cobertura: `@fudic/resolve` 100 / 100 / 100 / 100 en un paquete nuevo,
`@fudic/language-server` sigue en 100, y contra el suelo de la fase 1 → `compiler`
99,33 / 98,40 / 99,49 / 99,76 (suelo 99,33 / 98,38 / 99,49 / 99,76), `vite`
96,88 / 92,19 / 97,06 / 96,70 (suelo 96,46 / 91,06 / 96,66 / 96,29), `cli`
93,59 / 89,76 / 93,89 / 95,39 (suelo 93,37 / 89,44 / 93,44 / 95,21). Los ficheros nuevos de
`vite` —`link-check.ts` y `peer-check.ts`— con su umbral al 100 escrito en el `vitest.config.ts`.
