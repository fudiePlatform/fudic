# BUG-09 — El código y el fuente de `@server` se publican al cliente

> **Estado:** `Listo`
> **Corrige:** [SDD-19 — Plugin de Vite](../SDD-19-plugin-vite.md) §4.3, §4.6 ·
> [SDD-20](../SDD-20-render-sw.md) §4.5
> **Paquetes:** `@fudic/vite` · `@fudic/compiler`
> **Rama sugerida:** worktree compartido `fix-build-output`
> **Depende de:** [BUG-05](./BUG-05-Task.md) en `Hecho` — la vía B solo existe cuando hay
> mapas, y el ejemplo los tiene activados a propósito para que esto no se vuelva a olvidar.

---

## 1. Contexto y síntoma

Una página con `@code { @server { … } }` publica en `dist/` lo que ese bloque importa. En
`examples/basic`, `routes/blog/index.fud` declara:

```js
@server {
  import { strategy } from '@fudic/core';
  import { listPosts } from '../../data/posts';
  strategy({ mode: 'sw', data: { ttl: '5m', policy: 'cache-first' } });
  export async function load(): Promise<PageData> { … }
}
```

Y el build produce:

```sh
pnpm build && grep -rl "listPosts" examples/basic/dist/
#=> dist/assets/c/blog-CQ0MAJTQ.js.map
#=> dist/assets/posts-B7RTef6s.js.map
#=> dist/sw/c/blog-XDAlemwu.js.map

head -c 120 examples/basic/dist/assets/posts-B7RTef6s.js
#=> var e=[{slug:`declarative-shadow-dom`,title:`Declarative Shadow DOM, sin JavaScript`,…
```

`data/posts.ts` —el módulo cuya cabecera dice *«it only ever runs on the server […] it never
reaches the browser bundle»*— **está en el bundle de cliente, con sus datos en claro**, y lo
importan dos chunks bajo `/assets/`.

En el ejemplo son posts de un blog. En una aplicación real, `@server load` es donde viven
las consultas, las claves de entorno y las URL internas.

**Son dos vías distintas y hay que separarlas**, porque una es de código y otra de fuente:

| | Qué se publica | Desde cuándo |
|---|---|---|
| **A** | El **código**: el wrapper ESM con `load`, y todo lo que `@server` importe | Siempre. Anterior a BUG-05 |
| **B** | El **fuente**: el `.fud` entero dentro de `sourcesContent`, `@server` incluido | Solo con `build.sourcemap` |

---

## 2. Causa raíz

### 2.1. Vía A — el wrapper del edge se emite como chunk del build de cliente

