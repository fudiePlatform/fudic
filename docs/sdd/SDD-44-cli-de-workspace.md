# SDD-44 — CLI de workspace: N apps, N libs

> **Estado:** `Listo`
> **Paquetes:** `@fudic/cli` · `@fudic/config` (consumido, no modificado)
> **Depende de:** 41, 22, 43 (su §4.1: qué publica una librería), 19, 20
> **Rango de diagnósticos:** `FUD0780`–`FUD0799`
> **Naturaleza:** scaffolding. No toca el compilador, ni el plugin, ni el runtime.
>
> `fudic new` crea **una** app y `fudic g` opera sobre **un** `--cwd`. No existe forma de
> crear una librería, ni de tener dos apps que compartan componentes sin montar el
> monorepo a mano. Este SDD pone la capa de encima.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay

[SDD-22](./SDD-22-fudic-cli.md) construyó la CLI para **un proyecto**: `fudic new <nombre>`
escribe un árbol de app —`package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`,
`fudic-globals.d.ts`, `sw.json`, un layout y la ruta índice— y `fudic g page|component|layout`
añade piezas dentro de él, con `--cwd` como raíz.

Funciona, y para una aplicación no le falta nada. Lo que no contempla es lo que motivó
[SDD-41](./SDD-41-configuracion-de-aplicacion.md): **una guía de estilos compartida por una
librería de componentes, compartida a su vez por varias apps bajo un shell.**

### 1.2. Una librería no es una app recortada

Es la tentación obvia —`fudic new` con menos ficheros— y es falsa. Lo que una librería
**no tiene** no es una lista de omisiones: es todo lo que hace falta para *servir* una
aplicación, y una librería no se sirve, se consume.

| | app | lib |
|---|---|---|
| rutas | sí | **no** — no tiene URL, ni `base`, ni origen |
| `vite.config.ts` | sí | **no** — no se construye sola |
| `sw.json` | opcional | **no** — la unidad de `sw.json` es el despliegue |
| `id` de aplicación | sí, si hay SW | **no** — no tiene cachés |
| `prefix` (una guía, no una regla) | opcional | opcional, y **el que más lo agradece** |
| `exports` en `package.json` | irrelevante | **es su interfaz entera** |

Y una diferencia que decide el resto: por [SDD-43](./SDD-43-librerias.md) §4.1 una
librería fudic **publica `.fud` fuente**, no compilado. Su `package.json` no apunta a un
`dist`: apunta a los `.fud`, y sus `files` los incluyen. Generarla como una app a la que se
le quitan cosas produce un paquete que no se puede consumir.

### 1.3. El objetivo

Que la CLI sepa crear un workspace, poblarlo de apps y de librerías, y que
`fudic g component|page|layout` sepa **a cuál de los N proyectos** va la pieza.

### 1.4. Lo que este SDD NO es

**No es un `angular.json`.** No hay fichero de workspace y no lo va a haber: la lista de
paquetes la posee `pnpm-workspace.yaml`, y un registro que la repita es un segundo sitio
donde vive el mismo dato — el argumento con el que este repo rechaza la tabla nombre→URL
(SDD-39 §4.7) y la segunda copia de `routesDir` (BUG-20). **Un directorio es un proyecto
fudic si tiene `fudic.json`**, y eso es toda la regla de descubrimiento.

Tampoco es la resolución de componentes entre paquetes: eso es SDD-43. Aquí se generan
los ficheros; que un `<link rel="component">` cruce la frontera es problema de aquel.

---

## 2. Dependencias

**SDD-41 — `fudic.json`.** El fichero, `readProjectConfig`, `ProjectConfig` con `id`,
`kind` y `prefix`, y `tagOf`. Este SDD **escribe** ese fichero y **descubre** proyectos
buscándolo; no redefine ni un campo.

**SDD-22 — CLI.** El modelo **plan → aplicación**: `Plan` con `changes`, `commands`,
`diagnostics` y `errors`; `FileChange`; `PlanCommand`; `CliError` sin span; `--dry-run`,
`--force`, `--cwd`, `--json`; `renderTemplate` y el directorio `templates/`. Todos los
comandos nuevos son planes, con las mismas garantías: nada se escribe si hay `errors`.

