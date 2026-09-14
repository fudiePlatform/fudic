# BUG-34 · El plugin reconstruye la tabla de rutas reactivas en cada `transform`

> **Estado:** `Hecho`
> **Corrige:** [SDD-39 — Rutas reactivas](../SDD-39-rutas-reactivas.md) §4.7
> **Paquetes:** `@fudic/vite`
> **Rango:** reutiliza el de SDD-39; **no** reserva códigos nuevos

---

## 1. Contexto y síntoma

`pnpm build` de `examples/basic` termina bien y con la salida correcta, pero rolldown
avisa:

```
[PLUGIN_TIMINGS] Your build spent significant time in plugin `fudic`.
See https://rolldown.rs/options/checks#plugintimings for more details.
```

El aviso es un *check* de rolldown activado por defecto (`checks.pluginTimings`). Medido
contra rolldown 1.0.3 con un plugin de prueba que duerme una cantidad fija:

- **Solo cuenta el hook `transform`.** `buildStart`, `resolveId`, `load`, `renderChunk` y
  `generateBundle` durmiendo 2 000 ms no disparan nada; `transform` sí.
- **El umbral está entre 1 400 y 1 500 ms** acumulados en ese hook, para ese plugin.

Y el plugin estaba justo encima. Instrumentando cada hook de `fudic` sobre
`examples/basic`:

```
transform        1415,0 ms  x226      ← el que cuenta
generateBundle   1187,5 ms  x1
load              168,6 ms  x225
buildStart        152,8 ms  x1
resolveId           0,3 ms  x477
```

Desglosando el `transform` por rama:

```
.fud                1323,2 ms  x57
  └─ transformFud   1279,4 ms  x57     ← 22,4 ms por fichero
?client               86,4 ms  x42
erase (non-fud)        1,5 ms  x126
?ioc                   1,4 ms  x1
```

**El 90 % del hook que dispara el aviso está en `transformFud`, y el 96 % de eso no es
compilar.** En `main`, antes de SDD-39, la misma llamada costaba 3,4 ms por fichero.

El síntoma es un aviso, pero lo que hay debajo no lo es: el build del ejemplo tardaba
3,47–3,78 s, y más de un segundo de ese tiempo era trabajo repetido.

---

## 2. Causa raíz

### 2.1. La fábrica se llama por módulo, no por pase

[`packages/vite/src/plugin.ts:187`](../../../packages/vite/src/plugin.ts) —una línea:

```ts
const routeNameOf = (path: string): string | undefined => routeNameLookup(builds, io)(path);
```

`routeNameLookup` **es una fábrica**: construye el `Map` completo y devuelve el lector.
Su propia cabecera lo dice —*«One lookup, resolved once per pass»*— y así lo usan los
otros dos pases, que la sacan del bucle:

```ts
// link.ts:82   const routeNameOf = routeNameLookup(builds, io);
// edge.ts:66   const routeNameOf = routeNameLookup(builds, io);
```

En el plugin anfitrión la invocación quedó **dentro** de la flecha. Cada llamada a
`routeNameOf(path)` construye la tabla entera y la tira.

### 2.2. Lo que cuesta construirla

`routeNameLookup` llama a `discoverReactiveRoutes`, que para **cada** ruta no excluida
hace `resolveDocument(rb.absPath, io)` — leer el `.fud`, parsearlo, resolver su grafo de
componentes y su cadena de layouts, y preguntar `isReactiveRoute`.

En `examples/basic`: 16 rutas × 57 ficheros `.fud` transformados ≈ **900 resoluciones de
grafo** para contestar 57 veces una pregunta cuya respuesta no cambia durante el build.

El coste no existía antes de SDD-39 porque el argumento `routeName` no existía: la línea
nació con la funcionalidad, con la forma equivocada.

### 2.3. Alcance — dónde más aparece la misma forma

Los otros trece puntos del paquete que llaman a `discoverComponents`,
`discoverReactiveRoutes`, `routeNameLookup` o `routeUsesDi` se comprobaron uno a uno:

| sitio | frecuencia | veredicto |
|---|---|---|
| `link.ts:82`, `edge.ts:66` | una vez por pase | correcto, izado fuera del bucle |
| `plugin.ts:517`, `545`, `546` | `buildStart`, una vez | correcto |
| `plugin.ts:591` (`load` de `MAIN_ID`) | una vez | correcto |
| `plugin.ts:617` (`load` del wrapper) | una vez por ruta | correcto |
| `plugin.ts:1004`, `1009` (`generateBundle`) | una vez | correcto |
| `plugin.ts:170`, `177` (`devClientModuleId`) | una por petición de DEV | **no es defecto**, ver abajo |

`devClientModuleId` tiene la misma forma —la fábrica dentro de la función— pero no el
mismo defecto: en dev, `plugin.ts:336` reasigna `builds` en **cada petición** a propósito
(«dev adds/removes files: re-read on each request»), así que ahí no hay nada que
conservar entre llamadas. Un memo no ahorraría una lectura y sí podría servir un módulo
obsoleto tras editar un componente.

