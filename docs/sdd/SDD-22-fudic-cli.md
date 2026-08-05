# SDD-22 — CLI de scaffolding (`@fudic/cli`)

> **Estado:** `Hecho` (los 15 criterios de §6 verdes; §2–§6 corregidos contra el código
> real de SDD-19/20/21 antes de implementar)
> **Paquete:** `@fudic/cli` (binario `fudic`; monorepo pnpm, ver SDD-00 §3.5)
> **Depende de:** SDD-00, SDD-01, SDD-05, SDD-10, SDD-19, SDD-20, SDD-21
> **Decisiones de gramática:** 41, 51, 53, 55, 58, 59, 60, 62, 81, 83, 84

---

## 1. Contexto y objetivo

Especificar la herramienta de línea de comandos que **crea proyectos y agrega piezas**
(páginas, componentes, layouts) a un proyecto Fudic existente.

Su alcance es exactamente ese. **No es un bundler, no es un dev server, no es un
watcher.** El ciclo de desarrollo (dev, build, preview) lo cubre Vite con el plugin del
compilador; esta CLI no lo duplica ni lo sustituye. La analogía correcta es
`ng generate`, no `vite`.

El problema que resuelve no es "escribir menos ficheros". Es que **el andamiaje correcto
de un `.fud` no es obvio**: el orden top-level es estricto (decisión 53), un custom
element exige guión en el nombre (decisión 41), el `<link rel="component">` va en un sitio
distinto según el modo del fichero (decisión 59), y una página bajo layout debe declarar
las secciones que su layout exige. Todo eso son errores que hoy se descubren compilando.
La CLI los convierte en imposibles por construcción.

Consecuencia estructural buscada: la CLI es el **primer consumidor externo de la API del
compilador** (parseo y consulta por offset, edición por span). Si esa API no basta para
insertar un `<link rel="component">` en el sitio correcto de un fichero ajeno, tampoco
bastará para el language server. Este SDD la ejercita antes de que el LSP dependa de ella.

---

## 2. Dependencias

| SDD | Interfaz que aporta |
|---|---|
| **SDD-00** | Monorepo pnpm, TS estricto, Vitest. `@fudic/cli` es un paquete más bajo `packages/`. |
| **SDD-01** | `Span`, `Diagnostic`, `ParseResult`. La CLI reutiliza el tipo de diagnóstico del compilador; no define uno propio. |
| **SDD-05** | Parser HTML: AST con spans y navegación por offset. Necesario para `--in` (§4.4). |
| **SDD-10** | Estructura de documento: `structureDocument` clasifica el fichero en uno de los cuatro roles y expone el orden top-level con spans. La CLI **consulta**, no reimplementa. |
| **SDD-19** | Convención de proyecto: `routesDir` (defecto `routes`) y el mapeo *árbol de directorios → path de ruta*. La CLI genera dentro de esa convención; no la redefine. |
| **SDD-20** | El Service Worker no es un fichero de usuario: el plugin emite `fudic-sw.js` y el proyecto solo declara `sw.json`. Eso es lo que `fudic new` escribe. |
| **SDD-21** | Los cuatro roles de documento (`ComponentDocument` · `RouteDocument` · `PageDocument` · `LayoutDocument`), el orden top-level de una ruta (decisión 83), la arista `<link rel="layout" href>` y las directivas `@RenderBody()` / `@RenderHead()` / `@RenderSection(name)` / `@section name { … }`. La CLI **consume** esas reglas tal como las fija ese SDD; aquí no se redefinen. |

La CLI no depende del emit ni del runtime. Genera fuentes, no artefactos compilados.

> **Lo que SDD-21 NO aporta, y esta CLI por tanto no puede consumir.** (a) No existe
> *resolución* del layout aplicable a una ruta: SDD-21 deja el layout implícito por carpeta
> explícitamente **fuera de v1**; la arista es un `<link rel="layout" href>` local y escrito a
> mano. La CLI, que sí ve el disco, **elige** el layout por convención propia (§4.5) y escribe
> ese link. (b) No existe la distinción sección obligatoria / opcional:
> `@RenderSection(name)` toma un identificador desnudo y sin sección que lo llene **no emite
> nada ni diagnostica** — es el `required: false` de Razor, siempre. Todo lo que en este SDD
> dependía de secciones obligatorias se ha reescrito (§4.5, §6.8).

---

## 3. Interfaz pública

