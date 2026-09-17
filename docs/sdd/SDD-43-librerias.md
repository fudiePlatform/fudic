# SDD-43 — Librerías fudic: qué se publica y cómo se resuelve

> **Estado:** `Listo`
> **Paquetes:** `@fudic/resolve` (**nuevo**, §3.1) · `@fudic/vite` · `@fudic/cli` ·
> `@fudic/language-server` · `@fudic/compiler` (solo el diagnóstico; su `ResolveIo` **no**
> cambia de forma) · `@fudic/config` (consumido por `@fudic/resolve`, no modificado)
> **Depende de:** 41, 12, 15, 23, 24, 39 (§4.5), 42 (§4.6)
> **Rango de diagnósticos:** `FUD0760`–`FUD0779`
> **Naturaleza:** resolución + índice + una decisión de producto.
>
> **La tarea 1 es una medición, no código.** Buena parte de este SDD puede estar ya
> funcionando en un monorepo pnpm, y especificar lo que ya funciona es la forma más cara de
> no hacer nada. §4.2 dice exactamente qué medir y qué decide el resultado.

---

## 1. Contexto y objetivo

### 1.1. Los dos descubrimientos

Un `.fud` declara lo que usa con `<link rel="component" href>`, y de ahí sale todo: el
contrato de props (`graphRegistry.propsOf` → `declaredProps(comp)`), los slots, si el
componente hidrata, y qué props escribe. **Todo eso sale del `.fud` parseado**, y no hay
ninguna otra vía que llegue al contrato.

Quien lo descubre son dos, y descubren de forma distinta:

| | cómo descubre | ¿cruza la frontera de paquete? |
|---|---|---|
| **El compilador** | por **grafo**: sigue los `<link rel="component" href>` con `ResolveIo.resolve` | sí, **si el `href` resuelve**. Hoy solo resuelve rutas relativas |
| **El language server** | por **barrido**: `WorkspaceIndex.scan(root)` recorre el filesystem | **no**: poda `node_modules`, a propósito y por coste |

La asimetría es el problema. Un componente que el compilador ve y el índice no es un
componente cuyo `$Props` no entra en el `Program` de TypeScript, y entonces es `any` — y
con `any` el editor deja de comprobar props, deja de ofrecer la completación del contrato y
deja de señalar la prop requerida que falta. **Es exactamente el síntoma de
[BUG-23](./bugs/BUG-23-arroba-valvula-de-escape.md)**, reintroducido por la puerta de las
librerías.

### 1.2. La decisión que hay debajo

Antes que la fontanería hay una decisión de producto que nadie ha tomado por escrito, y de
la que depende todo lo demás: **qué publica una librería fudic.**

`propsOf`, `slotsOf`, `hydratable` y `writes` salen del AST
([`emit/registry.ts`](../../packages/compiler/src/emit/registry.ts)). No hay `.d.ts` que
los sustituya y no se puede fabricar uno: `hydratable` es una propiedad del **grafo**, no
de un fichero, y `writes` se lee del `@client` del componente. Así que una librería fudic
publica **`.fud` fuente**, o no se puede consumir.

§4.1 lo fija, con sus consecuencias — que no son pocas.

### 1.3. El objetivo

Que `<link rel="component" href="@acme/ui/card.fud">` funcione en los tres consumidores, y
que el contrato de ese componente llegue entero al editor: mismos diagnósticos, misma
completación y mismo chequeo de props que si estuviera en el mismo directorio.

---

## 2. Dependencias

**SDD-41 — `fudic.json`.** `kind: "lib"` es lo que hace descubrible una librería sin
barrer `node_modules` (§4.4), y `prefix` es lo que hace habitable el espacio de tags
compartido (§4.5).

**SDD-15 — Emit.** `resolveComponents`, `ComponentGraph`, y **`ResolveIo`**: la seam de dos
métodos por la que el compilador delega toda la I/O. Es la pieza que hace que este SDD
casi no toque el compilador.

