# BUG-20 — El scaffold siembra la raíz del proyecto: no hay `src/`

> **Estado:** `Hecho` — los 12 criterios de §6 verdes
> **Corrige:** [SDD-22 §3.1, §4.2, §4.5, §6.1](../SDD-22-fudic-cli.md) (la convención de
> directorios que la CLI escribe) · [SDD-19 §3.2](../SDD-19-plugin-vite.md) (el defecto de
> `routesDir`, que es la otra mitad del mismo contrato)
> **Paquetes:** `@fudic/conventions` (**nuevo**, y es la corrección de fondo) ·
> `@fudic/cli` (`args.ts`, `layout.ts`, `plans/new.ts`, plantillas) ·
> `@fudic/vite` (`options.ts`) · `examples/basic` (el árbol, movido)
> **Rama:** `fix/bug-20-fuentes-en-src`
> **Depende de:** nada. Ningún SDD ni BUG en curso toca estos cuatro sitios
> **Reserva:** ningún código `FUD` nuevo (§3.5)

---

## 1. Contexto y síntoma

`fudic new demo` produce esto:

```
demo/
├── components/          ← fuente
├── layouts/             ← fuente
├── routes/              ← fuente
├── fudic-globals.d.ts
├── package.json
├── sw.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

Las tres carpetas de **fuente** nacen al mismo nivel que la configuración, y a los pocos minutos
comparten ese nivel con `node_modules/`, `dist/`, `public/` y `.fudic/`. No es un fallo de cálculo:
es lo que la CLI está escrita para hacer. Y es una convención que **nadie más usa**: el árbol que
un desarrollador espera de cualquier proyecto con bundler pone el fuente bajo `src/` y deja la raíz
para el tooling.

El síntoma no es estético del todo. La raíz de un proyecto es el sitio donde el usuario busca
`package.json` y `vite.config.ts`, y donde toda herramienta —el bundler, el `tsconfig`, el
`.gitignore`, el editor— empieza a mirar. Cuanto más se llena de fuente, más caro es cada uno de
esos gestos, y el coste no lo paga quien generó el árbol: lo paga quien lo hereda.

Lo que se espera:

```
demo/
├── src/
│   ├── components/
│   ├── layouts/
│   └── routes/
├── fudic-globals.d.ts
├── package.json
├── sw.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

**Por qué es un BUG y no una mejora.** Porque la convención de directorios de un scaffold es un
contrato: el plugin de Vite descubre rutas en un sitio y la CLI las escribe en ese sitio, y un
proyecto generado con una convención se queda con ella para siempre. Cambiarla en `0.0.1` cuesta
cuatro líneas de producción; cambiarla cuando haya proyectos ajenos cuesta una migración. La
ventana es ahora.

---

## 2. Causa raíz

### 2.1. La convención está escrita cuatro veces, y ninguna de las cuatro sabe de las otras

No hay un módulo que diga dónde vive el fuente. Hay cuatro literales, en dos paquetes:

| Sitio | Literal | Quién lo usa |
|---|---|---|
| [`cli/src/plans/new.ts:17-18`](../../../packages/cli/src/plans/new.ts#L17-L18) | `ROUTES_DIR = 'routes'`, `COMPONENTS_DIR = 'components'` | el árbol de `fudic new` y las plantillas |
| [`cli/src/layout.ts:23`](../../../packages/cli/src/layout.ts#L23) | `LAYOUTS_DIR = 'layouts'` | `fudic new` y el *fallback* de `candidates()` |
| [`cli/src/args.ts:252,266,279`](../../../packages/cli/src/args.ts#L252) | `'components'`, `'routes'`, `'layouts'` | los defectos de `--dir` de `g c` / `g p` / `g l` |
| [`vite/src/options.ts:48`](../../../packages/vite/src/options.ts#L48) | `DEFAULT_ROUTES_DIR = 'routes'` | el descubrimiento de rutas del plugin |

Los tres primeros están en el mismo paquete y **no se importan entre sí**: `plans/new.ts` declara
su propio `'routes'` mientras `args.ts` declara otro tres líneas de código más allá, y el `USAGE`
los repite en texto ([`args.ts:64,70,76`](../../../packages/cli/src/args.ts#L64)). Que los cuatro
digan hoy lo mismo es una coincidencia léxica sostenida a mano, no un invariante. **Esa es la causa
raíz**: la convención no está declarada en ningún sitio, así que no se puede cambiar en ningún
sitio — se cambia en cuatro, y el que se olvide no rompe la compilación, rompe el proyecto
generado.

### 2.2. El plugin tiene UNA sola perilla, y es lo que abarata la corrección

Podría esperarse que mover el fuente obligara a enseñarle al plugin tres directorios. No: el plugin
solo conoce `routesDir`. Los componentes y los layouts **no tienen directorio** para él — se
resuelven por `href` relativo desde el `<link rel="component">` / `rel="layout"` del importador
([`vite/src/transform.ts:93`](../../../packages/vite/src/transform.ts#L93), SDD-19 §4.11.4,
SDD-21 §4.7). Un `components/` compartido fuera de `routesDir` resuelve desde cualquier
profundidad, y por eso `'components'` y `'layouts'` son literales que **solo existen en la CLI**.

De ahí sale la propiedad que hace que esta corrección no sea un rediseño:

> **Si las cuatro carpetas bajan juntas a `src/`, ni un solo `href` cambia.**

`src/routes/blog/index.fud` sigue apuntando a `../../components/app-card.fud` y a
`../../layouts/_layout.fud` — las profundidades relativas son las mismas. El movimiento es un `git
mv` puro: el diff de contenido de los `.fud` es vacío.

### 2.3. Entre la CLI y el plugin no hay nada que importar, y por eso el contrato es un test

`@fudic/vite` es **devDependency** de `@fudic/cli`
([`cli/package.json`](../../../packages/cli/package.json)), no dependencia de runtime: la CLI no
puede importar el defecto del plugin. Y al revés tampoco —el plugin no puede depender de la CLI—,
porque invertiría la frontera: el que genera no manda sobre el que compila. Los dos comparten
`@fudic/compiler`, pero **ahí no cabe**: el compilador es *fs-free* por diseño (SDD-21 §1, CLAUDE.md
§Reglas de oro) y no conoce directorios; meterle la convención sería contradecir su invariante
central para ahorrarse un paquete.

Resultado: no hay **ningún** sitio del grafo de dependencias donde la convención pueda vivir hoy, y
por eso está copiada. Lo único que impide que los dos lados diverjan es
[`cli/test/new-build.test.ts`](../../../packages/cli/test/new-build.test.ts), que aplica `planNew`
sobre un directorio real y lo pasa por un `vite build` con `fudic()` **sin opciones**.

Pero un test es un detector, no un contrato: detecta la divergencia **después** de escribirla, y
solo la que atraviesa un `vite build` entero. La corrección de fondo es crear el sitio que falta
(§3.1). Con él, la prueba de que el BUG está cerrado cambia de forma y a mejor: cambiar la
convención pasa a ser **una línea en un paquete**, y `new-build.test.ts` **se queda en verde
mientras el árbol entero se mueve**. Un test que hoy solo puede estar verde por coincidencia pasa a
estarlo por construcción.

### 2.4. Alcance: los otros sitios que repiten la convención a mano

Misma causa —ningún sitio la declara—, vista desde sus consumidores:

- **El ejemplo del repo.** [`examples/basic`](../../../examples/basic) tiene `routes/`,
  `components/`, `layouts/` y `data/` en la raíz. No es un consumidor de la CLI, es una copia
  humana de su convención, y es lo que un usuario mira antes que ninguna documentación.
- **Los fixtures de los tests del plugin.** ~24 ficheros de `packages/vite/test` montan
  `root/routes` y llaman a `fudic()` sin opciones. No es duplicación inocente: es **el defecto lo
  que están probando**, y por eso el defecto es lo que hay que mover con ellos (§6.8).
- **Las plantillas y los READMEs.** `README.md.tmpl` y `vite.config.ts.tmpl` reciben los directorios
  **por variable**, así que se corrigen solos —salvo la alineación del árbol—; los que están escritos
  a mano no: [`cli/README.md:96`](../../../packages/cli/README.md#L96) y
  [`vite/README.md:19,25,36,77`](../../../packages/vite/README.md#L19).
- **Las specs.** SDD-22 §3.1/§4.2/§4.5/§6.1 y SDD-19 §3.2 fijan por escrito la convención vieja.
  Un SDD `Hecho` con la convención equivocada es lo que hace que el defecto vuelva.

### 2.5. Lo que NO es la causa

- **No es el mapeo ruta → fichero.** [`route.ts`](../../../packages/cli/src/route.ts) traduce
  `blog/:slug` a `blog/[slug].fud` **relativo a `--dir`**, y nunca ve la raíz. No se toca.
- **No es `walkFud`.** El escaneo de tags existentes
  ([`io.ts`](../../../packages/cli/src/io.ts)) recorre el proyecto entero desde `cwd` y ya salta
  `node_modules`/`dist`; con el fuente en `src/` encuentra exactamente lo mismo.
- **No es el compilador.** Es fs-free por diseño (SDD-21 §1): no conoce directorios, solo `href`.
  Esta corrección no le llega.
- **No es `resolveLayout`.** Su paseo hacia arriba corta en `routesDir`
  ([`layout.ts:41-52`](../../../packages/cli/src/layout.ts#L41-L52)) y sigue funcionando igual con
  `src/routes`; lo único suyo que cambia es el literal del *fallback* (§3.1).

---

## 3. Interfaz pública

### 3.1. `@fudic/conventions`: un paquete hoja que declara dónde vive un proyecto fudic

```ts
// packages/conventions/src/index.ts
/** Where a fudic project keeps its sources. Not an option: a convention (§4.2). */
export const SRC_DIR = 'src';
export const ROUTES_DIR = 'src/routes';
export const COMPONENTS_DIR = 'src/components';
export const LAYOUTS_DIR = 'src/layouts';
```

**Un paquete, no un módulo de la CLI**, y la razón es §2.3: el problema no es que la constante esté
repetida dentro de `@fudic/cli`, es que **las dos puntas del contrato viven en paquetes distintos y
no hay nada entre ellas**. Un `cli/src/convention.ts` arregla tres de los cuatro literales y deja el
cuarto —el del plugin— exactamente igual de suelto que hoy, con lo que la causa raíz sobrevive a su
propia corrección.

- **Es una hoja del grafo.** No depende de nada del workspace. `@fudic/cli` y `@fudic/vite` lo
  declaran como dependencia de **runtime** (`workspace:*`, se publica): el plugin lo necesita en el
  build del usuario, no solo en el nuestro.
- **La dirección de la dependencia es la correcta.** Nadie manda sobre nadie: los dos consumidores
  apuntan al mismo sitio, que es lo que hoy no existe (§2.3).
- **Cambiar la convención vuelve a ser una línea**, y el cambio llega a los dos paquetes por
  `pnpm install`, no por revisión.
- **El coste es un paquete de cuatro constantes**, con su `package.json`, su `tsconfig.build.json`
  y su umbral de cobertura al 100 % desde el primer commit (CLAUDE.md). Se paga a sabiendas: el
  precedente de un paquete diminuto ya está en el repo (`@fudic/tsconfig` publica **un** fichero de
  configuración), y la alternativa es seguir sin un sitio donde poner esto.

`LAYOUTS_DIR` **se muda** aquí desde
[`layout.ts:23`](../../../packages/cli/src/layout.ts#L23), donde está por accidente histórico —el
resolutor de layouts fue el primero que lo necesitó—. Tras la corrección, `args.ts`,
`plans/new.ts`, `layout.ts` y `options.ts` **no contienen ni un literal de directorio**: lo
importan.

### 3.2. `FudicOptions.routesDir` cambia de defecto

```ts
import { ROUTES_DIR } from '@fudic/conventions'; // 'src/routes'; era el literal 'routes'
```

Es un **cambio de comportamiento observable**, y el único de este BUG: un proyecto existente con
`routes/` en la raíz deja de descubrir rutas hasta que declare `fudic({ routesDir: 'routes' })` o
mueva la carpeta (§4.6). Se hace ahora y sin período de gracia porque estamos en `0.0.1` y no hay
proyectos publicados: la alternativa —dejar el defecto viejo y que la CLI escriba
`fudic({ routesDir: 'src/routes' })` en el `vite.config.ts` generado— deja **dos convenciones
vivas**, una en el plugin y otra en el scaffold, que es exactamente la enfermedad de §2.1 con un
síntoma más.

El tipo no cambia: `routesDir` sigue siendo opcional y sigue ganando sobre el defecto.

### 3.3. `--dir` no cambia, y es la vía de escape

`fudic g page about --dir routes` sigue escribiendo en `routes/`. Quien quiera otra convención la
tiene con la misma bandera de siempre; lo que cambia es lo que ocurre cuando **no** se dice nada.

### 3.4. Qué entra en `@fudic/conventions` y qué no

**Entra:** los cuatro directorios de §3.1. Nada más, y el criterio para lo que venga después es
estrecho: *un nombre que dos paquetes tienen que acordar y ninguno de los dos posee*.

**No entra**, aunque parezca de la misma familia:

- **Las versiones que el scaffold pincha** (`FUDIC_VERSION`, `VITE_VERSION`, `TYPESCRIPT_VERSION`,
  [`cli/src/project.ts:14-21`](../../../packages/cli/src/project.ts#L14-L21)). Son de la CLI y solo
  de ella: el plugin no pincha versiones en nada.
- **`fudic-globals.d.ts`.** Ya tiene dueño —`@fudic/language-core` exporta `GLOBALS_FILE_NAME` junto
  al contenido que lo llena—, y ese dueño es el correcto: quien genera el fichero es quien nombra
  el fichero.
- **`fudic-routes.json`, `fudic-sw.js`, `sw.json`.** Son de la salida del plugin, no de la forma del
  proyecto. Mudarlas aquí convertiría un paquete de convención en un cajón de constantes, que es
  cómo mueren estos paquetes.
- **`_layout.fud`.** Lo conocen la CLI y el compilador —no el plugin—, y el compilador no puede
  depender de esto (§2.3). Se queda donde está.

### 3.5. Sin códigos `FUD` nuevos

No hay nada que diagnosticar: ningún estado de disco pasa a ser ilegal. Mismo caso que BUG-16 a
BUG-19.

---

## 4. Comportamiento corregido

### 4.1. Bajo `src/` va el fuente; en la raíz se queda el tooling

La regla, y es la que decide cada caso futuro sin volver a discutirlo:

> **`src/` es lo que el autor escribe y el compilador lee. La raíz es lo que las herramientas
> leen antes de arrancar.**

| En `src/` | En la raíz | Por qué |
|---|---|---|
| `src/routes/`, `src/components/`, `src/layouts/` | | fuente `.fud` |
| | `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore` | los lee el tooling antes de existir el proyecto |
| | `sw.json` | política, no fuente: es la declaración que el plugin lee para emitir el SW (SDD-20 §4.7) |
| | `fudic-globals.d.ts` | contrato ambiental **generado**, nombrado a mano por el `include` del `tsconfig.json` y montado en memoria por el language server (SDD-23 §3.3). Vive junto al `tsconfig` que lo declara |
| | `public/` | convención de Vite, no nuestra |

### 4.2. `src/` no es configurable

No se añade una opción `srcDir` ni al plugin ni a la CLI. Una convención con perilla es dos
convenciones, y ya sabemos lo que cuestan (§2.1). La vía de escape existe y es más fina:
`--dir` por comando en la CLI, `routesDir` en el plugin.

### 4.3. El `vite.config.ts` generado sigue estando vacío

```ts
export default defineConfig({ plugins: [fudic()] });
```

Que el defecto del plugin acompañe al de la CLI es lo que mantiene esta propiedad, que es un
objetivo de SDD-22: el scaffold no configura nada porque no hace falta. Un `vite.config.ts` que
tuviera que declarar `routesDir` sería la prueba de que los dos paquetes no están de acuerdo.

### 4.4. Ni un `href` cambia

Las cuatro carpetas bajan **juntas**, así que toda ruta relativa escrita dentro de un `.fud`
—`rel="layout"`, `rel="component"`, `src` de un asset— conserva su profundidad (§2.2). En
`examples/basic` eso incluye los `import` de `@server`: `../../data/posts` sigue resolviendo porque
`data/` baja con las demás.

### 4.5. Lo que NO cambia

- **El compilador, el formateador y el language server.** Ninguno conoce directorios (§2.5).
- **El mapeo ruta → fichero** y el orden de rutas del plugin: son relativos a `routesDir`, que
  sigue siendo un directorio cualquiera.
- **La resolución de layouts**: el paseo hacia arriba y su corte en `routesDir` son los mismos; solo
  el *fallback* pasa a `src/layouts`.
- **La salida del build.** `dist/` es de Vite y no se mueve.

### 4.6. Migrar un proyecto que ya existe cuesta una de dos líneas

```sh
mkdir src && git mv routes components layouts src/
```

o, si se prefiere la convención vieja:

```ts
export default defineConfig({ plugins: [fudic({ routesDir: 'routes' })] });
```

Queda escrito aquí porque es lo único que un usuario de `0.0.1` puede notar, y porque la nota de
migración es más barata que el período de gracia que la evitaría.

---

## 5. Invariantes

**Los que el bug violaba**

- ***Una convención se declara una vez.*** Cuatro literales en dos paquetes no son una convención:
  son cuatro decisiones que hoy coinciden. Es el mismo mecanismo que
  [BUG-14 §5](./BUG-14-texto-literal-no-sobrevive.md) y
  [BUG-19 §4.1](./BUG-19-tres-constructos-sin-servidor.md) cerraron en el emit, aquí sobre el
  scaffold.
- ***El scaffold genera lo que un desarrollador reconoce.*** SDD-22 §1 lo dice de otra forma —«un
  árbol que compila»—, y un árbol que compila pero que nadie reconoce ya cuesta una explicación.
- ***La raíz del proyecto es del tooling.*** No estaba escrito, y por eso se pudo perder.

**Los que la corrección añade**

- **La convención vive en `@fudic/conventions`**, y cambiarla es cambiar una línea de un paquete
  que las dos puntas importan. Un literal de directorio en `cli/src` o en `vite/src` pasa a ser un
  defecto por sí solo, aunque acierte.
- **La CLI y el plugin están de acuerdo por construcción**, no por revisión — y además hay un test
  de extremo a extremo que lo comprueba con `fudic()` sin opciones (§2.3, §6.8).
- **Lo que baja a `src/` baja junto**, para que ninguna ruta relativa escrita por un autor dependa
  de una decisión de layout de directorios.

---

## 6. Criterios de aceptación

Tests en `packages/conventions/test/`, `packages/cli/test/` y `packages/vite/test/`. Los dos
marcados **rojo primero** se escriben contra el código actual y se ven fallar.

**El paquete**

0. `@fudic/conventions` exporta los cuatro nombres de §3.1 y **nada más** (§3.4); no declara ni una
   dependencia del workspace; `@fudic/cli` y `@fudic/vite` lo llevan en `dependencies`, no en
   `devDependencies`. Después de la tanda, **ni `packages/cli/src` ni `packages/vite/src` contienen
   un literal de directorio de proyecto** —`'routes'`, `'components'`, `'layouts'`—: es el criterio
   que dice que la causa raíz está cerrada, y se comprueba leyendo los dos `src`, no de memoria.

**El scaffold**

1. **(rojo primero)** `planNew('demo', …)` produce `demo/src/layouts/_layout.fud` y
   `demo/src/routes/index.fud`. **Ninguna** ruta del plan cae fuera de `demo/src/` salvo la lista
   explícita de §4.1 —`package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `sw.json`,
   `fudic-globals.d.ts`, `README.md`—, y el test enumera esa lista, no la deduce.
2. **(rojo primero)** El `href` del `<link rel="layout">` de la ruta generada sigue siendo
   `../layouts/_layout.fud`, byte a byte igual que hoy: las dos carpetas bajaron juntas (§4.4).
3. El `vite.config.ts` generado sigue siendo `fudic()` sin argumentos (§4.3).
4. El `README.md` generado muestra el árbol con `src/`.

**Los generadores**

5. Los defectos de `--dir` son `src/components`, `src/routes` y `src/layouts` para `g c`, `g p` y
   `g l`; el `USAGE` dice lo mismo que el código.
6. `--dir routes` sigue mandando sobre el defecto (§3.3), y `g page` con `--dir` fuera de `src/`
   escribe donde se le dice.
7. `resolveLayout` sin `--layout`: una página en `src/routes/blog/` encuentra
   `src/routes/_layout.fud` antes que `src/layouts/_layout.fud`, y con ninguno de los dos presentes
   resuelve a página suelta sin error.

**El contrato CLI ↔ plugin** (el oráculo de §2.3)

8. `new-build.test.ts`: `fudic new demo` + `vite build` con `fudic()` **sin opciones** prerenderiza
   `/` desde el layout y la ruta generados, y publica la ruta en el manifest. **Verde antes y verde
   después**, con el árbol cambiado de sitio entre medias — y esa es la demostración: con la
   convención en un paquete, el escenario que hoy rompería este test (mover un lado y no el otro)
   ya no se puede escribir.
9. `resolveOptions()` sin opciones resuelve `routesDir: 'src/routes'`; con `{ routesDir: 'routes' }`
   resuelve `'routes'`. La perilla no se pierde.

**Los tests del plugin**

10. Los fixtures de los tests de build migran a `src/routes` y siguen llamando a `fudic()` sin
    opciones: el defecto tiene que ser lo que ejercita la suite, porque un defecto que nadie recorre
    es un defecto que nadie protege. Los dos que ya pasan `routesDir` explícito —`plugin.test.ts`
    (`'fixtures'`) y `client.test.ts`— **no** se migran: son los que mantienen probada la perilla.

**El ejemplo**

11. `examples/basic` construye con sus cuatro carpetas (`routes`, `components`, `layouts`, `data`)
    bajo `src/`, y sus specs de Playwright pasan. El diff de contenido de los `.fud` es **vacío**:
    solo hay renombrados (§4.4).

**Cobertura.** `@fudic/conventions` nace con `thresholds` al **100 %** en las cuatro métricas y
`coverage.include: ['src/**/*.ts']`, como todo paquete nuevo (CLAUDE.md). Ni `@fudic/cli` ni
`@fudic/vite` bajan de donde están; la deuda heredada de `@fudic/vite` no se cita para rebajar nada.
Nada de `/* v8 ignore */`.

---

## 7. Fuera de alcance

- **Un `srcDir` configurable**, en el plugin o en la CLI. §4.2 lo decide en contra, y añadirlo sería
  reintroducir el problema con mejor nombre.
- **Mover `sw.json`, `public/` o `fudic-globals.d.ts`.** La tabla de §4.1 los deja en la raíz con su
  motivo; discutirlos aquí convertiría un movimiento mecánico en un rediseño del scaffold.
- **Estrechar el `include` del `tsconfig.json` generado** para que solo mire dentro de `src`. Hoy
  cubre el proyecto entero y sigue siendo correcto. Es una mejora aparte, y una que puede dejar
  fuera el `fudic-globals.d.ts` de la raíz si se hace sin pensarla.
- **`fudic migrate`.** La migración son dos líneas de shell (§4.6); un comando para eso es producto,
  no corrección.
- **Renombrar `routesDir`** o añadir opciones nuevas al plugin. Cambia el defecto, no la interfaz.
- **Meter en `@fudic/conventions` cualquier otra constante.** La lista de §3.4 es cerrada, y la
  regla —*un nombre que dos paquetes tienen que acordar y ninguno posee*— está para que este paquete
  no se convierta en el cajón donde acaba todo string compartido.
- **Migrar a `@fudic/conventions` a los demás paquetes.** Ninguno lo necesita: el compilador, el
  formateador y el language server no conocen directorios (§2.5). Un consumidor nuevo entra cuando
  tenga el problema, no por simetría.
- **El compilador, el formateador y el language server.** No conocen directorios (§2.5) y no se
  tocan.
- **La deuda de cobertura de `@fudic/cli` y `@fudic/vite`.** Se salda en su propia tanda.