Hay dos wrappers por ruta, y el reparto es correcto sobre el papel: el del link pass excluye
el código de servidor y lo dice
([`link.ts:90`](../../../packages/vite/src/link.ts#L90) — `withLoad: false, // server code
never ships to the client`), y el del edge lo incluye porque resuelve el dato en proceso
([`plugin.ts:397`](../../../packages/vite/src/plugin.ts#L397) — `withLoad: true`).

El defecto no es el flag: es **dónde acaba el segundo**.

[`plugin.ts:349-359`](../../../packages/vite/src/plugin.ts#L349-L359) lo emite con
`this.emitFile({ type: 'chunk', … })` en `buildStart`, o sea como **un chunk más del build de
cliente**. De ahí sale a `dist/assets/c/<ruta>-<hash>.js`, y con él todo su grafo: `load`, el
`@server` que lo rodea y cada módulo que ese bloque importe, que es como `data/posts.ts`
acaba siendo `dist/assets/posts-<hash>.js`.

La regla existe, está escrita, y el otro emisor no la cumple.

### 2.2. Y nadie del navegador lo necesita

Lo que hace que la corrección sea posible sin rediseñar nada: el `esm` del manifest **solo lo
consume Node**.

- [`plugin.ts:620`](../../../packages/vite/src/plugin.ts#L620) — `importEsmChunk` hace
  `join(outDir, record.esm)` y un `import()` de **fichero**, no de URL.
- Sus dos llamantes son la middleware de `vite preview`: `previewRender`
  ([`plugin.ts:318`](../../../packages/vite/src/plugin.ts#L318)) y `previewData` para el
  endpoint `/_fudic/data` ([`plugin.ts:291`](../../../packages/vite/src/plugin.ts#L291)).
- El prerender no usa el fichero publicado, sino el bundle materializado en un temporal
  ([`prerender.ts:51-58`](../../../packages/vite/src/prerender.ts#L51-L58)).
- En `@fudic/transport`, `esm` se **declara**
  ([`manifest.ts:66`](../../../packages/transport/src/manifest.ts#L66)) y no lo lee nadie. El
  Service Worker renderiza con `chunk` (el del link pass), no con `esm`.

Ningún consumidor de navegador. El wrapper del edge es un artefacto de servidor que estaba
saliendo por la puerta del cliente.

### 2.3. Vía B — el mapa lleva el `.fud` entero

[`transform.ts:60-71`](../../../packages/vite/src/transform.ts#L60-L71) construye el mapa con
`sourceContent: source`, donde `source` es el `.fud` **tal cual**, con su `@code`, su
`@server` y sus imports. Va embebido en `sourcesContent`, así que cualquier `.map` publicado
de un chunk que venga de ese `.fud` lo lleva dentro — el del link pass y el de los chunks de
componente por igual.

Y es contenido embebido, no una referencia: no basta con que `routes/blog/index.fud` no
exista en el servidor.

### 2.4. Alcance

- **Toda ruta con `@server`**, no solo las del ejemplo.
- **Todo módulo que `@server` importe**, transitivamente. `data/posts.ts` es un fichero
  plano; podría ser un cliente de base de datos con su cadena de conexión.
- **`fudic-routes.json` publica las URL** de esos chunks en su campo `esm`: el fichero no
  solo es alcanzable, está anunciado.
- **`vite preview` los sirve** como estáticos, igual que cualquier host estático servirá
  `dist/` entero.
- La vía B alcanza también a `dist/assets/posts-*.js.map`, que embebe `data/posts.ts`
  completo — pero eso desaparece solo cuando A esté arreglado: sin el chunk no hay mapa.

---

## 3. Interfaz pública

### 3.1. Los wrappers del edge salen del build de cliente

Pasan a un **tercer build anidado**, el mismo patrón que ya usan el Service Worker y el link
pass, y se escriben **fuera de `outDir`**:

```ts
/** Dónde se escriben los artefactos que solo ejecuta el servidor. Hermano de `outDir`. */
export const EDGE_DIR = '.fudic/edge';

export interface EdgeResult {
  /** Patrón de ruta → fichero escrito, relativo a `EDGE_DIR`. */
  readonly entries: ReadonlyMap<string, string>;
}

export function runEdgePass(
  root: string, base: string, builds: readonly RouteBuild[],
  io: ResolveIo, nested: NestedOutputOptions,
): Promise<EdgeResult>;
```

`dist/` deja de contener ni el wrapper ni nada que solo él arrastraba.

### 3.2. `RouteRecord.esm` deja de publicarse

El campo sigue existiendo en `@fudic/transport` —es opcional y algún día lo usará un
despliegue edge de verdad—, pero **el manifest publicado no lo emite**: era una URL de
cliente para un fichero que ningún cliente pide. La preview resuelve el fichero por
convención, `EDGE_DIR/<safeName(pattern)>.js`, sin pasar por el manifest.

### 3.3. El mapa recibe un fuente redactado

```ts
/** El `.fud` con las regiones `@server` en blanco, conservando cada offset (§4.3). */
export function redactServerRegions(source: string, doc: ComponentDocument): string;
```

`buildMap` ([`transform.ts:65`](../../../packages/vite/src/transform.ts#L65)) pasa esto en
vez del fuente crudo. La firma de `transformFud` no cambia.

### 3.4. Sin cambios

- El wrapper del link pass, el manifest en todo lo demás, el runtime del SW y `sw.json`.
- `withLoad` sigue significando lo mismo en los dos emisores.

---

## 4. Comportamiento corregido

### 4.1. Un artefacto de servidor no se escribe en el directorio publicado

La regla, y es la que hay que poder repetir sin mirar el código: **`outDir` es lo que se
publica; lo que solo ejecuta el servidor no se escribe ahí.** No «se ofusca», no «se
excluye del manifest»: no se escribe.

El prerender sigue usando el bundle materializado en su temporal, así que no se entera. La
preview importa de `EDGE_DIR`, que está fuera de `dist/` y ningún host estático publica.

### 4.2. El grafo de `@server` se va con él

Es la consecuencia que resuelve el síntoma: al no ser el wrapper un chunk del build de
cliente, `data/posts.ts` deja de tener ningún importador en ese build y desaparece de
`dist/assets/`. No hay que excluir el módulo a mano ni marcarlo de ninguna manera — deja de
haber un camino que lo arrastre.

### 4.3. El fuente de `@server` se redacta conservando offsets

En el `sourcesContent` de cualquier mapa, el `.fud` viaja con sus regiones `@server`
sustituidas carácter a carácter por espacios (y los saltos de línea intactos).

Que sea **carácter a carácter** no es un detalle de estilo: los `mappings` del mapa son
offsets sobre ese fuente, y acortarlo desalinearía todo lo que venga después. Misma longitud,
mismas líneas, mismas columnas — y el `@server` ya no está. Es la misma invariante de
longitud que BUG-05 §4.4 impuso sobre `BUILD_TOKEN`, aplicada al otro extremo de la cadena.

El `@code` de cliente y el markup se conservan enteros: son lo que se quiere depurar.

### 4.4. Lo que la preview pierde, y por qué está bien

Nada que un despliegue estático tuviera. `/_fudic/data` y el render en preview siguen
funcionando porque leen de `EDGE_DIR`. Lo que ya no es posible es pedir el wrapper por URL
desde el navegador — que es exactamente el defecto.

---

## 5. Invariantes

**Los que el bug violaba**

- *El código de servidor no viaja al cliente* — enunciado literalmente en
  [`link.ts:90`](../../../packages/vite/src/link.ts#L90) y en la cabecera de
  `examples/basic/data/posts.ts`, y falso en el build.
- *SDD-19 §4.3: dos formatos de salida, uno por consumidor.* Había dos formatos y **un solo
  destino**, el publicado.
- *Un mapa sirve para depurar lo que se ejecuta.* El `sourcesContent` llevaba además código
  que por definición no se ejecuta en el cliente.

**Los que la corrección añade**

- **`outDir` contiene solo lo que se publica.** Verificable con un test sobre el árbol
  emitido, que es §6.1.
- **Ningún artefacto publicado contiene el texto de una región `@server`**, ni como código
  ni dentro de un mapa (§6.4).
- **Redactar conserva offsets.** Un fuente redactado mide lo que medía.

---

## 6. Criterios de aceptación

Tests en `packages/vite/test/` y `packages/compiler/test/`, más una comprobación sobre el
artefacto real de `examples/basic`.

1. **(rojo primero)** Tras un build con una ruta con `@server`, ningún fichero de `outDir`
   contiene el identificador importado por ese bloque (`listPosts`), ni en `.js` ni en
   `.map`.
2. **(rojo primero)** `dist/assets/` no contiene ningún chunk cuyo origen sea el módulo que
   solo importa `@server`: el `posts-*.js` de hoy no existe.
3. **(rojo primero)** `fudic-routes.json` no publica `esm` en ningún registro.
4. **(rojo primero)** El `sourcesContent` del mapa de un chunk del link pass **no** contiene
   el cuerpo de `@server`, y **sí** contiene el markup y el `@code` de cliente.
5. `redactServerRegions` devuelve un string de la **misma longitud** y con el **mismo número
   de líneas** que el original, para un `.fud` con una región, con varias y con ninguna.
6. El mapa sigue resolviendo tras redactar: el test posicional de BUG-05 §6.7 sigue verde.
7. `vite preview` sigue renderizando una ruta no prerenderizada y sirviendo
   `/_fudic/data/...`, leyendo de `EDGE_DIR`.
8. El prerender sigue produciendo los mismos `.html`, byte a byte, que antes del cambio.
9. Los chunks del link pass y `fudic-sw.js` no cambian de forma: regresiones de BUG-03 §6.1
   y de BUG-05 §6.1-§6.3 en verde.
10. **Extremo a extremo:** `grep -rl "listPosts" examples/basic/dist/` no devuelve nada, y los
    16 tests de `examples/basic/tests/` siguen en verde.

**Cobertura.** Lo nuevo nace al **100 %** en las cuatro métricas. `plugin.ts` y `link.ts` no
bajan de ramas.

---

## 7. Fuera de alcance

- **Cifrar, ofuscar o minificar para esconder** nada. La corrección es no escribirlo.
- **Quitar `esm` de `RouteRecord`** en `@fudic/transport`. El campo se queda declarado para
  un despliegue edge futuro; lo que cambia es que el manifest publicado no lo rellena.
- **Un manifest de servidor aparte.** La convención `EDGE_DIR/<safeName>.js` basta para los
  dos consumidores que hay; inventar un segundo fichero de contrato es trabajo sin demanda.
- **Revisar qué más embebe Vite en sus propios mapas** de `assets/*.js`. Con A arreglado, lo
  único que llegaba ahí por `@server` desaparece; si mañana aparece otra vía, es otro BUG con
  su propia medición.
- **Desactivar los source maps del ejemplo.** Se quedan encendidos a propósito: es lo que
  hizo visible esto.
