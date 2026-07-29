# SDD-22 — CLI de scaffolding (`@fudic/cli`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/cli` (binario `fudic`; monorepo pnpm, ver SDD-00 §3.5)
> **Depende de:** SDD-00, SDD-01, SDD-05, SDD-10, SDD-21
> **Decisiones de gramática:** 41, 51, 53, 55, 58, 59, 60, 62

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
| **SDD-10** | Estructura de documento: detección de modo (página / componente) y orden top-level. La CLI **consulta**, no reimplementa. |
| **SDD-21** | `@layout`, `@renderbody()`, `@renderheader()`, `@rendersection()`; resolución del layout aplicable a una ruta y distinción sección obligatoria / opcional. La CLI **consume** esas reglas tal como las fija ese SDD; aquí no se redefinen. |

La CLI no depende del emit ni del runtime. Genera fuentes, no artefactos compilados.

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
| `--no-sw` | — | Sin Service Worker. |
| `--layout <nombre>` | `main` | Nombre del layout inicial. |
| `--target <nombre>` | `static` | Adapter de despliegue. Ver §4.6 (feature diferida). |

**`fudic g component <tag>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `src/components` | Directorio destino. |
| `--in <fichero>` | — | Cablea el `<link rel="component">` en `<fichero>`. **Repetible.** |
| `--no-style` | — | Omite el bloque `<style host="<tag>">`. |
| `--slot` | — | Emite `<slot></slot>` en el markup. |

**`fudic g page <ruta>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `src/pages` | Directorio destino. |
| `--layout <nombre>` | resuelto | Fuerza un layout concreto. |
| `--no-layout` | — | Página autónoma (documento completo). |
| `--server` | — | Emite `@code { @server { ... } }` con `load()`. |
| `--sections <a,b,c>` | obligatorias | Subconjunto de secciones a pre-rellenar. |

**`fudic g layout <nombre>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `src/layouts` | Directorio destino. |
| `--sections <a,b,c>` | — | Un `@rendersection` por nombre. Sufijo `?` ⇒ opcional: `--sections aside?,scripts`. |
| `--no-header` | — | Omite `@renderheader()`. |

### 3.2. API programática

El binario es una cáscara sobre esta API. Todo comando se expresa como **plan → aplicación**:

```ts
import type { Diagnostic } from '@fudic/compiler';

export type FileChange =
  | { readonly kind: 'create'; readonly path: string; readonly contents: string }
  | { readonly kind: 'modify'; readonly path: string; readonly contents: string;
      readonly before: string };

export interface Plan {
  readonly changes: readonly FileChange[];
  readonly diagnostics: readonly Diagnostic[];
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
  readonly layout: string | null;   // null ⇒ --no-layout
  readonly server: boolean;
  readonly sections: readonly string[] | null;  // null ⇒ las obligatorias del layout
}

export interface LayoutOptions extends BaseOptions {
  readonly dir: string;
  readonly sections: readonly SectionDecl[];
  readonly header: boolean;
}

export interface SectionDecl { readonly name: string; readonly required: boolean }

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

### 4.3. `g component` — nivel inferido, nunca declarado

La plantilla de componente sale **sin `@code`**. Un componente recién creado es N1: markup
y, salvo `--no-style`, un `<style host="<tag>">`. Si el usuario quiere estado, escribe el
`@code { @client { ... } }` él.

**No existe un flag `--level` ni `--client`.** El nivel efectivo lo infiere el compilador
(`nivel_efectivo = max(intrínseco, inducido por props entrantes)`); un flag que lo fuerce
desde la CLI es una vía para mentirle a esa inferencia. Emitir un `@client {}` vacío "de
plantilla" es peor todavía: empuja a N3 falso desde el minuto cero, y N3 es exactamente lo
que el diseño mantiene al mínimo.

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

1. Se parsea con `@fudic/compiler` y se resuelve el modo del documento (decisión 51 y
   las reglas del SDD-21).
2. **Modo componente:** el `<link>` va en el bloque de `link_component*` inicial, que por
   decisión 53 precede a `@code` y al markup. Si ya hay links, se añade tras el último;
   si no, en el offset 0.
3. **Modo página / layout:** va dentro de `<head>` (decisión 59), tras los `<link>`
   existentes. Múltiples links son válidos sin límite (decisión 55).
4. Si el `href` ya está presente, la operación es **idempotente**: no duplica, no
   diagnostica, no cuenta como modificación.
5. Si el fichero no parsea, la CLI **no lo toca**: emite los diagnósticos del compilador
   con su span y sale con código `2`. No se edita a ciegas un fichero roto.

El `href` se calcula relativo al fichero destino, con `./` explícito y extensión `.fud`.

