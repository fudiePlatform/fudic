# SDD-41 — `fudic.json`: la aplicación se declara

> **Estado:** `Hecho`
> **Paquetes:** `@fudic/config` (nuevo) · `@fudic/cli` · `@fudic/vite` ·
> `@fudic/language-server` · `@fudic/example-basic` (la evidencia)
> **Depende de:** 19, 20, 22, 24, 28
> **Rango de diagnósticos:** `FUD0720`–`FUD0739`
> **Naturaleza:** configuración + CLI + editor. No toca el parser, ni el emit, ni el runtime.
>
> Un proyecto fudic no dice de sí mismo absolutamente nada. No tiene nombre estable, no
> declara bajo qué prefijo viven sus componentes, y no hay forma de distinguir una app de
> una librería. Este SDD crea el fichero donde eso se declara, y lo conecta con sus tres
> consumidores.

---

## 1. Contexto y objetivo

### 1.1. Lo que hoy no existe

`fudic new` escribe ocho ficheros —`package.json`, `vite.config.ts`, `tsconfig.json`,
`.gitignore`, `fudic-globals.d.ts`, `sw.json`, el layout y la ruta índice— y **ninguno de
ellos dice qué es este proyecto**. El `package.json` lleva un `name` de npm, que es un
nombre de paquete y no una identidad de aplicación; el `vite.config.ts` lleva opciones de
build; `sw.json` lleva política de caché.

Tres huecos concretos, y los tres se han topado con la misma pared:

**(a) El prefijo de los componentes.** `fudic g component <tag>` exige el tag entero, y
`validateTag` ([`packages/cli/src/tag.ts`](../../packages/cli/src/tag.ts)) solo comprueba
que sea un custom element legal y que no esté tomado *en este proyecto*. No existe la
noción de prefijo en ningún paquete. Con una sola app da igual; con una librería de
componentes compartida por varias apps, el espacio de tags es global —
`customElements.define` lo es — y el prefijo pasa de estilo a ser la única defensa.

**(b) La identidad de la app, y las cachés del Service Worker.** `cacheNames(build)`
produce `shell-<build>`, `routes-<build>`, `pages-<build>` y `data-<build>`
([`packages/transport/src/store.ts`](../../packages/transport/src/store.ts)), y
`activate` borra, con `caches.keys()`, todo lo que case ese prefijo y no sea de su build.
`CacheStorage` es **por origen**, no por scope: dos apps fudic en el mismo origen se
borran las cachés mutuamente. Namespacearlas exige un identificador de aplicación
**estable entre builds**, y hoy no hay ninguno. Es [BUG-33](./bugs/BUG-33-caches-por-app.md),
y este SDD es su prerrequisito.

**(c) App o librería.** [SDD-43](./SDD-43-librerias.md) necesita saber qué paquetes de un
workspace son librerías fudic para indexarlas sin barrer `node_modules` entero, y
[SDD-44](./SDD-44-cli-de-workspace.md) necesita saberlo para generar la pieza correcta.
Deducirlo de la forma del directorio es adivinar.

### 1.2. Por qué no vale `@fudic/conventions`

Es la primera pregunta razonable, y el propio paquete la contesta en su cabecera:

> *Lo que pertenece aquí es estrecho, y la regla es el asunto entero: **un nombre que dos
> paquetes deben acordar y ninguno posee**. Versiones, nombres de ficheros generados y
> nombres de salida ya tienen dueño, y añadirlos convertiría esto en un cajón de strings.*

`@fudic/conventions` son cuatro constantes, sin dependencias y sin I/O. Meterle un parser
de JSON, un rango de diagnósticos y una seam de filesystem lo convierte en otra cosa. El
sitio que falta es otro paquete.

### 1.3. El objetivo

Un fichero, en la raíz del proyecto, que declare **quién es** este proyecto: su
identidad, su prefijo y si es app o librería. Leído por los tres consumidores que lo
necesitan —la CLI, el plugin y el language server— desde **una sola implementación**, y
degradando a lo de hoy cuando no está.

### 1.4. Lo que este SDD NO es