**SDD-12 — Semántica.** `graphRegistry`, `propsOf`, `slotsOf`, y el diagnóstico de
componente usado sin declarar.

**SDD-23 / SDD-24 — Emisor TS virtual y language server.** La proyección que importa
`$Props` entre ficheros virtuales, el `WorkspaceIndex`, y `mountWorkspaceFuds`
([`project-files.ts`](../../packages/language-server/src/project-files.ts)) — cuya cabecera
explica, con los tres síntomas, qué pasa cuando un `.fud` no está en el `Program`.

**SDD-39 §4.5** — `FUD0622`, la colisión entre el `safeName` de una ruta y el tag de un
componente, que con librerías deja de ser una comprobación dentro de un build.

**SDD-42 §7** — la composición de guías de estilo entre paquetes, que aquel SDD delegó
aquí con una condición de reapertura explícita. Se contesta en §4.6.

---

## 3. Interfaz pública

### 3.1. La resolución: una seam, tres implementaciones

**`ResolveIo` no cambia de forma.** Su contrato ya es *«resuelve un `href` escrito en
`fromPath` a una ruta absoluta»*, y un specifier de paquete es un `href` más. Lo que cambia
son las tres implementaciones del host:

```ts
/**
 * Resolve an href written in `fromPath`.
 *
 * Relative (`./x.fud`, `../y.fud`) resolves against the file, as it always did. A BARE
 * specifier (`@acme/ui/card.fud`, `ui-kit/card.fud`) resolves as a package specifier from
 * that file's directory — the same algorithm an `import` would use, so the answer agrees
 * with what the bundler, `node` and the editor each already believe.
 */
resolve(fromPath: string, href: string): string;
```

`@fudic/vite` (`src/io.ts`), `@fudic/cli` (`src/io.ts`) y `@fudic/language-server`
comparten la implementación, que vive en **un** módulo. Tres copias del algoritmo de
resolución de módulos es tres respuestas distintas el día que una de ellas se quede atrás.

**Ese módulo es un paquete nuevo, `@fudic/resolve`**, y no una función más dentro de
`@fudic/config`. Las dos opciones eran reales —los tres hosts ya dependen de `config`, y
resolver un specifier necesita leer el `fudic.json` del paquete destino para `FUD0763`—,
pero `@fudic/config` es *«leer y validar `fudic.json`»*, una responsabilidad, y la
resolución de módulos de Node es otra. La que decide es la dirección: la resolución es lo
que va a crecer después —los assets desde un paquete que §7 deja fuera hoy, y el runtime
publicado de [SDD-45](./SDD-45-runtime-publicado.md)— y meterla en `config` es hacerla
crecer dentro del paquete que importa todo el mundo. Nace, además, al 100 % de cobertura en
las cuatro métricas sin arrastrar deuda ajena.

`@fudic/resolve` depende de `@fudic/config` (necesita el `kind` del paquete destino) y de
nada más. Los tres hosts lo declaran como dependencia; `@fudic/config` **no se modifica**.

### 3.2. El índice: las librerías del grafo de dependencias

```ts
/**
 * The fudic libraries a project depends on, transitively.
 *
 * Walks DECLARED dependencies and keeps the packages whose `fudic.json` says
 * `kind: "lib"`. It does NOT sweep `node_modules`: that is what the index refuses to do
 * (SDD-24 §4.5), and the dependency graph answers the same question in a bounded way.
 */
export function findLibraries(projectRoot: string, io: ScannerIo): readonly Library[];

export interface Library {
  readonly name: string;       // the package name
  readonly root: string;       // absolute
  readonly config: ProjectConfig;
  /** Every `.fud` the package publishes. */
  readonly files: readonly string[];
}
```

`WorkspaceIndex.scan` indexa además esos ficheros, y `mountWorkspaceFuds` los añade al
`Program`. No hay tipo nuevo en el índice: un `.fud` de librería es un `IndexEntry` como
cualquier otro.