### 4.5. `g page` — una sola forma, resuelta

`g page` **no ofrece dos plantillas** (con layout / sin layout) para que el usuario elija.
Esa elección es una trampa: se elige mal y el error aparece al compilar. El comando
resuelve el layout aplicable con las reglas del SDD-21 y emite la forma que
corresponda, ya cableada. Solo emite página autónoma si el proyecto no tiene ningún layout
o si se pasa `--no-layout`.

Resuelto el layout, la CLI **parsea el layout y recolecta sus `@rendersection`**, y emite
en la página nueva un `@section` por cada sección **obligatoria**. Sin esto el comando
apenas ahorra teclas: el usuario compilaría, leería el error, volvería y escribiría la
sección. `--sections` restringe o amplía ese conjunto; una sección pedida que el layout no
declara ⇒ exit 1.

`--server` añade la región `@server` con un `load()` esqueleto (decisión 60: el `@code` de
una página vive en su `<head>`; para una página bajo layout, donde el SDD-21 lo
sitúe).

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
- Cualquier otro valor ⇒ **exit 1** con el mensaje `adapter '<nombre>' no disponible` y la
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

La salida distingue **creado** de **modificado**, porque el riesgo no es el mismo:

```
  creado     src/components/app-card.fud
  modificado src/pages/home.fud
```

Con `--dry-run`, una creación se lista por nombre; una **modificación se muestra como
diff** de la inserción. Es la única forma de que el usuario pueda revisar antes de aceptar
un cambio sobre un fichero suyo.

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
- **Los diagnósticos de la CLI son los del compilador.** Mismo tipo, mismo formato, mismos
  spans que verá el usuario en el editor. Si la CLI y el LSP describen el mismo error de
  forma distinta, uno de los dos miente.

---

## 6. Criterios de aceptación

1. **Proyecto nuevo compilable.** `fudic new demo` produce un árbol donde
   `pnpm install && pnpm build` pasa sin error. Incluye `src/layouts/main.fud`, una página
   raíz cableada contra él, y `sw.js` salvo `--no-sw`.

2. **Componente en N1.** `fudic g component app-card` crea un `.fud` sin `@code`. El
   compilador lo clasifica como **nivel 1** y su emit no produce ningún JS.

3. **Validación de tag.** `fudic g component card` ⇒ exit 1, mensaje sobre el guión
   obligatorio, **cero ficheros escritos**. Ídem para un tag ya existente y para `section`.

4. **Cableado en modo componente.** `fudic g component app-icon --in src/components/app-card.fud`
   inserta el `<link>` antes del `@code` del destino. El fichero resultante parsea y
   respeta la decisión 53. Repetir el mismo comando **no duplica** el link ni reporta
   modificación (idempotencia, §4.4.4).

5. **Cableado en modo página.** El mismo comando con `--in` sobre una página inserta el
   `<link>` dentro de `<head>` (decisión 59), no al principio del fichero.

6. **Fichero destino roto.** `--in` sobre un `.fud` que no parsea ⇒ exit 2, diagnóstico con
   span, **fichero destino byte a byte idéntico** al de partida.

7. **Plantillas válidas por construcción.** Un test recorre `templates/`, materializa cada
   plantilla con valores de ejemplo y la compila. Cualquier plantilla que no parsee o que
   viole una decisión de gramática **rompe el build del repositorio**.

8. **Secciones desde el layout.** Un layout con `@rendersection("aside")` opcional y
   `@rendersection("scripts")` obligatoria ⇒ `fudic g page perfil` genera la página con
   `@section scripts` y **sin** `@section aside`. `--sections nope` ⇒ exit 1.

9. **`--dry-run` exacto.** Para todo comando, el conjunto de ficheros listados por
   `--dry-run` coincide exactamente con el que escribe la ejecución real. Una modificación
   se muestra como diff. Tras `--dry-run`, `git status` está limpio.

10. **Colisión.** Generar sobre un destino existente ⇒ exit 1 sin escribir. Con `--force`,
    sobrescribe y lo reporta como modificación.

11. **`--target` diferido.** `fudic new demo --target static` se comporta como sin flag.
    `fudic new demo --target cloudflare` ⇒ **exit 1**, mensaje `adapter 'cloudflare' no
    disponible`, **cero ficheros escritos** (§4.6).

12. **`--json` limpio.** `fudic g component app-card --json` emite JSON válido y **solo**
    JSON en stdout; los mensajes legibles van a stderr.

13. **Sin interactividad.** Todos los comandos ejecutados con stdin cerrado terminan
    normalmente. Ningún comando bloquea esperando entrada.

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
