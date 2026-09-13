# SDD-41 — `fudic.json`: la aplicación se declara

> **Estado:** `Listo`
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
| `prefix` | `string` | **sí** | El primer segmento del tag de todo componente de este proyecto. `^[a-z][a-z0-9]*$` — sin guión: el guión lo pone la unión (§4.4) |

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
   * The first segment of every tag this project defines. Never empty: a custom element
   * name always HAS a first segment (the spec requires the hyphen), so the only question
   * a project can answer is WHICH one — not whether (§4.4).
   */
  readonly prefix: string;
}

export interface ConfigDiagnostic {
  readonly code: string;      // FUD0720–FUD0739
  readonly message: string;
  /** The file the diagnostic is about, relative to the project root. */
  readonly file: string;
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
 * The tag a NAME produces under `prefix`: `('shop', 'card')` → `'shop-card'`,
 * `('shop', 'icon-button')` → `'shop-icon-button'`.
 *
 * The argument is a name and never a tag, so a hyphen in it is part of the name and not
 * an override of the prefix. There is no escape hatch, and that is the point: a project
 * whose components can opt out of its prefix has no prefix (§4.4).
 */
export function tagOf(prefix: string, name: string): string;

/** The first segment of a tag: `'shop-icon-button'` → `'shop'`. */
export function prefixOf(tag: string): string;
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
(`didChangeWatchedFiles`). El prefijo entra en el snippet `component` y en el diagnóstico
`FUD0722`.

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

### 4.4. Todo componente tiene prefijo; el proyecto declara cuál

**El punto de partida es la especificación, no una convención de este framework.** Un
nombre de custom element **tiene que llevar un guión** — y el compilador ya lo exige:
`FUD0156`, *«The host wrapper tag must be a custom element (contain a hyphen)»*
([`document/structure.ts`](../../packages/compiler/src/document/structure.ts), decisión
75). No existe, ni puede existir, un componente cuyo tag sea `card`.

De ahí se sigue todo lo demás: **`app-card` ya lleva prefijo**, y `bus-log` también, y
`site-nav` también. Un tag es `<primer segmento>-<resto>` **siempre**. Así que la pregunta
que un proyecto puede contestar no es *si* sus componentes llevan prefijo —lo llevan por
construcción— sino **cuál**, y un proyecto que no lo contesta acaba con tantos prefijos
accidentales como componentes. Eso es exactamente lo que este campo existe para impedir, y
por eso es **obligatorio** (§3.1).

**Al generar, el argumento es un NOMBRE y nunca un tag.** `fudic g component card` con
`prefix: "shop"` escribe `shop-card.fud`. `fudic g component icon-button` escribe
`shop-icon-button.fud`: el guión del argumento es parte del nombre, **no** una forma de
saltarse el prefijo. No hay escotilla, y es deliberado — un proyecto cuyos componentes
pueden optar por no llevar su prefijo no tiene prefijo.

Lo que desaparece con esto es el `FUD0440` por «tag sin guión» en el uso normal del
comando: el guión lo pone `tagOf`, así que el tag generado es válido por construcción.
`validateTag` sigue entero, porque sigue teniendo dos trabajos reales —los nombres que la
especificación reserva (`FUD0442`) y la colisión con un tag ya tomado (`FUD0441`)— y
porque el `prefix` del fichero también pasa por validación.

**Al desviarse: error.** Un componente de este proyecto cuyo primer segmento **no es** el
`prefix` declarado emite **`FUD0722`, error**, sobre el span del wrapper host.

Error y no warning, y aquí me corrijo: lo había dejado en aviso razonando sobre la
migración —renombrar un custom element toca a todos sus consumidores—, y eso es un
argumento sobre el coste de arreglarlo, no sobre si es correcto. El hecho es **totalmente
decidible**: el tag está en el fichero, su primer segmento se lee sin ambigüedad, y el
proyecto ha declarado cuál tiene que ser. Un aviso que se puede ignorar sobre un hecho que
no admite excepción es un aviso que nadie lee.

La migración se resuelve por otro sitio, y ya está resuelta: **sin `fudic.json` no hay
regla** (§4.1). Un proyecto adopta el fichero el día que quiere la regla, y ese día
renombra. La bombilla del editor hace el renombrado; lo que no hace es dispensar de él.

**El prefijo no lleva guión.** `"prefix": "shop"`, no `"shop-"`. `tagOf` pone el guión, y
que lo ponga una sola función es lo que impide que `shop--card` exista.

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

### 4.8. En el editor: una voz, y la bombilla

`FUD0722` lo emite el **language server** sobre el `.fud` abierto, no TypeScript: es un
hecho sobre el tag y la proyección no lo ve. Cumple la regla de SDD-36 —*una voz por
hecho*— porque nadie más lo dice.

`FUD0720`, `FUD0721`, `FUD0723` y `FUD0724` son del **fichero de configuración**, no de un
`.fud`. El language server los publica sobre `fudic.json` mismo, con el span del campo
culpable; la CLI y el plugin los reportan como ya reportan sus errores sin span.

---

## 5. Invariantes

- **Nada lanza.** Un `fudic.json` ilegible, malformado o contradictorio se anota y el
  proyecto sigue funcionando degradado. Las excepciones son `FUD0721`, `FUD0722`,
  `FUD0723` y `FUD0724`, que son errores de build porque lo que describen no tiene
  comportamiento correcto posible.
- **Todo componente lleva prefijo.** Lo impone la especificación de custom elements y lo
  comprueba `FUD0156` desde antes de este SDD. Aquí no se inventa la regla: se declara
  **cuál** es el prefijo y se comprueba que se cumpla (§4.4).
- **Una sola implementación del lector.** Los tres consumidores llaman a
  `readProjectConfig`. Tres lectores del mismo fichero es la forma exacta de que el editor
  y el build acaben con dos ideas del prefijo.
- **Spans donde hay fuente.** `FUD0722` lleva el span del wrapper host en el `.fud`. Los
  del fichero de configuración llevan el span del campo dentro de `fudic.json`; un
  diagnóstico de configuración sin campo señalado no es accionable (SDD-01 §3.2).
- **El config declara identidad, nunca disposición.** Ni directorios, ni targets, ni
  versiones. Cada uno de esos tiene dueño (§7), y el argumento es el de
  `@fudic/conventions`: un sitio donde cabe todo acaba conteniéndolo.
- **Degradación sin fichero.** Ausente el `fudic.json`, todo consumidor se comporta
  exactamente como antes de este SDD. Es lo que permite que llegue sin migración.
- **Versiones exactas.** `@fudic/config` no añade ninguna dependencia de runtime.

### Catálogo de diagnósticos (`FUD0720`–`FUD0739`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0720` | `error` | `fudic.json` es ilegible o tiene forma inválida: JSON roto, campo con el tipo equivocado, **`prefix` ausente**, `id` que no casa `^[a-z][a-z0-9-]*$`, `prefix` que no casa `^[a-z][a-z0-9]*$` (un guión en él es este error, no un prefijo compuesto), `kind` distinto de `app`/`lib`. Uno por campo culpable. El proyecto queda **sin** configuración. |
| `FUD0721` | `error` | El proyecto tiene `sw.json` y su `fudic.json` no declara `id`. Sin identidad no hay namespacing de cachés (BUG-33). |
| `FUD0722` | `error` | El primer segmento del tag de un componente de este proyecto no es el `prefix` declarado. Sobre el wrapper host. Ancla la bombilla del renombrado. |
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
3. **(rojo primero)** JSON roto, `id: 42`, `id: "Shop"`, `kind: "plugin"`,
   `prefix: "shop-"` y **`prefix` ausente** producen cada uno su `FUD0720` con el campo
   señalado, y en los seis casos `config` es `null`. Un fichero con `id` válido y `kind`
   inválido **no** devuelve un config con el `id` puesto (§4.2).
4. `kind` ausente es `"app"`; `id` ausente es `''` (legal sin `sw.json`, §4.3).
   **`prefix` ausente no tiene defecto**: es `FUD0720`.
5. `tagOf('shop', 'card')` es `shop-card`; `tagOf('shop', 'icon-button')` es
   `shop-icon-button` — el guión del nombre **no** sustituye al prefijo (§4.4).
   `prefixOf('shop-icon-button')` es `shop`.
6. Un `io.read` que lanza produce `config: null` y un `FUD0720`, **no** una excepción.

**La CLI**

7. **(rojo primero)** `fudic g component card` en un proyecto con `prefix: "shop"` escribe
   `src/components/shop-card.fud` con `<shop-card>` de wrapper. Hoy ese comando falla con
   `FUD0440`.
8. `fudic g component icon-button` con `prefix: "shop"` escribe `shop-icon-button`, **no**
   `icon-button`: el guión del argumento es parte del nombre y no una escotilla (§4.4).
9. `fudic new shop --id shop --prefix shop` escribe un `fudic.json` con los dos campos, y
   el árbol resultante construye. **Sin `--prefix`, el comando falla**: el campo es
   obligatorio y `fudic new` no puede escribir un fichero que no valida.
10. Dos proyectos con el mismo `id` bajo un mismo workspace producen `FUD0724`.

**El plugin**

11. Un proyecto con `sw.json` y sin `id` emite `FUD0721` y el build **falla**.
12. Un proyecto **sin** `sw.json` y sin `id` construye en verde y no emite ningún
    diagnóstico de este rango.

**El editor**

13. Un componente `<app-card>` en un proyecto con `prefix: "shop"` publica `FUD0722`
    sobre el span del wrapper, con severidad **`error`**, y **no** lo publica también
    TypeScript. El mismo fichero en un proyecto **sin** `fudic.json` no publica nada.
14. El snippet `component` en un proyecto con prefijo propone el tag ya prefijado, y el
    fichero que entrega es **byte a byte** el de `fudic g component` (el test de
    `snippets-templates.test.ts`, extendido con el prefijo).
15. Editar `fudic.json` y guardarlo revalida los diagnósticos sin reiniciar el servidor:
    cambiar el `prefix` de `app` a `shop` mueve los `FUD0722` de los componentes que no lo
    llevaban a los que sí, sin reabrir un fichero.

**La evidencia**

16. `examples/basic` gana un `fudic.json` con `id: "basic"` y `prefix: "app"`. Los
    componentes que hoy se llaman `bus-*`, `signal-*`, `product-list`, `shopping-cart` y
    `site-nav` **rompen el build** con `FUD0722` — esa es la evidencia de que la regla
    muerde— y se renombran a `app-*` en la misma tarea, con sus
    `<link rel="component">`. Al terminar, los diecinueve llevan el prefijo y el build está
    verde.
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
- **Comprobar el prefijo de un componente que viene de otro paquete.** `FUD0722` es sobre
  los componentes que **este** proyecto define, leídos de su propio disco. Un componente
  importado de una librería lo comprueba su propio proyecto, con su propio `prefix`, y el
  grafo que hace falta para verlo entero es de [SDD-43](./SDD-43-librerias.md) §4.5.
- **Migrar proyectos existentes.** No hay comando de migración, y no hace falta: §4.1
  garantiza que un proyecto sin fichero se comporta como siempre. El día que adopta el
  fichero adopta la regla, y renombra — con la bombilla, pero renombra.