**SDD-43 — Librerías.** Solo su **decisión** (§4.1): una librería publica `.fud` fuente.
De ahí sale la forma del `package.json` que genera `fudic g lib`. No se depende de su
fontanería —bare specifiers, índice del LSP—, y por eso los dos pueden escribirse en
paralelo una vez esa decisión está fijada.

**SDD-19 / SDD-20.** Lo que un árbol de app lleva y por qué: `vite.config.ts` con el
plugin, `sw.json` opcional, `routesDir`. No cambia nada de eso; se replica por app.

---

## 3. Interfaz pública

### 3.1. La superficie de comandos

```
fudic new <nombre> --workspace      crea un workspace y su primera app
fudic g app <nombre>                añade una app                        (alias: a)
fudic g lib <nombre>                añade una librería
```

Y los tres que ya existen ganan un destino:

```
fudic g component <nombre> [--project <p>]
fudic g page <ruta>        [--project <p>]
fudic g layout <nombre>    [--project <p>]
```

**`fudic new <nombre> --workspace`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--workspace` | — | Sin él, `fudic new` es exactamente lo que era: **un proyecto suelto** |
| `--app <nombre>` | `<nombre>` | Nombre de la primera app. Un workspace vacío no es un estado útil |

Hereda de `fudic new` los suyos: `--pm`, `--no-install`, `--no-git`, `--no-sw`, `--layout`,
`--target`.

**`fudic g app <nombre>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `apps` | Dónde cuelga |
| `--id <id>` | `<nombre>` | El `id` de SDD-41. Escrito, no derivado (§4.4) |
| `--prefix <p>` | — | El prefijo que se **propone** al crear componentes en este proyecto. Opcional: es una guía (SDD-41 §4.4) |
| `--no-sw` | — | Sin `sw.json` — y entonces sin `id` obligatorio |
| `--uses <lib>` | — | Añade la dependencia `workspace:*` a esa librería. **Repetible** |

**`fudic g lib <nombre>`**

| Flag | Defecto | Efecto |
|---|---|---|
| `--dir <ruta>` | `libs` | Dónde cuelga |
| `--prefix <p>` | — | El prefijo que se **propone** al crear componentes en este proyecto. Opcional: es una guía (SDD-41 §4.4) |
| `--uses <lib>` | — | Una librería puede consumir otra. **Repetible** |

### 3.2. API programática

Tres planes más, de la misma forma que los cuatro de SDD-22:

```ts
export interface WorkspaceOptions extends NewOptions {
  /** The first app's name. A workspace with no app is not a useful state. */
  readonly app: string;
}

export interface ProjectOptions extends BaseOptions {
  readonly dir: string;
  readonly prefix: string;
  /** Workspace libraries this project depends on. */
  readonly uses: readonly string[];
}

export interface AppOptions extends ProjectOptions {
  readonly id: string;
  readonly sw: boolean;
}

export function planWorkspace(name: string, opts: WorkspaceOptions, io?: ReadIo): Promise<Plan>;
export function planApp(name: string, opts: AppOptions, io?: ReadIo): Promise<Plan>;
export function planLib(name: string, opts: ProjectOptions, io?: ReadIo): Promise<Plan>;
```

### 3.3. El descubrimiento

```ts
/** A fudic project found on disk: a directory with a `fudic.json`. */
export interface Project {
  /** Directory name — how `--project` names it. */
  readonly name: string;
  /** Absolute path of its root. */
  readonly path: string;
  readonly config: ProjectConfig;
}

/** Every fudic project under `root`. Empty outside a workspace; never throws. */
export function findProjects(root: string, io: ReadIo): readonly Project[];

/**
 * The project a command targets: `--project` when given, otherwise the nearest
 * `fudic.json` at or above `cwd`. `null` when neither answers (§4.3).
 */
export function targetProject(
  cwd: string,
  project: string | undefined,
  io: ReadIo,
): Project | null;
```

---

## 4. Comportamiento

### 4.1. La forma de un workspace

```
mi-tienda/
├── package.json            privado, sin dependencias de producción
├── pnpm-workspace.yaml     packages: ['apps/*', 'libs/*']
├── tsconfig.base.json      la config estricta, extendida por cada proyecto
├── fudic-globals.d.ts      UNA vez, en la raíz (§4.6)
├── .gitignore
├── apps/
│   └── tienda/             ← fudic.json (kind: app), vite.config.ts, sw.json, src/routes…
└── libs/
    └── ui/                 ← fudic.json (kind: lib), package.json con exports, src/components…
```