### 3.1. Superficie de comandos

```
fudic new <nombre>                    crea un proyecto
fudic generate <tipo> <nombre>        agrega una pieza      (alias: g)
  fudic g page <ruta>                                        (alias: p)
  fudic g component <tag>                                    (alias: c)
  fudic g layout <nombre>                                    (alias: l)
```

**Flags globales** (válidos en todos los comandos):

| Flag | Defecto | Efecto |
|---|---|---|
| `--dry-run` | — | Calcula el plan, lo imprime y sale. No escribe nada. |
| `--force`, `-f` | — | Sobrescribe destinos existentes. Sin él, colisión ⇒ exit 1. |
| `--cwd <ruta>` | `.` | Raíz del proyecto sobre la que operar. |
| `--json` | — | Serializa el plan/resultado a stdout. Todo lo humano va a stderr. |

**`fudic new <nombre>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--pm <pnpm\|npm\|yarn>` | `pnpm` | Gestor de paquetes (SDD-00 §3.3). |
| `--no-install` | — | Genera el árbol sin instalar dependencias. |
| `--no-git` | — | Omite `git init` y commit inicial. |
| `--no-sw` | — | Sin `sw.json`: el plugin no emite Service Worker (SDD-20 §4.7). |
| `--layout <nombre>` | `_layout` | Nombre del layout inicial, bajo `layouts/`. |
| `--target <nombre>` | `static` | Adapter de despliegue. Ver §4.6 (feature diferida). |

**`fudic g component <tag>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `components` | Directorio destino. |
| `--in <fichero>` | — | Cablea el `<link rel="component">` en `<fichero>`. **Repetible.** |
| `--no-style` | — | Omite el `<head>` con el `<style>` del componente. |
| `--slot` | — | Emite `<slot></slot>` en el markup. |

**`fudic g page <ruta>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `routes` | Directorio destino (`routesDir` de SDD-19). |
| `--layout <ruta>` | resuelto | Fuerza un layout concreto (path del `.fud`, relativo a `--cwd`). |
| `--no-layout` | — | Página autónoma (documento completo con doctype). |
| `--server` | — | Emite `@code { @server { ... } }` con `load()`. |
| `--sections <a,b,c>` | todas | Subconjunto de las secciones del layout a pre-rellenar. |

**`fudic g layout <nombre>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `layouts` | Directorio destino. |
| `--sections <a,b,c>` | — | Un `@RenderSection(nombre)` por nombre. |
| `--no-head` | — | Omite `@RenderHead()` (acepta `FUD0425`). |

### 3.2. API programática

El binario es una cáscara sobre esta API. Todo comando se expresa como **plan → aplicación**:

```ts
import type { Diagnostic } from '@fudic/compiler';

export type FileChange =
  | { readonly kind: 'create'; readonly path: string; readonly contents: string }
  | { readonly kind: 'modify'; readonly path: string; readonly contents: string;
      readonly before: string };

/**
 * Un efecto que no es un fichero: `pnpm install`, `git init`, `git commit`. `apply` los
 * ejecuta DESPUÉS de escribir los ficheros, en orden. `--dry-run` los lista sin ejecutar.
 * Sin esto el plan no sería exacto: `fudic new` haría cosas que el plan no describe.
 */
export interface PlanCommand {
  readonly command: string;
  readonly args: readonly string[];
  /** Relativo a `cwd`. */
  readonly dir: string;
}

/**
 * Un error de la CLI que NO viene de un fichero fuente: tag inválido, colisión, adapter
 * inexistente. No puede ser un `Diagnostic` — `Diagnostic` exige un `span` y aquí no hay
 * fuente donde señalar (SDD-01 §3.2: "un error sin localización no es accionable").
 */
export interface CliError {
  readonly code: string;      // FUD0440–FUD0459 (§3.3)
  readonly message: string;
  readonly file?: string;
}

/**
 * Un diagnóstico del compilador más el fichero al que pertenece. El span solo no es
 * accionable en una herramienta que lee varios ficheros en un comando: el editor sabe en
 * qué buffer está, una CLI no.
 */
export interface PlanDiagnostic {
  readonly file: string;          // relativo a cwd
  readonly diagnostic: Diagnostic;
}