No es un `angular.json`. **No declara proyectos, ni directorios, ni targets de build**
(§7). Un fichero que lista lo que `pnpm-workspace.yaml` ya lista es un segundo sitio donde
vive el mismo dato, que es la razón por la que este repo no tiene tabla nombre→URL
(SDD-39 §4.7) ni segunda copia de `routesDir`.

---

## 2. Dependencias

**SDD-19 — Plugin Vite.** `FudicOptions` / `resolveOptions`, y el patrón de un lector con
I/O inyectada que **nunca lanza**: `readSwConfig` de SDD-20 es el modelo literal del
lector de §3.2. `routesDir` sigue siendo opción del plugin y no baja aquí (§7).

**SDD-20 — Render en el SW.** `sw.json`, su lector, y las cuatro cachés cuyo namespacing
motiva el `id`. La relación entre los dos ficheros está en §4.6.

**SDD-22 — CLI.** El modelo **plan → aplicación**, `BaseOptions` con `cwd`, `validateTag`,
`existingTags`, y `AVAILABLE_TARGETS` — el adapter de despliegue que §4.6 de aquel SDD
dejó diferido y que §7 de este confirma que no baja al fichero.

**SDD-24 — Language server.** `resolveOptions(initializationOptions)`, el `WorkspaceIndex`
con su barrido por workspace folder, y el canal `didChangeWatchedFiles` que ya lo mantiene
al día. Es el único consumidor que hoy no lee un fichero de proyecto de ninguna clase.

**SDD-28 — Snippets.** El snippet `component` y la nota de
[`snippets.ts`](../../packages/language-server/src/services/snippets.ts) que dice que él y
`fudic g component` **entregan el mismo fichero byte a byte**. El prefijo entra por ahí, o
el proyecto tiene dos ideas de cómo se llama un componente.

---

## 3. Interfaz pública

### 3.1. El fichero

`fudic.json`, en la raíz del proyecto, al lado de `package.json`. **Un directorio es un
proyecto fudic si tiene uno.** Esa es toda la regla de descubrimiento, y es la que
SDD-43 y SDD-44 consumen.

```json
{
  "id": "shop",
  "kind": "app",
  "prefix": "shop"
}
```

| Campo | Tipo | Obligatorio | Qué es |
|---|---|---|---|
| `id` | `string` | sí, cuando hay `sw.json` (§4.3) | La identidad de la aplicación, **estable entre builds y entre despliegues**. Namespacea las cachés (BUG-33). `^[a-z][a-z0-9-]*$` |
| `kind` | `"app" \| "lib"` | no — defecto `"app"` | Qué es este proyecto. Una `lib` no tiene rutas, ni `sw.json`, ni build propio (§4.5) |
| `prefix` | `string` | no | El prefijo que la CLI y el editor **proponen** al crear un componente. `^[a-z][a-z0-9]*$` — sin guión: el guión lo pone la unión. Es una guía, no una regla (§4.4) |

Nada más. Cada campo que no esté aquí tiene ya un dueño en otro sitio, y §7 dice cuál.

### 3.2. `@fudic/config`

Paquete nuevo, hoja, sin dependencias de runtime. Su lector es el gemelo de
`readSwConfig`: I/O inyectada, y **nunca lanza** — un fichero ilegible es un diagnóstico y
un proyecto sin configuración, jamás una excepción.