`apps/` y `libs/` son **de la CLI**, no de `@fudic/conventions`: los escribe ella y no los
lee nadie más. El descubrimiento va por `fudic.json` (§4.3), así que mover un proyecto a
otro sitio y ajustar `pnpm-workspace.yaml` sigue funcionando sin que la CLI se entere. Es
la razón por la que `--dir` existe y por la que estos dos nombres no bajan a un paquete
compartido: bajarlos sería declarar una convención que ninguna otra pieza consume.

**La raíz no es un proyecto fudic.** No lleva `fudic.json`, y eso no es un olvido: si lo
llevara, `targetProject` desde un `cwd` fuera de toda app resolvería a la raíz y sembraría
componentes en el directorio del monorepo. Un `cwd` que no está bajo ningún proyecto no
tiene destino, y eso es `FUD0781`.

### 4.2. `fudic new --workspace` crea la raíz **y** una app

Un workspace sin ninguna app no construye, no se puede probar y no enseña nada. El comando
entrega algo que corre: la raíz de §4.1 más `apps/<app>/` con el árbol completo que
`fudic new` ya sabe escribir, su `fudic.json` incluido.

`fudic new` **sin** `--workspace` no cambia en absoluto: sigue siendo el proyecto suelto de
SDD-22, con su `fudic.json` desde SDD-41. Es lo que mantiene el arranque de un solo
comando para el caso que sigue siendo el común.

### 4.3. A qué proyecto va una pieza

Dos vías, en este orden:

1. **`--project <nombre>`**, que casa contra el **nombre de directorio** de un proyecto
   descubierto. No existe → `FUD0782`, con la lista de los que sí.
2. **El `fudic.json` más cercano subiendo desde `--cwd`.** Es lo que hace que
   `cd apps/tienda && fudic g component card` funcione sin escribir nada más.

Ninguna de las dos contesta → **`FUD0781`**. No hay tercera vía, y en particular **no hay
proyecto por defecto**: elegir uno por orden alfabético, o por ser el único, es la clase de
conveniencia que escribe un fichero en el sitio equivocado el día que aparece el segundo.

`--cwd` no cambia de significado — sigue siendo la raíz sobre la que operar. Lo que este
SDD añade es que, para las tres piezas, la raíz del **proyecto** se busca desde ahí hacia
arriba.

### 4.4. El `id` se escribe, no se deriva

`fudic g app tienda` escribe `"id": "tienda"` porque se le dio ese nombre, no porque lo
calcule del directorio ni del `name` de npm. Los dos cambian por motivos que no tienen que
ver con la identidad de la app —renombrar una carpeta, publicar bajo otro scope— y
[BUG-33](./bugs/BUG-33-caches-por-app.md) §2.4 explica qué pasa cuando el identificador de
una caché se mueve: las del valor anterior no las purga nadie, jamás.

Un `id` repetido en el workspace es `FUD0724` (SDD-41 §4.7), y este comando es uno de los
dos sitios que lo emiten.

### 4.5. Una librería se genera para ser consumida

`fudic g lib ui` escribe:

- **`package.json`** con `name` bajo el scope de la raíz, `"type": "module"`, y — lo que la
  define — `exports` y `files` apuntando a los **`.fud` fuente**, no a un `dist` (SDD-43
  §4.1). Sin `vite`, sin `scripts` de build.
- **`fudic.json`** con `"kind": "lib"` y el `prefix`. **Sin `id`**: no tiene cachés.
- **`tsconfig.json`** que extiende el `tsconfig.base.json` de la raíz.
- **`src/components/`**, vacío.

Y **no** escribe: `vite.config.ts`, `sw.json`, `src/routes/`, ni un layout. Los cuatro son
de una app (§1.2).

**El prefijo es opcional, aquí y en una app**, y lo que hace es proponer (SDD-41 §4.4).
Ninguno de los dos comandos lo exige y ningún componente queda obligado a llevarlo: quien
escribe el proyecto decide cómo se llaman sus componentes.

Donde sí conviene ponerlo es en una librería, y por una razón práctica y no normativa: sus
tags van a convivir en el registro global de `customElements` de aplicaciones que ella no
controla, y un prefijo propio reduce la probabilidad de acabar en el `FUD0761` de SDD-43 —
que es el diagnóstico del tag **repetido**, el que de verdad rompe.