### 3.3. `fudic.json` de una librería

Sin campos nuevos. Lo que la hace consumible ya está en SDD-41 (`kind`, `prefix`) y en
SDD-42 (`styles`). Lo que sí cambia es su `package.json`, y eso es §4.1.

---

## 4. Comportamiento

### 4.1. Una librería publica `.fud` fuente

**La decisión.** No hay distribución precompilada de una librería fudic. Su `package.json`
declara `files` y `exports` sobre los `.fud`, no sobre un `dist`, y quien la consume la
compila con su propio compilador.

No es una preferencia. Es que el contrato —props, slots, `hydratable`, `writes`— **se
deriva del AST** (§1.2), y dos de esos cuatro son propiedades del grafo completo y no del
fichero: `hydratable` depende de lo que los ancestros le pasan. Un artefacto precompilado
tendría que congelar una respuesta que solo existe cuando se conoce el grafo del consumidor.

Las consecuencias, dichas enteras porque son el precio:

- **La librería no tiene paso de build.** No hay `vite.config.ts`, no hay `dist`, y
  `fudic g lib` no los escribe (SDD-44 §4.5).
- **El `.fud` de la librería es su API.** Lo que no esté en `exports` no se puede enlazar.
- **La gramática se comparte.** El compilador del consumidor parsea el fuente de la
  librería, así que los dos tienen que hablar la misma versión del lenguaje. §4.7.
- **El CSS y el `@client` de la librería viajan al bundle del consumidor**, y se minifican
  y se trocean con los suyos. Eso es una ventaja, no un coste: una librería no arrastra su
  propio runtime ni su propia copia del framework.
- **`@server` de una librería no existe.** Un componente de librería no tiene `load`: eso
  es de una ruta, y una librería no tiene rutas (SDD-41 §4.5).

### 4.2. Lo primero es medir, y esto es lo que hay que medir

En un workspace pnpm, `node_modules/@acme/ui` es un **symlink al directorio real del
paquete**, que está bajo la raíz del workspace. Eso tiene dos consecuencias que pueden
hacer que medio SDD sobre:

- el barrido del índice, que arranca en el workspace folder, **ya ve** esos `.fud`;
- un `href` relativo que cruza a `libs/ui` **ya resuelve**, porque es una ruta del disco.

**La tarea 1 construye el caso y lo comprueba**: un workspace con una app y una librería, la
app enlazando un componente de la librería, y las cinco preguntas que deciden el alcance:

1. ¿El build compone el componente de la librería?
2. ¿El índice del LSP lo tiene?
3. ¿`$Props` resuelve, o es `any`? (La forma de preguntarlo: pasarle una prop de tipo
   incorrecto y ver si el editor lo marca.)
4. ¿Funciona con el `href` relativo? ¿Y con el specifier de paquete?
5. ¿Cambia algo si el paquete está instalado de verdad en `node_modules` en vez de
   enlazado?

Lo que salga en verde se documenta y **no se reimplementa**. Es el método de SDD-36 con el
renombrado, y por el mismo motivo: una tarde de medición decide si lo que queda es una fase
o un documento.

### 4.3. Un `href` puede nombrar un paquete

```html
<link rel="component" href="@acme/ui/card.fud">
<link rel="component" href="../../libs/ui/src/card.fud">   ← sigue siendo legal
```

Un `href` es **relativo** cuando empieza por `./` o `../`, y **de paquete** en cualquier
otro caso que no sea una ruta absoluta ni un esquema. La resolución de paquete es la de
módulos de Node desde el directorio del fichero que lo escribe: `exports` del paquete
incluido, que es lo que hace que una librería pueda decidir qué publica.

Un specifier que no resuelve es **`FUD0760`**, y el mensaje distingue los dos casos que el
autor confunde: *el paquete no está instalado* y *el paquete no exporta ese fichero*. Son
dos arreglos distintos —uno es `pnpm add`, el otro es abrir el `package.json` de la
librería— y un mensaje que no los separe manda a leer el fichero equivocado.