```ts
/** What the file declares, with every default already filled. */
export interface ProjectConfig {
  /** `''` when the file declares none — legal unless the project has a Service Worker. */
  readonly id: string;
  readonly kind: 'app' | 'lib';
  /**
   * What the CLI and the editor PROPOSE when creating a component. `''` when the file
   * declares none, and then both fall back to what they do today.
   *
   * It constrains nothing: a project with `prefix: "app"` can define `signal-counter`,
   * and that is a choice, not a mistake (§4.4).
   */
  readonly prefix: string;
}

/** Offsets into the file's text, `[start, end)`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface ConfigDiagnostic {
  readonly code: string;      // FUD0720–FUD0739
  readonly message: string;
  /** The file the diagnostic is about, relative to the project root. */
  readonly file: string;
  /**
   * Where the guilty field is, so the editor underlines it instead of the whole file
   * (§5: *spans donde hay fuente*). It spans the KEY and not its value: the key is what
   * names the field and what the message talks about, and finding it needs no second
   * JSON parser.
   *
   * Absent when there is nothing to point at — the file could not be read, the JSON does
   * not parse, or the key is spelled with escapes and so is not in the text as written.
   */
  readonly span?: Span;
}

export interface ConfigResult {
  /** `null` when there is no `fudic.json`, or it is unusable. Degrades; never throws. */
  readonly config: ProjectConfig | null;
  readonly diagnostics: readonly ConfigDiagnostic[];
}

/** Minimal I/O seam, identical in shape to SDD-20's `ConfigIo`. */
export interface ConfigIo {
  exists(path: string): boolean;
  read(path: string): string;
}

/** Read `<root>/fudic.json`. */
export function readProjectConfig(root: string, io: ConfigIo): ConfigResult;

/** The file's name. The one place it is spelled. */
export const CONFIG_FILE = 'fudic.json';

/**
 * The tag a bare name produces under `prefix`: `('shop', 'card')` → `'shop-card'`.
 *
 * A name that ALREADY carries a hyphen is a tag the author wrote, and comes back
 * untouched: `('shop', 'signal-counter')` → `'signal-counter'`. So is anything at all
 * when `prefix` is `''`. The prefix proposes; the author disposes (§4.4).
 */
export function tagOf(prefix: string, name: string): string;
```

Cobertura: el paquete nace con `thresholds` al **100 en las cuatro métricas** y
`coverage.include: ['src/**/*.ts']`, como todo paquete nuevo.

### 3.3. Los tres consumidores

**`@fudic/cli`.** `BaseOptions` gana el config ya resuelto; `fudic g component <nombre>`
acepta un **nombre corto** y lo expande con `tagOf`. Un nombre que ya lleva guión se
respeta tal cual (§4.4). `fudic new` escribe un `fudic.json`, y gana `--id` y `--prefix`.

**`@fudic/vite`.** El plugin lee el config en `configResolved`, junto a `sw.json`. Expone
el `id` a lo que lo necesita —hoy, BUG-33— y reporta sus diagnósticos con `this.warn` /
`this.error` como ya hace con los de `resolveOptions`. **`FudicOptions` no cambia**: el
config no es una opción de plugin y el plugin no la redefine.

**`@fudic/language-server`.** Lee un `fudic.json` **por workspace folder**, en
`initialize`, y lo revalida por el canal que ya mantiene el `WorkspaceIndex`
(`didChangeWatchedFiles`). El prefijo entra en **un solo sitio**: el tabstop del snippet
`component`, donde hoy hay un `app-button` escrito a pelo.

---

## 4. Comportamiento

### 4.1. Sin fichero, todo sigue como hoy

`readProjectConfig` devuelve `{ config: null, diagnostics: [] }` y **ningún consumidor
cambia de comportamiento**: la CLI exige el tag entero, el plugin no namespacea nada, el
editor no diagnostica prefijos. Un proyecto de hoy sigue construyendo mañana sin tocar un
fichero.

La única excepción es §4.3, y es la que hace que el fichero deje de ser opcional
exactamente donde su ausencia haría daño.

### 4.2. Un fichero roto degrada, no rompe

JSON inválido, un campo con el tipo equivocado, un `id` que no casa su forma, un `kind`
desconocido: **`FUD0720`, un diagnóstico por campo**, y el resultado es `config: null`. Es
la misma decisión que SDD-20 tomó con `sw.json` —*«un fichero malformado es un diagnóstico
y no hay SW»*— y por el mismo motivo: un error de configuración que aborta el build deja
al usuario sin la salida que le diría qué ha escrito mal.

Los campos **no** se rescatan parcialmente. Un fichero con `id` válido y `kind` inválido
no produce un config con el `id` puesto: la identidad es una unidad, y media identidad es
peor que ninguna porque el `id` a medias namespacearía cachés que el build siguiente
namespacearía de otra forma.