### 4.6. Un `fudic-globals.d.ts`, y una config de TypeScript

`fudic-globals.d.ts` se escribe **una sola vez en la raíz** y cada `tsconfig.json` de
proyecto lo incluye por ruta relativa. N copias del mismo fichero generado es N sitios que
pueden divergir cuando `GLOBALS_DTS` cambie de versión, y el aviso *«do not edit»* que el
fichero lleva no protege de eso.

`tsconfig.base.json` en la raíz lleva la config estricta; cada proyecto la extiende y solo
declara su `include`. Sin referencias de proyecto: un `.fud` no se compila con `tsc`, lo
comprueba `fudic check` (SDD-35), y las referencias serían andamiaje para un build que no
existe.

### 4.7. `--uses` enlaza paquetes, no componentes

`fudic g app tienda --uses ui` añade `"@mi-tienda/ui": "workspace:*"` a las dependencias de
la app, y nada más. **No escribe ningún `<link rel="component">`**: qué componente usa qué
fichero lo decide quien escribe el `.fud`, y para eso ya está `fudic g component --in`.

`--uses` que nombre algo que no es una librería del workspace es `FUD0785`. Un `--uses` a
una **app** también: una app no exporta nada y depender de ella es un error que se
descubriría mucho más tarde.

### 4.8. Una ruta no cabe en una librería

`fudic g page` con destino un proyecto `kind: "lib"` es **`FUD0783`**. Una librería no
tiene `routesDir`, no tiene `base`, no la construye ningún plugin y una ruta suya no sería
alcanzable por ninguna URL.

Un **layout** sí: desde [SDD-40](./SDD-40-props-de-layout.md) un layout declara props y es
una pieza compartible con sentido —la cáscara común de varias apps—, así que
`fudic g layout` en una librería es legal.

---

## 5. Invariantes

- **Plan → aplicación.** Los tres comandos nuevos calculan un `Plan` completo antes de
  escribir un byte, y un plan con `errors` no se aplica. `--dry-run` lo imprime entero,
  comandos de `pnpm` y `git` incluidos.
- **No hay registro de proyectos.** El descubrimiento es `fudic.json` sobre el disco.
  Ningún fichero de este SDD lista los proyectos del workspace.
- **La CLI genera fuentes.** Sigue sin depender del emit ni del runtime, exactamente como
  SDD-22 §2 la dejó.
- **No hay proyecto por defecto.** Sin `--project` y sin `fudic.json` hacia arriba, el
  comando falla (§4.3). Adivinar el destino es escribir en el sitio equivocado.
- **Nada lanza.** Un `fudic.json` roto en un proyecto del workspace lo excluye del
  descubrimiento con su diagnóstico (`FUD0720`, de SDD-41) y no tumba el comando.
- **Errores sin span.** Todo lo de este rango es `CliError`: no hay fuente donde señalar.
- **Cobertura.** El código nuevo de `@fudic/cli` nace al 100 % en las cuatro métricas.

### Catálogo de diagnósticos (`FUD0780`–`FUD0799`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0780` | `error` | `fudic g app` / `fudic g lib` fuera de un workspace: no hay `pnpm-workspace.yaml` en `--cwd` ni por encima. |
| `FUD0781` | `error` | No se puede resolver el proyecto destino: ni `--project`, ni un `fudic.json` en `--cwd` o por encima. |
| `FUD0782` | `error` | `--project <n>` no nombra ningún proyecto del workspace. El mensaje lista los que hay. |
| `FUD0783` | `error` | `fudic g page` con destino un proyecto `kind: "lib"`. Una librería no tiene rutas. |
| `FUD0784` | `error` | Ya existe un proyecto en ese directorio, o con ese nombre. Sin `--force`. |
| `FUD0785` | `error` | `--uses <x>` nombra algo que no es una librería del workspace: no existe, o es una app. |
| `FUD0786` | — | **Reservado y sin usar.** Fue «`fudic g lib` sin `--prefix`» en un borrador. El prefijo es opcional y es una guía (SDD-41 §4.4); ningún comando lo exige. |
| `0787`–`0799` | | Reservados. |

---

## 6. Criterios de aceptación

Tests en `packages/cli/test/workspace/` (1–6), `packages/cli/test/generate/` (7–12), y la
evidencia construida end-to-end (13–14).