**Un `.fud` de un paquete que no declara `kind: "lib"` es `FUD0763`**, error. Enlazar el
interior de una app ajena, o de un paquete que no se pensó para esto, produce un
acoplamiento que nadie declaró y que el día que la otra app reorganice sus carpetas se
rompe sin aviso.

### 4.4. El índice sigue sin barrer `node_modules`

La poda de
[`node-fs.ts`](../../packages/language-server/src/node-fs.ts) se queda **tal cual**, y su
motivo también: *«`node_modules` es donde están casi todos los ficheros de un proyecto, y
un recorrido que lo visita antes de descartarlo paga por el almacén entero»*.

Lo que se añade no es una excepción a la poda: es **otra fuente**. `findLibraries` recorre
las dependencias **declaradas** de cada proyecto, resuelve cada paquete, mira si tiene un
`fudic.json` con `kind: "lib"` y, si lo tiene, indexa sus `.fud`. El coste es proporcional
al número de dependencias, no al tamaño de `node_modules`, y la forma es la misma que el
compilador ya usa: **seguir un grafo declarado en vez de barrer un directorio**.

Esos ficheros entran en el índice y en `mountWorkspaceFuds`. Es lo que hace que `$Props`
sea un tipo y no `any`, y lo que impide que este SDD reintroduzca BUG-23.

**Son de solo lectura.** Un `.fud` de librería se abre, se navega, se hace hover sobre él y
se le va a la definición; lo que no se hace es diagnosticarlo como código del usuario ni
formatearlo al guardar. El autor de una app no arregla los warnings de una librería.

### 4.5. El espacio de tags, ahora que es compartido

`customElements` es un registro global por documento. Con librerías, dos paquetes pueden
definir el mismo tag, y el segundo `define()` lanza en tiempo de ejecución.

- **`FUD0761`**, error: dos componentes del grafo definen el mismo tag. Con los dos ficheros
  en el mensaje, que es lo único accionable.
- **`validateTag`** (SDD-22) pasa a comprobar contra el grafo, no solo contra el proyecto
  local: `fudic g component card` en una app cuya librería ya define ese tag falla al
  generar, que es varios días antes de que falle al renderizar.
- **`FUD0622`** (SDD-39: el `safeName` de una ruta contra el tag de un componente) se
  evalúa contra el grafo completo por la misma razón.
- **El prefijo sigue sin comprobarse**, tampoco aquí. Es una guía (SDD-41 §4.4), y con
  librerías lo es más todavía: los tags de un paquete los nombra su autor, y una app no
  tiene ninguna autoridad sobre cómo se llaman los componentes que consume. Lo que protege
  el registro global es `FUD0761` —el tag **repetido**, que hace lanzar al segundo
  `define()`—, no que todo el mundo se llame igual. El prefijo reduce la probabilidad de
  llegar ahí; el diagnóstico atrapa el caso que importa.

### 4.6. Las guías de estilo se componen por la cadena del que define

[SDD-42](./SDD-42-guia-de-estilos.md) §4.6 fijó que un componente adopta la hoja del
proyecto **que lo define**, y dejó aquí la pregunta de qué pasa cuando ese proyecto depende
a su vez de otro que también tiene guía. Es el caso que motivó todo esto: una librería de
guía, consumida por una librería de componentes, consumida por varias apps.

**Unión, en orden de dependencia, de la raíz de la cadena hacia la hoja**, y el componente
al final:

```
libs/guia   (styles: tokens.css)
   ▲
libs/ui     (styles: ui.css)        ui-card, con su propio <style>
   ▲
apps/tienda (styles: tienda.css)

  →  data-fud-adopt="_tokens _ui ui-card"
```

La hoja de `apps/tienda` **no entra**: la app no define `ui-card`. Es lo que impide que una
app reestile por accidente los componentes de una librería, y es la mitad que SDD-42 ya
había decidido.