export interface Plan {
  readonly changes: readonly FileChange[];
  readonly commands: readonly PlanCommand[];
  /** Del compilador, con span, sobre ficheros ajenos que la CLI ha tenido que leer. */
  readonly diagnostics: readonly PlanDiagnostic[];
  /** De la CLI, sin span. Un plan con `errors` no vacío NO se aplica. */
  readonly errors: readonly CliError[];
}

export interface BaseOptions {
  readonly cwd: string;
  readonly force: boolean;
}

export interface NewOptions extends BaseOptions {
  readonly pm: 'pnpm' | 'npm' | 'yarn';
  readonly install: boolean;
  readonly git: boolean;
  readonly sw: boolean;
  readonly layout: string;
  readonly target: string;
}

export interface ComponentOptions extends BaseOptions {
  readonly dir: string;
  readonly wireInto: readonly string[];
  readonly style: boolean;
  readonly slot: boolean;
}

export interface PageOptions extends BaseOptions {
  readonly dir: string;
  /** Path del `.fud` del layout, relativo a `cwd`. `null` ⇒ --no-layout. `undefined` ⇒ resolver. */
  readonly layout?: string | null;
  readonly server: boolean;
  /** null ⇒ todas las `@RenderSection` de la cadena de layouts. */
  readonly sections: readonly string[] | null;
}

export interface LayoutOptions extends BaseOptions {
  readonly dir: string;
  /** Un `@RenderSection(name)` por nombre. No hay obligatorias: SDD-21 §4.2. */
  readonly sections: readonly string[];
  /** Emitir `@RenderHead()` dentro del `<head>` (decisión 86). */
  readonly head: boolean;
}

export function planNew(name: string, opts: NewOptions): Promise<Plan>;
export function planComponent(tag: string, opts: ComponentOptions): Promise<Plan>;
export function planPage(route: string, opts: PageOptions): Promise<Plan>;
export function planLayout(name: string, opts: LayoutOptions): Promise<Plan>;

export function apply(plan: Plan, opts: BaseOptions): Promise<readonly FileChange[]>;

export function run(argv: readonly string[]): Promise<number>;  // devuelve exit code
```

**El plan es puro.** Las funciones `plan*` leen del disco pero no escriben. Toda escritura
ocurre en `apply`. Esto no es estética: es lo que hace `--dry-run` gratuito y exacto (es
literalmente el plan sin `apply`, no una simulación aparte que puede divergir), y lo que
permite testear cada comando sin tocar el sistema de ficheros.

**Códigos de salida:** `0` éxito; `1` error de uso o colisión sin `--force`; `2`
diagnóstico del compilador sobre un fichero a modificar (parseo fallido en `--in`).

### 3.3. Rango de diagnósticos

La CLI reserva **`FUD0440`–`FUD0459`** (SDD-21 llega hasta `FUD0436`). Se emiten como
`CliError`, no como `Diagnostic`: no tienen span.

| Código | Significado |
|---|---|
| `FUD0440` | Nombre de tag inválido: falta el guión o no es kebab-case (decisión 41). |
| `FUD0441` | El tag ya existe en el proyecto. |
| `FUD0442` | El tag colisiona con un nombre reservado por la spec de custom elements. |
| `FUD0443` | El destino ya existe y no se ha pasado `--force`. |
| `FUD0444` | El fichero de `--in` no existe. |
| `FUD0445` | El fichero de `--in` no parsea: la CLI no lo toca (exit 2). |
| `FUD0446` | Sección pedida que el layout no declara. |
| `FUD0447` | Adapter de despliegue no disponible (§4.6). |
| `FUD0448` | Error de uso: comando, tipo o argumento ausente o desconocido. |
| `FUD0449` | El layout indicado con `--layout` no existe o no es un layout. |

---

## 4. Comportamiento

### 4.1. Sin interactividad

**Ningún comando pregunta nada.** No hay prompts, ni menús, ni confirmaciones. Todo se
expresa por flags y la salida es determinista. Una CLI que pregunta no se puede meter en
un script, ni en CI, ni en un test. `fudic g` sin tipo ⇒ exit 1 con la lista de tipos
disponibles, no un selector.

### 4.2. Plantillas

Las plantillas son **ficheros `.fud` reales** en `packages/cli/templates/`, no cadenas
dentro del código, con marcadores sustituibles.

La razón es dura: al ser ficheros reales, entran en el pipeline de compilación del propio
repositorio. El test de aceptación §6.7 los compila. Si una plantilla genera código que no
parsea o que viola una decisión de gramática, **rompe el build del repo**, no la mañana de
un usuario. Una CLI de scaffolding que escupe ficheros rotos es peor que no tenerla.

### 4.3. `g component` — la forma de un componente, vacía

La plantilla emite **la estructura completa y nada dentro**: su `@code` con un tipo `Props`,
su desestructuración y un `@client {}` vacío; su `<head>` con un `<style></style>` salvo
`--no-style`; y el envoltorio host con su `<template shadowrootmode="open">` (decisión 75)
vacío, salvo `--slot`.

```
@code {
  type Props = {
  };

  const {} = props<Props>();

  @client {}
}