**El workspace**

1. **(rojo primero)** `fudic new tienda --workspace` escribe la raíz de §4.1 —
   `package.json` privado, `pnpm-workspace.yaml` con `apps/*` y `libs/*`,
   `tsconfig.base.json`, `fudic-globals.d.ts`, `.gitignore`— **y** `apps/tienda/` con su
   árbol completo y su `fudic.json`. Hoy el flag no existe.
2. `fudic new tienda` **sin** `--workspace` escribe exactamente lo que escribía antes de
   este SDD, más el `fudic.json` de SDD-41. Byte a byte contra el golden existente.
3. **La raíz no es un proyecto.** No hay `fudic.json` en ella, y `findProjects` sobre el
   workspace recién creado devuelve **uno**: la app.

**Las piezas del workspace**

4. `fudic g app admin --id admin --prefix ad` añade `apps/admin/` con `vite.config.ts`,
   `sw.json` y `fudic.json` (`kind: "app"`, `id: "admin"`, `prefix: "ad"`), y **no** toca
   la app que ya estaba.
5. `fudic g lib ui --prefix ui` añade `libs/ui/` con `package.json` cuyos `exports` y
   `files` apuntan a `.fud`, `fudic.json` (`kind: "lib"`, **sin `id`**) y
   `src/components/`. Y **no** escribe `vite.config.ts`, ni `sw.json`, ni `src/routes/`,
   ni layout.
6. `fudic g lib ui` **sin** `--prefix` escribe la librería igual, con un `fudic.json` sin
   ese campo. Ningún comando lo exige (§4.5).

**El destino**

7. `cd apps/admin && fudic g component card` escribe en `apps/admin/src/components/`, con
   el tag prefijado por el `prefix` de **esa** app (`ad-card`), no por el de la otra.
8. `fudic g component card --project ui` desde la raíz escribe en `libs/ui/`, con el
   prefijo de la librería.
9. `--project noexiste` emite `FUD0782`, y el mensaje nombra los proyectos que sí hay.
10. Desde la raíz del workspace, sin `--project`, `fudic g component card` emite
    `FUD0781` y **no escribe nada**: no hay proyecto por defecto (§4.3).
11. `fudic g page /alta --project ui` emite `FUD0783`. `fudic g layout base --project ui`
    es legal y escribe el layout (§4.8).
12. `fudic g app tienda2 --uses ui` añade `"workspace:*"` a las dependencias y **ningún**
    `<link rel="component">`. `--uses tienda` (una app) emite `FUD0785`.

**La evidencia**

13. Un workspace generado por estos comandos —una app, una librería con un componente, la
    app consumiéndolo— **construye**: `pnpm install && pnpm build` en verde, y el
    componente de la librería aparece en el HTML de la app. Es el criterio que ata este
    SDD con SDD-43: si la resolución entre paquetes no está, este test lo dice.
14. **Cobertura.** El código nuevo de `@fudic/cli` al 100 % en las cuatro métricas; el
    paquete no baja del número que tiene al empezar.

---

## 7. Fuera de alcance

- **La resolución de componentes entre paquetes.** Es [SDD-43](./SDD-43-librerias.md).
  Aquí se generan los ficheros y la dependencia de `package.json`; que un
  `<link rel="component">` cruce la frontera es de allí. El criterio 13 es el punto donde
  los dos se tocan.
- **Un fichero de workspace.** §1.4. No lo hay.
- **`apps/` y `libs/` en `@fudic/conventions`.** Se quedan en la CLI (§4.1): nadie más los
  lee, y el paquete de convenciones es para nombres que **dos** paquetes deben acordar.
- **Referencias de proyecto de TypeScript.** §4.6. Un `.fud` no lo compila `tsc`.
- **Publicar una librería.** `npm publish` es de npm. Lo que este SDD garantiza es que el
  `package.json` generado describe bien lo que hay que publicar.
- **Mover un proyecto ya existente a un workspace.** No hay comando de migración. Crear el
  workspace y mover carpetas a mano es un `git mv` y un `pnpm-workspace.yaml`.
- **Que `fudic g app` registre la app en ningún sitio.** No hay dónde: `pnpm-workspace.yaml`
  usa patrones, no una lista, así que un proyecto nuevo bajo `apps/` ya está dentro.