La cadena es la de **dependencias declaradas del paquete que define el componente**, no la
del documento. Está acotada, es la misma en las tres formas de renderizar, y se resuelve en
compilación.

### 4.7. La librería y el consumidor hablan la misma gramática

El compilador del consumidor parsea el fuente de la librería. Si la librería usa sintaxis
que ese compilador no conoce, lo que sale es un error de parseo en un fichero que el usuario
no escribió — el peor diagnóstico posible.

La librería lo declara: `"peerDependencies": { "@fudic/compiler": "<rango>" }`, que es el
paquete que de verdad parsea sus ficheros. Un consumidor cuyo compilador resuelto queda
fuera del rango recibe **`FUD0762`**, warning, **una vez por librería y no una por
fichero**: es un hecho del paquete.

Warning y no error, porque el rango lo escribe el autor de la librería con la información
que tenía el día que publicó, y un rango conservador de más no debe impedir un build que
funciona. Lo que no puede es fallar en silencio.

**Condición de reapertura, ya cumplida:** eso vale mientras todas las apps de un repo
comparten versión por fuerza, que es hoy. [SDD-45](./SDD-45-runtime-publicado.md) §4.6 hace
de las versiones mezcladas una promesa del producto, y entonces el rango deja de describir
una precaución y pasa a describir un componente de librería que se resolverá contra una
versión que no tiene lo que usa. Allí sube a **error**, `FUD0800`.

---

## 5. Invariantes

- **El compilador sigue sin filesystem.** Todo lo de §4.3 vive en las implementaciones de
  `ResolveIo` del host. `ResolveIo` no gana un método.
- **Una implementación de la resolución.** Un paquete —`@fudic/resolve`—, tres hosts. Tres
  copias es tres respuestas el día que una se quede atrás, y el editor y el build
  discrepando sobre qué fichero es un tag es la clase de defecto que cuesta un día
  encontrar. Ningún host reimplementa la resolución de specifiers ni «ajusta» el resultado.
- **El índice no barre `node_modules`.** Sigue el grafo de dependencias declaradas (§4.4).
  La poda de SDD-24 §4.5 se queda, y su motivo también.
- **El contrato sale del AST.** No se inventa una vía alternativa —`.d.ts`, manifiesto,
  metadatos en el `package.json`— para el contrato de un componente. Si hiciera falta, es
  otra spec y empieza por explicar cómo se congela `hydratable`.
- **Un `.fud` de librería es de solo lectura.** Se navega, no se diagnostica como propio ni
  se formatea (§4.4).
- **Nada lanza.** Un specifier que no resuelve, un paquete sin `fudic.json`, un `exports`
  que no publica el fichero: diagnóstico y el resto del documento se sigue emitiendo.
- **Cobertura.** El código nuevo nace al 100 % en las cuatro métricas en todo paquete que
  lo tenga; `compiler`, `vite` y los demás no bajan del número que tienen al empezar.

### Catálogo de diagnósticos (`FUD0760`–`FUD0779`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0760` | `error` | Un `<link rel="component" href>` con specifier de paquete que no resuelve. El mensaje distingue **paquete no instalado** de **el paquete no exporta ese fichero**. |
| `FUD0761` | `error` | Dos componentes del grafo definen el mismo tag. Con los dos ficheros. |
| `FUD0762` | `warning` | El `@fudic/compiler` resuelto queda fuera del `peerDependencies` que la librería declara. Uno por librería, no uno por fichero. **Superado por `FUD0800`** de [SDD-45](./SDD-45-runtime-publicado.md) §4.6, que lo sube a error: mientras todas las apps de un repo compartían versión por fuerza, un rango conservador de más no debía romper un build; desde que las versiones mezcladas son una promesa del producto, esto describe algo que rompe, y rompe tarde. |
| `FUD0763` | `error` | El `href` apunta a un `.fud` de un paquete que no declara `kind: "lib"`. |
| `0764`–`0779` | | Reservados. |

---