<head>
  <style></style>
</head>

<app-button>
  <template shadowrootmode="open">
  </template>
</app-button>
```

**Por qué el `@code` va siempre.** Lo que de verdad cuesta escribir a mano son las props: el
tipo, la llamada a `props<T>()` y saber que vive en la zona **neutral** de `@code`, fuera de
`@client`. Un componente que es solo HTML y estilo es el caso raro, no el común. Y un
`@client {}` vacío **no reclasifica nada**: un componente no tiene nivel propio —el chunk de
cliente se emite para todos, sin filtro de nivel (SDD-15)— así que aquí no hay inferencia a
la que mentir. Sigue sin existir un flag `--level` ni `--client`: el nivel efectivo es
`max(intrínseco, inducido por props entrantes)` y eso no se declara desde la línea de órdenes.

**Nada inventado encima.** Sin `<div class="<tag>">` de relleno, sin regla CSS de ejemplo, sin
comentario haciendo de markup: son decisiones sobre un componente que nadie ha escrito todavía,
y un placeholder es texto que el usuario tiene que borrar antes de escribir nada.

El `<style>` de la fuente **no lleva `host="<tag>"`**: ese marcador lo añade la serialización
(decisiones 67/70), no el autor. Una plantilla que lo escribiera estaría enseñando a mano una
cosa que el compilador pone solo.

**Validación del tag, en el comando y no en el navegador** (decisión 41):

1. Debe casar `[a-z][a-z0-9]*(-[a-z0-9]+)+` — guión obligatorio, kebab-case.
2. No puede colisionar con un tag ya existente en el proyecto.
3. No puede colisionar con un nombre de elemento HTML estándar ni con los prefijos
   reservados por la spec (`annotation-xml`, `font-face`, …).

Cualquiera de los tres ⇒ exit 1 sin escribir nada. `fudic g component card` falla aquí.

### 4.4. `--in` — cableado por span, no por concatenación

`--in <fichero>` inserta `<link rel="component" href="…">` en un fichero existente. Es la
**única operación de la CLI que modifica un fichero ajeno**; todo lo demás solo crea.

La inserción se hace sobre el AST del fichero destino, no con expresiones regulares:

1. Se parsea con `@fudic/compiler` y se clasifica el documento en uno de los **cuatro**
   roles de SDD-10 + SDD-21 (decisión 51 y §4.1 del SDD-21). Son cuatro, no dos, y el punto
   de inserción es distinto en dos de ellos.
2. **`ComponentDocument`:** el `<link>` va en el bloque de `link_component*` inicial, que por
   decisión 53 precede a `@code`, al `<head>` y al envoltorio host. Si ya hay links, se añade
   tras el último; si no, en el offset 0.
3. **`RouteDocument`:** también **top-level**, no dentro de `<head>` — el orden de una ruta
   (decisión 83) es `rel="layout"` → `rel="component"*` → `@code` → `<head>` → markup. Se añade
   tras el último `rel="component"`, o si no hay, tras el `<link rel="layout">`.
4. **`PageDocument` / `LayoutDocument`:** ahí sí va dentro de `<head>` (decisión 59), tras los
   `<link>` existentes. Múltiples links son válidos sin límite (decisión 55).
5. Si el `href` ya está presente, la operación es **idempotente**: no duplica, no
   diagnostica, no cuenta como modificación.
6. Si el fichero no parsea, la CLI **no lo toca**: emite los diagnósticos del compilador
   con su span y sale con código `2`. No se edita a ciegas un fichero roto.

El `href` se calcula relativo al fichero destino, con `./` explícito y extensión `.fud`.

> **Dónde vive la regla, desde SDD-28.** Los puntos 2–4 —el punto de inserción por rol— los
> implementa hoy `componentLinkAnchor` en **`@fudic/compiler`**
> ([`src/document/anchor.ts`](../../packages/compiler/src/document/anchor.ts)), no la CLI. El
> motivo es que dejó de tener un solo consumidor: el editor inserta el mismo `<link>` al
> aceptar el completado de un componente no enlazado ([SDD-28](./SDD-28-snippets.md) §3.3), y
> dos copias de una regla que depende del rol del documento divergen en silencio. `anchorFor`
> y `componentLinkTag` siguen exportándose desde `@fudic/cli` —la superficie pública de §3 no
> cambia—, y `wireComponentLink`, que es la escritura sobre el texto, sigue siendo suya.

### 4.5. `g page` — una sola forma, resuelta

**Mapeo `<ruta>` → fichero** (convención de SDD-19, invertida): `/` ⇒ `routes/index.fud`;
`blog` ⇒ `routes/blog.fud`; `blog/` ⇒ `routes/blog/index.fud`; un segmento `:x` o `[x]` ⇒
`[x].fud`. El path que el usuario escribe es el path de la URL, no el del disco: quien usa la
CLI piensa en rutas.

`g page` **no ofrece dos plantillas** (con layout / sin layout) para que el usuario elija.
Esa elección es una trampa: se elige mal y el error aparece al compilar. El comando **elige**
el layout y emite la forma que corresponda, ya cableada. Solo emite página autónoma si el
proyecto no tiene ningún layout o si se pasa `--no-layout`.

**Cómo elige el layout, y por qué le toca a la CLI hacerlo.** SDD-21 no resuelve layouts: la
arista es un `<link rel="layout" href>` escrito a mano, y el layout implícito por carpeta queda
fuera de v1 *porque el compilador es fs-free*. La CLI **sí** ve el disco, así que aporta lo que
al compilador le está vedado, con una regla explícita y local:

1. `--layout <ruta>` gana siempre. Si no existe o no es un `LayoutDocument` ⇒ `FUD0449`, exit 1.
2. Si no, se busca el `_layout.fud` más cercano subiendo desde el directorio de la página
   nueva, primero dentro de `--dir` y después en `layouts/` en la raíz del proyecto.
3. Si no aparece ninguno, página autónoma, sin error.

Elegido el layout, la CLI **lo parsea, sigue su cadena de `rel="layout"` y recolecta los
`@RenderSection(name)`**, y emite en la página nueva un `@section name { … }` por cada uno.
Sin esto el comando apenas ahorra teclas. `--sections` restringe ese conjunto; una sección
pedida que la cadena no declara ⇒ `FUD0446`, exit 1 (emitirla igual solo produciría un
`FUD0429` al compilar: contenido que no sale a ninguna parte).

Ninguna sección es obligatoria (SDD-21 §4.2), así que el defecto no puede ser "las
obligatorias": es **todas**, y quitar las que sobren es un `--sections` o borrar tres líneas.

`--server` añade la región `@server` con un `load()` esqueleto. En una **ruta** el `@code` es
la fase 3 del orden top-level (decisión 83), no va dentro del `<head>`; la decisión 60 (`@code`
en el `<head>`) aplica a la **página autónoma** y al layout, que son documentos con doctype.

### 4.6. `--target` — adapter de despliegue (feature diferida)

**Contrato.** `--target <nombre>` selecciona el *adapter de despliegue* del proyecto: el
paquete que traduce el output del compilador al formato que espera una plataforma
concreta. Un adapter aporta tres cosas y solo tres:

1. **Configuración de build** — el fragmento de config del plugin de Vite específico de la
   plataforma (formato de salida, rutas de assets, entry del handler SSR).
2. **Ficheros de plataforma** — los descriptores que la plataforma exige en la raíz del
   proyecto (p. ej. `wrangler.toml` para Cloudflare).
3. **Contrato de servido** — cómo la plataforma sirve el JS de componente con el estado
   `fud-state` inyectado, coherente con lo que hace el Service Worker.

`--target static` (el defecto) es el caso sin adapter: salida estática, sin descriptor de
plataforma, servida por cualquier servidor de ficheros.

**Estado en este SDD: especificado, no implementado.** No existe ningún adapter todavía.
Hasta que exista el primero:

- `--target static` se acepta y es equivalente a no pasar el flag.
- Cualquier otro valor ⇒ **exit 1** con `FUD0447` (`adapter '<nombre>' is not available`) y la
  lista de adapters instalados. **No se acepta silenciosamente.** Un flag que aparece en
  `--help`, se acepta y no hace nada es documentación falsa: el usuario cree que ha
  seleccionado una plataforma y el bug queda en su cabeza, no en el código.

**Forma prevista al incorporarse.** Los adapters serán paquetes independientes
(`@fudic/adapter-<nombre>`). Cuando el primero exista, `--target` en `fudic new` se
mantiene, y se añade `fudic add adapter <nombre>` para aplicarlo a un proyecto ya creado —
que es el caso frecuente, porque la plataforma de despliegue rara vez se decide el día en
que se crea el proyecto. Ambos comparten la misma implementación: aplicar un adapter es un
`Plan` como cualquier otro.

### 4.7. Salida

La salida distingue **creado** de **modificado**, porque el riesgo no es el mismo. Los
mensajes van **en inglés**, como todo string del repo (CLAUDE.md); solo esta spec está en
español:

```
  create  components/app-card.fud
  modify  routes/index.fud
  run     pnpm install