### 4.3. El `id` es obligatorio cuando hay Service Worker, y solo entonces

```
sw.json presente  ∧  id ausente   →  FUD0721, error
sw.json ausente   ∧  id ausente   →  legal: no hay cachés que namespacear
```

La regla es estrecha a propósito, y sale de lo que el `id` hace: existe para nombrar
cachés. Un proyecto sin `sw.json` no tiene ninguna
(*«no `sw.json`, no Service Worker»*, SDD-20 §4.7), así que exigirle identidad sería pedir
un dato que nadie lee.

**El `id` no se cambia nunca.** Cambiarlo deja huérfanas las cachés del despliegue
anterior: `isStaleCache` de BUG-33 solo purga las de su propio `id`, así que las del
anterior no las borra nadie, jamás. Va escrito en el fichero generado por `fudic new`, en
un comentario del README de la plantilla, y es la razón por la que el `id` **no** se deriva
del `base` ni del `name` del `package.json`: los dos cambian por motivos que no tienen nada
que ver con la identidad de la app.

### 4.4. El prefijo es una guía, y no restringe nada

**Lo que la especificación exige ya está exigido, y no es esto.** Un nombre de custom
element tiene que llevar un guión, y el compilador lo comprueba desde antes de este SDD:
`FUD0156`, *«The host wrapper tag must be a custom element (contain a hyphen)»*
([`document/structure.ts`](../../packages/compiler/src/document/structure.ts), decisión
75). Ese es el único requisito duro sobre el nombre de un componente, y este SDD **no
añade ninguno**.

**El `prefix` es lo que se propone al crear.** Hoy esa propuesta existe y está incrustada
a pelo: el snippet `component` escribe `<${1:app-button}>`
([`snippets.ts`](../../packages/language-server/src/services/snippets.ts)), un tabstop con
`app-` escrito en el código fuente del servidor. Lo que hace este campo es que esa
propuesta salga del proyecto en vez de de una constante.

| | sin `prefix` | con `prefix: "app"` |
|---|---|---|
| `fudic g component card` | `FUD0440`: falta el guión | escribe `app-card.fud` |
| snippet `component` | tabstop `app-button` (la constante de hoy) | tabstop `app-button`, del proyecto |

**Y un tag escrito entero se respeta.** `fudic g component signal-counter` en un proyecto
con `prefix: "app"` escribe `signal-counter`, no `app-signal-counter`: un argumento con
guión **ya es un tag**, y la CLI no reinterpreta lo que el autor ha dicho. Elegir `app-*`
como norma de la casa y crear después un `signal-*` es una decisión del que escribe el
proyecto, y está bien tomada por definición — es su proyecto.

**No hay diagnóstico por desviarse, y es deliberado.** Un componente cuyo tag no empieza
por el prefijo del proyecto no emite nada: ni error, ni warning. `FUD0722` queda
**reservado y sin usar**, con esta nota, para que no vuelva a aparecer.

Aquí me corregí dos veces y las dos en la dirección equivocada: primero lo dejé en warning
razonando sobre el coste de renombrar, y después lo subí a error razonando sobre que el
hecho es decidible. Las dos veces la pregunta era la equivocada. Que algo se pueda
comprobar no quiere decir que haya que comprobarlo: **la norma de nombres de un proyecto la
pone quien escribe el proyecto**, y una herramienta que la impone deja de ayudar y pasa a
estorbar. Lo que sí es un error de verdad —dos componentes que definen el mismo tag— tiene
su diagnóstico en otro sitio y es `FUD0761` de [SDD-43](./SDD-43-librerias.md) §4.5: ese
sí describe algo que rompe, porque el segundo `customElements.define` lanza.

**El prefijo no lleva guión.** `"prefix": "app"`, no `"app-"`. `tagOf` pone el guión, y que
lo ponga una sola función es lo que impide que `app--card` exista.

### 4.5. `kind: "lib"`: lo que una librería no tiene

Una librería fudic es un paquete con componentes y layouts, y **sin nada de lo que hace
falta para servir una aplicación**: no tiene rutas, no tiene `sw.json`, no tiene
Service Worker, no tiene `base` y no tiene origen. La unidad de `sw.json` es el
**despliegue**, no el paquete, y una librería no se despliega: se consume.