## 6. Criterios de aceptación

La **medición (1)** va primero y no tiene test: tiene informe. El resto en
`packages/vite/test/` (2–5), `packages/language-server/test/` (6–9),
`packages/compiler/test/` (10–11) y la evidencia (12–13).

**La medición**

1. **El informe de §4.2**, con las cinco preguntas contestadas sobre un caso real, y una
   línea por cada una diciendo **funciona** o **no funciona, y por qué**. Lo que salga en
   verde se marca como ya hecho en las tareas, con el commit que lo demuestra, y **no se
   reimplementa**.

**La resolución**

2. **(rojo primero)** `<link rel="component" href="@acme/ui/card.fud">` compone el
   componente en el HTML. Antes de la fase 2, el build no lo encuentra.
3. Un `href` relativo que cruza a otro paquete **sigue funcionando**: este SDD añade una
   forma, no sustituye la que hay.
4. `FUD0760` en sus dos formas, con dos mensajes distintos: paquete ausente, y paquete
   presente que no exporta el fichero.
5. `FUD0763`: un `href` a un `.fud` de un paquete sin `kind: "lib"`.

**El editor**

6. **(rojo primero)** Pasar una prop del tipo equivocado a un componente de librería **se
   marca en rojo**. Es la pregunta 3 de §4.2, y el síntoma de BUG-23: hoy, si el fichero no
   está en el `Program`, `$Props` es `any` y no se marca nada.
7. La completación tras `.` en el tag de un componente de librería ofrece **su contrato**, y
   no el ámbito global con auto-imports.
8. La prop requerida que falta en un componente de librería emite `FUD0197`, y su bombilla
   la inserta.
9. **El índice no barre `node_modules`.** Un `node_modules` con mil paquetes, de los cuales
   uno es librería fudic, indexa los `.fud` de ese uno; se mide con un scanner instrumentado
   que cuenta directorios visitados.

**Los tags y las hojas**

10. `FUD0761` cuando dos paquetes del grafo definen el mismo tag; `validateTag` falla al
    generar un componente cuyo tag ya define una librería (§4.5).
11. **La cadena de guías.** Con `guia → ui → tienda`, el componente de `ui` adopta
    `_tokens _ui ui-card` — y **no** la hoja de `tienda` (§4.6).

**La evidencia**

12. `examples/` gana un workspace con una librería de guía, una de componentes y dos apps
    que la comparten. Construye, y el componente compartido sale idéntico en las dos apps.
    Verificado en Chrome real.
13. **Cobertura.** El código nuevo al 100 % en las cuatro métricas; ningún paquete tocado
    baja del número que tiene al empezar.

---

## 7. Fuera de alcance

- **Publicar una librería precompilada.** §4.1 lo cierra. Reabrirlo exige explicar antes
  cómo se congela `hydratable`, que es una propiedad del grafo del consumidor.
- **Un formato de paquete propio.** Nada de `fudic-package.json`, ni de un registro. Lo que
  hay es `package.json` con `exports` y `fudic.json` con `kind`.
- **Versionado de la gramática.** §4.7 declara un rango y avisa. Un esquema de versiones
  del lenguaje —qué es un cambio incompatible, cómo se migra— es otra spec, y no hace falta
  hasta que exista la segunda versión de la gramática.
- **Que una app reestile los componentes de una librería.** §4.6 lo impide a propósito. El
  día que haga falta, la vía es que la librería exponga custom properties, no que el
  consumidor le inyecte una hoja.
- **Diagnosticar o formatear los `.fud` de una librería.** §4.4: solo lectura.
- **Resolver assets (`url(…)`, `<img src>`) desde un paquete.** El `AssetLinker` ya resuelve
  por Vite, que sabe de paquetes. Si la medición de §4.2 encuentra que no, entra aquí como
  fase; si no, no se toca.
- **`fudic check` sobre una librería aislada.** Comprobar una librería sin consumidor es
  útil y es un comando, no este SDD.