```

Con `--dry-run`, una creación se lista por nombre; una **modificación se muestra como
diff** de la inserción, y un comando se lista sin ejecutarse. Es la única forma de que el
usuario pueda revisar antes de aceptar un cambio sobre un fichero suyo.

Con `--json`, el plan completo va a stdout y todo lo humano a stderr, de modo que
`fudic g component app-card --json | jq` funcione sin filtrado previo.

---

## 5. Invariantes LSP

Este SDD no implementa el language server, pero es **el primer consumidor externo de la
API que el LSP usará**, y por eso hereda sus invariantes sin excepción:

- **La CLI nunca parsea con expresiones regulares.** Toda lectura de un `.fud` ajeno pasa
  por `@fudic/compiler`. Si la API no permite localizar el punto de inserción de un
  `<link rel="component">` por offset, el defecto está en la API, no en la CLI, y se
  corrige allí. Esa es la función de este SDD como banco de pruebas.
- **La CLI nunca lanza.** Los errores son diagnósticos con span y códigos de salida, no
  excepciones sin capturar. Un stack trace de Node en la terminal es un fallo de la CLI.
- **Los spans se preservan en la edición.** Una modificación por `--in` es una inserción en
  un offset exacto: no reformatea, no reordena atributos (decisión 47), no normaliza
  whitespace, no toca una sola línea que no sea la insertada.
- **Todo error sobre una fuente es un diagnóstico del compilador.** Mismo tipo, mismo formato,
  mismos spans que verá el usuario en el editor. Si la CLI y el LSP describen el mismo error de
  forma distinta, uno de los dos miente. Los errores que **no** son sobre una fuente (colisión
  de fichero, tag inválido en `argv`, adapter inexistente) son `CliError` (§3.2): no tienen
  span, y falsear uno para encajarlos en `Diagnostic` sería exactamente la mentira que esta
  regla prohíbe.

---

## 6. Criterios de aceptación

1. **Proyecto nuevo compilable.** `fudic new demo` produce un árbol con `layouts/_layout.fud`,
   `routes/index.fud` cableada contra él con `<link rel="layout">`, `vite.config.ts`,
   `package.json` (script `build: vite build`) y `sw.json` salvo `--no-sw`. El árbol **pasa un
   `vite build` real** con el plugin `@fudic/vite` del workspace y produce el HTML de `/`.
   *(El build del test se ejecuta con la API de Vite y las deps del workspace resueltas por
   alias: un `pnpm install` de verdad exigiría los `@fudic/*` publicados en npm, que no lo
   están. Lo que el criterio verifica —que el árbol generado compila— se verifica entero.)*

2. **Componente en N1.** `fudic g component app-card` crea un `.fud` **sin `@code`**, que
   `structureDocument` clasifica como `ComponentDocument` con `code === undefined`, envoltorio
   host + `<template shadowrootmode>` y un único `<style>` sin `host=`. *(La clasificación por
   nivel efectivo N1/N2/N3 la difiere SDD-12 —`SemanticModel` aún no la calcula—, así que el
   criterio se ancla en lo que hoy es observable: ausencia de `@code`, que es la condición que
   la plantilla debe garantizar.)*

3. **Validación de tag.** `fudic g component card` ⇒ exit 1, `FUD0440` sobre el guión
   obligatorio, **cero ficheros escritos**. Ídem `FUD0441` para un tag ya existente y
   `FUD0442` para `font-face` (un tag reservado por la spec; `section` ya cae en `FUD0440`
   por no llevar guión).

4. **Cableado en un componente.** `fudic g component app-icon --in components/app-card.fud`
   inserta el `<link>` antes del `@code` del destino. El fichero resultante parsea y
   respeta la decisión 53. Repetir el mismo comando **no duplica** el link ni reporta
   modificación (idempotencia, §4.4.5).

5. **Cableado en los otros tres roles.** Sobre una **ruta** el `<link>` se inserta top-level,
   tras el `<link rel="layout">` (decisión 83), **no** dentro de su `<head>`-fragmento. Sobre
   una **página autónoma** y sobre un **layout** se inserta dentro de `<head>` (decisión 59).
   Los tres resultados parsean y conservan su rol.

6. **Fichero destino roto.** `--in` sobre un `.fud` que no parsea ⇒ exit 2, diagnóstico con
   span, **fichero destino byte a byte idéntico** al de partida.

7. **Plantillas válidas por construcción.** Un test recorre `templates/`, materializa cada
   plantilla con valores de ejemplo y la parsea + estructura con el compilador. Cualquier
   plantilla que no parsee, que produzca diagnósticos de error o que caiga en un rol distinto
   del que le toca **rompe el build del repositorio**.

8. **Secciones desde el layout.** Un layout con `@RenderSection(aside)` y
   `@RenderSection(scripts)` ⇒ `fudic g page perfil` genera la página con `@section aside` y
   `@section scripts` (todas: ninguna es obligatoria, SDD-21 §4.2). `--sections scripts` deja
   solo esa; `--sections nope` ⇒ `FUD0446`, exit 1, cero ficheros escritos.

9. **`--dry-run` exacto.** Para todo comando, el conjunto de ficheros listados por
   `--dry-run` coincide exactamente con el que escribe la ejecución real. Una modificación
   se muestra como diff. Tras `--dry-run`, `git status` está limpio.

10. **Colisión.** Generar sobre un destino existente ⇒ exit 1 sin escribir. Con `--force`,
    sobrescribe y lo reporta como modificación.

11. **`--target` diferido.** `fudic new demo --target static` se comporta como sin flag.
    `fudic new demo --target cloudflare` ⇒ **exit 1**, `FUD0447`
    (`adapter 'cloudflare' is not available`), **cero ficheros escritos** (§4.6).

12. **`--json` limpio.** `fudic g component app-card --json` emite JSON válido y **solo**
    JSON en stdout; los mensajes legibles van a stderr.

13. **Sin interactividad.** Todos los comandos ejecutados con stdin cerrado terminan
    normalmente. Ningún comando bloquea esperando entrada.

14. **Comandos en el plan.** `fudic new demo --dry-run` lista `pnpm install`, `git init` y el
    commit inicial **sin ejecutarlos**; con `--no-install --no-git` el plan no los contiene.
    Tras `--dry-run`, el directorio destino no existe.

15. **Mapeo ruta → fichero.** `fudic g page /` ⇒ `routes/index.fud`; `fudic g page blog` ⇒
    `routes/blog.fud`; `fudic g page blog/` ⇒ `routes/blog/index.fud`;
    `fudic g page "blog/:slug"` ⇒ `routes/blog/[slug].fud`. Las cuatro son rutas que
    `@fudic/vite` descubre con los patrones que el usuario pidió.

---

## 7. Fuera de alcance

- **Dev server, build, preview, watch, HMR.** Los cubre Vite con el plugin del compilador.
  Esta CLI no los reimplementa ni los envuelve.
- **Implementación de adapters de despliegue.** `--target` queda especificado en §4.6 y
  rechaza cualquier valor distinto de `static`. El primer adapter y el comando
  `fudic add adapter <nombre>` viven en su propio SDD.
- **Generación de piezas distintas de página, componente y layout** (servicios, tests,
  módulos de rutas). Se añaden como tipos nuevos de `g` cuando el modelo los tenga.
- **Migración / codemods** (renombrar un tag y actualizar todos sus usos, mover un
  componente de directorio). Es edición masiva por AST: comparte infraestructura con
  `--in` pero es otro problema y otro SDD.
- **Presets o plantillas de usuario.** Las plantillas son las del paquete. La
  personalización de plantillas por proyecto no está prevista.
- **Publicación y versionado del propio paquete.** SDD de release, aparte.