**La causa raíz es una línea**, y el alcance es esa línea.

---

## 3. Interfaz pública

**No cambia ninguna firma.** Ni `routeNameLookup`, ni `discoverReactiveRoutes`, ni
`transformFud`, ni las opciones del plugin. El defecto está entero en cómo el plugin
anfitrión usa una función que ya estaba bien escrita.

---

## 4. Comportamiento corregido

El plugin conserva el lector y lo reconstruye **solo cuando cambia el conjunto de rutas**:

```ts
let routeNames: {
  readonly from: readonly RouteBuild[];
  readonly of: (path: string) => string | undefined;
} | null = null;
const routeNameOf = (path: string): string | undefined => {
  if (routeNames === null || routeNames.from !== builds) {
    routeNames = { from: builds, of: routeNameLookup(builds, io) };
  }
  return routeNames.of(path);
};
```

Tres reglas:

1. **La invalidación es por IDENTIDAD de `builds`**, no por tiempo ni por contador.
   `discoverRoutes` devuelve un array **nuevo** cada vez que se ejecuta, y se ejecuta
   exactamente cuando el árbol de rutas puede haber cambiado.
2. **En build se construye una vez.** `builds` se asigna en `buildStart` (`plugin.ts:460`)
   y no se vuelve a tocar: los 57 `transform` comparten una tabla.
3. **En dev no cambia nada.** `plugin.ts:336` reasigna `builds` en cada petición, así que
   la identidad difiere siempre y el lector se reconstruye igual que antes. Un `.fud` que
   pasa a ser reactivo mientras el servidor corre se ve en la petición siguiente, como
   hasta ahora.

No es un `const` calculado al construir el plugin porque en ese momento `builds` está
vacío: la fábrica **tiene** que ser perezosa.

---

## 5. Invariantes

**El que violaba.** El que la propia cabecera de `routeNameLookup` enuncia: *una tabla por
pase*. Los tres pases que compilan un módulo de render tienen que ver el mismo mapa
`ruta → nombre`, y eso se garantiza resolviéndolo una vez, no repitiéndolo hasta
coincidir.

**Los que añade.**

- **El hook `transform` compila; no descubre.** Lo que no depende del módulo que se está
  transformando se resuelve antes de entrar en él. Es el invariante que el aviso de
  rolldown mide, y por eso el aviso vale como test de regresión.
- **Un caché del plugin se invalida por el dato del que deriva**, nunca por suposición
  sobre la fase. `builds` es lo que hace variar la respuesta, así que `builds` es lo que
  decide si el caché sigue siendo válido.

---

## 6. Criterios de aceptación

> Los tests los escribe otra sesión. Aquí queda lo que tienen que afirmar.

1. **La tabla se construye una vez por build.** Con un `ResolveIo` instrumentado que
   cuenta lecturas, el número de resoluciones de documento sobre las rutas **no crece**
   con el número de `.fud` transformados. Falla contra el código roto: hoy crece
   linealmente.
2. **Reasignar `builds` invalida.** Transformar un `.fud`, sustituir `builds` por un array
   nuevo en el que la ruta pasa a ser reactiva, y comprobar que la segunda llamada
   publica el nombre nuevo. Es lo que sostiene el dev server.
3. **La salida no cambia.** El listado de ficheros emitidos por `examples/basic` es
   idéntico antes y después, hashes y build id incluidos. *(Comprobado a mano al cerrar:
   109 ficheros, diff vacío.)*
4. **El aviso no vuelve.** `vite build` de `examples/basic` no emite `PLUGIN_TIMINGS`.

### Medido al cerrar

| | antes | después |
|---|---|---|
| hook `transform` | 1 415,0 ms | **264,9 ms** |
| `transformFud` (57 llamadas) | 1 279,4 ms | — |
| build de `examples/basic` | 3,47 / 3,78 s | **2,58 / 2,75 / 2,93 s** |
| `PLUGIN_TIMINGS` | sí | **no** (3 builds seguidos) |
| ficheros emitidos | 109 | 109, lista idéntica |

---

## 7. Fuera de alcance

Lo que se midió, es lento y **no** se toca aquí:

- **`generateBundle`, 1 187 ms.** Son tres builds anidados de Vite —el pase de enlace, el
  del edge y el del Service Worker— más el prerender. Es el diseño, no un defecto, y no
  cuenta para el aviso.
- **`loadWithSourceMap`, ~170 ms en `load`.** Encadena el mapa que cada `dist/*.js` ya
  trae (BUG-31), y lo hace sin caché: los mismos ficheros de `@fudic/core`, `ssr` y
  `transport` se leen y se parsean en los cuatro builds. Es trabajo repetido y tiene
  arreglo, pero es otra causa, otro fichero y no afecta al aviso.
- **`devClientModuleId`.** Misma forma, ningún defecto: §2.3.
- **El propio compilador.** 265 ms para 57 `.fud` es lo que cuesta compilar; aquí no se
  optimiza nada del emit.