`FUD0723`, error, cuando un proyecto declara `kind: "lib"` y a la vez tiene `sw.json` o
un directorio de rutas no vacío. No es prudencia: es que las dos cosas juntas no tienen
lectura posible —un `sw.json` en una lib no lo lee ningún build— y dejarlo pasar produce
un fichero que parece configurar algo y no configura nada.

Lo que `kind` habilita está fuera de este SDD y es su razón de ser: SDD-43 lo lee para
decidir qué indexar, y SDD-44 para decidir qué generar.

### 4.6. `fudic.json` y `sw.json` no se funden

Son dos ficheros y se quedan en dos, y la frontera es nítida:

| | `fudic.json` | `sw.json` |
|---|---|---|
| De qué habla | del **proyecto**: quién es | del **despliegue**: qué se cachea y con qué política |
| Cuántos hay | uno por proyecto fudic, app o lib | uno por despliegue — **una librería no tiene** |
| Quién lo lee | CLI, plugin, language server | solo el plugin |

En la forma de despliegue más común —un origen, una app— coinciden uno a uno, y de ahí la
tentación de fundirlos. En cuanto hay dos apps bajo un mismo origen dejan de coincidir, y
fundirlos habría metido la política de caché de un despliegue dentro de la identidad de un
paquete.

### 4.7. Dos proyectos no pueden compartir `id`

Dos apps con el mismo `id` en el mismo origen vuelven a pisarse las cachés: el namespacing
de BUG-33 las pondría bajo el mismo nombre y `isStaleCache` las trataría como builds
distintos de la misma app. **`FUD0724`, error.**

Lo emite quien ve más de un proyecto: la **CLI** (en `fudic g app`, y al barrer un
workspace) y `fudic check`. **El plugin no lo emite**, y no es un olvido: un build de Vite
ve un `root` y no puede saber si hay otro proyecto en el repo, así que un diagnóstico suyo
sería un falso negativo permanente disfrazado de comprobación.

### 4.8. En el editor

**Ningún `.fud` gana un diagnóstico por este SDD.** El prefijo no se comprueba (§4.4), así
que lo único que el editor hace con él es proponerlo.

`FUD0720`, `FUD0721`, `FUD0723` y `FUD0724` son del **fichero de configuración**, no de un
`.fud`. El language server los publica sobre `fudic.json` mismo, con el span del campo
culpable; la CLI y el plugin los reportan como ya reportan sus errores sin span.

---

## 5. Invariantes

- **Nada lanza.** Un `fudic.json` ilegible, malformado o contradictorio se anota y el
  proyecto sigue funcionando degradado. Las excepciones son `FUD0721`, `FUD0723` y
  `FUD0724`, que son errores de build porque lo que describen no tiene comportamiento
  correcto posible.
- **El prefijo propone, no manda.** La única regla dura sobre el nombre de un componente
  es la de la especificación —el guión—, y ya la comprueba `FUD0156` desde antes de este
  SDD. Aquí no se añade ninguna: un proyecto con `prefix: "app"` define `signal-counter`
  sin que nadie diga nada (§4.4).
- **Ningún `.fud` gana un diagnóstico.** Todo lo de este rango es sobre `fudic.json`.
- **Una sola implementación del lector.** Los tres consumidores llaman a
  `readProjectConfig`. Tres lectores del mismo fichero es la forma exacta de que el editor
  y el build acaben con dos ideas del prefijo.
- **Spans donde hay fuente.** Los diagnósticos del fichero de configuración llevan el span
  del campo dentro de `fudic.json`; uno sin campo señalado no es accionable
  (SDD-01 §3.2). El span cubre **la clave**, que es lo que nombra al campo y de lo que
  habla el mensaje. Es opcional porque hay tres casos sin nada que señalar —el fichero no
  se pudo leer, el JSON no parsea, o la clave está escrita con escapes y no está en el
  texto tal cual—, y en esos tres el diagnóstico es del fichero entero.
- **El config declara identidad, nunca disposición.** Ni directorios, ni targets, ni
  versiones. Cada uno de esos tiene dueño (§7), y el argumento es el de
  `@fudic/conventions`: un sitio donde cabe todo acaba conteniéndolo.
- **Degradación sin fichero.** Ausente el `fudic.json`, todo consumidor se comporta
  exactamente como antes de este SDD. Es lo que permite que llegue sin migración.
- **Versiones exactas.** `@fudic/config` no añade ninguna dependencia de runtime.

### Catálogo de diagnósticos (`FUD0720`–`FUD0739`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0720` | `error` | `fudic.json` es ilegible o tiene forma inválida: JSON roto, campo con el tipo equivocado, `id` que no casa `^[a-z][a-z0-9-]*$`, `prefix` que no casa `^[a-z][a-z0-9]*$` (un guión en él es este error: el guión lo pone `tagOf`), `kind` distinto de `app`/`lib`. Uno por campo culpable. El proyecto queda **sin** configuración. |
| `FUD0721` | `error` | El proyecto tiene `sw.json` y su `fudic.json` no declara `id`. Sin identidad no hay namespacing de cachés (BUG-33). |
| `FUD0722` | — | **Reservado y deliberadamente sin usar.** Fue, en dos borradores, «el tag no lleva el prefijo del proyecto» — primero warning, después error. Las dos veces estaba mal: el prefijo es una guía y la norma de nombres la pone quien escribe el proyecto (§4.4). Queda anotado para que no vuelva. Lo que sí rompe —dos componentes con el mismo tag— es `FUD0761` de SDD-43. |
| `FUD0723` | `error` | `kind: "lib"` en un proyecto que tiene `sw.json` o un directorio de rutas no vacío. |
| `FUD0724` | `error` | Dos proyectos del workspace declaran el mismo `id`. Lo emiten la CLI y `fudic check`; **nunca** el plugin (§4.7). |
| `0725`–`0739` | | Reservados. |

---

## 6. Criterios de aceptación

Tests en `packages/config/test/` (1–6), `packages/cli/test/` (7–10),
`packages/vite/test/` (11–12), `packages/language-server/test/` (13–15) y la evidencia en
`examples/basic` (16–17).

**El lector**

1. Un `fudic.json` con los tres campos válidos produce el `ProjectConfig` con los tres, y
   cero diagnósticos.
2. Un fichero ausente produce `{ config: null, diagnostics: [] }` — **cero diagnósticos**,
   no uno informativo: no tenerlo es legal.
3. **(rojo primero)** JSON roto, `id: 42`, `id: "Shop"`, `kind: "plugin"` y
   `prefix: "app-"` producen cada uno su `FUD0720` con el campo señalado, y en los cinco
   casos `config` es `null`. Un fichero con `id` válido y `kind` inválido **no** devuelve
   un config con el `id` puesto (§4.2).
4. `kind` ausente es `"app"`; `prefix` ausente es `''`; `id` ausente es `''` (legal sin
   `sw.json`, §4.3).
5. `tagOf('app', 'card')` es `app-card`; `tagOf('app', 'signal-counter')` es
   **`signal-counter`** — un argumento con guión ya es un tag y vuelve intacto (§4.4);
   `tagOf('', 'card')` es `card`.
6. Un `io.read` que lanza produce `config: null` y un `FUD0720`, **no** una excepción.

**La CLI**

7. **(rojo primero)** `fudic g component card` en un proyecto con `prefix: "app"` escribe
   `src/components/app-card.fud` con `<app-card>` de wrapper. Hoy ese comando falla con
   `FUD0440`.
8. `fudic g component signal-counter` en ese **mismo** proyecto escribe `signal-counter`,
   **no** `app-signal-counter`, y no emite ningún diagnóstico: el prefijo propone y el
   autor dispone (§4.4).
9. `fudic new tienda --id tienda --prefix app` escribe un `fudic.json` con los dos campos,
   y el árbol resultante construye. **Sin `--prefix` también construye**: el campo es
   opcional y el comando se comporta entonces como antes de este SDD.
10. Dos proyectos con el mismo `id` bajo un mismo workspace producen `FUD0724`.

**El plugin**

11. Un proyecto con `sw.json` y sin `id` emite `FUD0721` y el build **falla**.
12. Un proyecto **sin** `sw.json` y sin `id` construye en verde y no emite ningún
    diagnóstico de este rango.

**El editor**

13. **Ningún `.fud` gana un diagnóstico.** Un componente `<signal-counter>` en un proyecto
    con `prefix: "app"` **no publica nada**: ni error, ni warning, ni del servidor ni de
    TypeScript. Es el criterio que fija §4.4 y el que impide que `FUD0722` vuelva.
14. El snippet `component` en un proyecto con `prefix: "shop"` propone el tabstop
    `shop-button` donde hoy propone `app-button`; **sin** `fudic.json` sigue proponiendo
    `app-button`, el literal de hoy. Y el fichero que entrega es **byte a byte** el de
    `fudic g component` con el mismo config (`snippets-templates.test.ts`, extendido).
15. Editar `fudic.json` y guardarlo revalida sin reiniciar el servidor: cambiar el
    `prefix` de `app` a `shop` cambia el tabstop que el snippet propone en el siguiente
    fichero, sin reabrir nada.

**La evidencia**

16. `examples/basic` gana un `fudic.json` con `id: "basic"` y `prefix: "app"`. **No se
    renombra ni un componente**: `bus-log`, `signal-counter`, `product-list`,
    `shopping-cart` y `site-nav` se quedan como están y el build sigue verde. Eso **es** el
    criterio: el prefijo cambia lo que se propone al crear el siguiente, y no toca a los
    diecinueve que ya existen.
17. **Cobertura.** `@fudic/config` nace al **100 %** en las cuatro métricas.
    `@fudic/cli`, `@fudic/vite` y `@fudic/language-server` no bajan del número que tienen
    al empezar.

---

## 7. Fuera de alcance

- **Directorios.** `routesDir` sigue siendo opción de `@fudic/vite` y los defectos siguen
  en `@fudic/conventions`. Bajarlos aquí crearía un tercer sitio que declara lo mismo, que
  es el defecto que BUG-20 arregló.
- **El adapter de despliegue.** `AVAILABLE_TARGETS` y `--target` siguen donde SDD-22 §4.6
  los dejó. Cuando exista más de un adapter se decidirá si su elección es del proyecto o
  del comando; hasta entonces no hay nada que declarar.
- **Versiones y nombres de salida.** Tienen dueño: `project.ts` de la CLI y `constants.ts`
  del plugin.
- **Un fichero de workspace.** No lo hay y no lo va a haber: la lista de paquetes la posee
  `pnpm-workspace.yaml`. SDD-44 descubre proyectos buscando `fudic.json`, no leyendo un
  registro.
- **El namespacing de cachés.** Este SDD produce el `id`; quien lo usa es
  [BUG-33](./bugs/BUG-33-caches-por-app.md). Aquí no se toca `@fudic/transport`.
- **La guía de estilos.** [SDD-42](./SDD-42-guia-de-estilos.md) añade a **este mismo
  fichero** un campo `styles`, y lo añade allí porque es allí donde se decide qué hace.
  Que un SDD posterior amplíe la forma del fichero es lo normal; lo que no puede es
  ampliar su papel: `styles` declara **qué aspecto tienen los componentes de este
  proyecto**, que es identidad, y no dónde viven sus ficheros, que sería disposición.
- **Imponer el prefijo.** No se comprueba, ni aquí ni en ningún SDD posterior: §4.4 lo
  cierra y `FUD0722` queda reservado con la nota puesta. Lo que sí rompe —dos componentes
  con el mismo tag, que hacen lanzar al segundo `customElements.define`— es `FUD0761` de
  [SDD-43](./SDD-43-librerias.md) §4.5, y ese es un diagnóstico sobre un hecho que rompe,
  no sobre una norma de estilo.
- **Migrar proyectos existentes.** No hay comando de migración y no hace falta ninguno:
  adoptar el fichero no invalida un solo componente de los que ya hay (criterio 16).
