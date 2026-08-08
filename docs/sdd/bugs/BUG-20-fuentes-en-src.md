# BUG-20 — El scaffold siembra la raíz del proyecto: no hay `src/`

> **Estado:** `Listo` — causa raíz confirmada sobre el código, con fichero y línea
> **Corrige:** [SDD-22 §3.1, §4.2, §4.5, §6.1](../SDD-22-fudic-cli.md) (la convención de
> directorios que la CLI escribe) · [SDD-19 §3.2](../SDD-19-plugin-vite.md) (el defecto de
> `routesDir`, que es la otra mitad del mismo contrato)
> **Paquetes:** `@fudic/cli` (`args.ts`, `layout.ts`, `plans/new.ts`, plantillas) ·
> `@fudic/vite` (`options.ts`) · `examples/basic` (el árbol, movido)
> **Rama:** `fix/bug-20-fuentes-en-src`
> **Depende de:** nada. Ningún SDD ni BUG en curso toca estos cuatro sitios
> **Reserva:** ningún código `FUD` nuevo (§3.4)

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

### 2.3. El contrato entre la CLI y el plugin lo sostiene exactamente un test

`@fudic/vite` es **devDependency** de `@fudic/cli`
([`cli/package.json`](../../../packages/cli/package.json)), no dependencia de runtime: la CLI no
puede importar el defecto del plugin, y no debe — invertiría la frontera de paquetes. Lo único que
impide que los dos lados diverjan es
[`cli/test/new-build.test.ts`](../../../packages/cli/test/new-build.test.ts), que aplica
`planNew` sobre un directorio real y lo pasa por un `vite build` con `fudic()` **sin opciones**.

Ese test es el oráculo de este BUG: si se cambia un lado y no el otro, falla —el prerender de `/`
no encuentra ruta— y falla por la razón correcta. Merece decirse en positivo, porque define cómo se
implementa: **la primera tarea que se escriba deja el test en rojo, y solo vuelve a verde cuando
los dos paquetes están de acuerdo.**

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

### 3.1. Un módulo que declara la convención, en la CLI

```ts
// packages/cli/src/convention.ts
/** Where a fudic project keeps its sources. Not an option: a convention (§4.2). */
export const SRC_DIR = 'src';
export const ROUTES_DIR = 'src/routes';
export const COMPONENTS_DIR = 'src/components';
export const LAYOUTS_DIR = 'src/layouts';
```

`args.ts`, `plans/new.ts` y `layout.ts` lo consumen; ninguno vuelve a escribir un literal.
`LAYOUTS_DIR` **se muda** aquí desde `layout.ts:23` —donde está por accidente histórico, porque el
resolutor fue quien primero lo necesitó— y `layout.ts` lo importa. Es la única forma de que el
siguiente cambio de convención sea una línea y no cuatro.

### 3.2. `FudicOptions.routesDir` cambia de defecto

```ts
const DEFAULT_ROUTES_DIR = 'src/routes'; // era 'routes'
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

### 3.4. Sin códigos `FUD` nuevos

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

- **La convención vive en `convention.ts`**, y cambiarla es cambiar ese fichero.
- **La CLI y el plugin están de acuerdo, y hay un test que lo comprueba con `fudic()` sin
  opciones** (§2.3, §6.6).
- **Lo que baja a `src/` baja junto**, para que ninguna ruta relativa escrita por un autor dependa
  de una decisión de layout de directorios.

---

## 6. Criterios de aceptación

Tests en `packages/cli/test/` y `packages/vite/test/`. Los tres marcados **rojo primero** se
escriben contra el código actual y se ven fallar.

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

8. **(rojo primero)** `new-build.test.ts`: `fudic new demo` + `vite build` con `fudic()` **sin
   opciones** prerenderiza `/` desde el layout y la ruta generados, y publica la ruta en el
   manifest. Cambiar un solo lado deja este test en rojo — es lo que hay que ver antes de tocar el
   segundo.
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

**Cobertura.** `convention.ts` nace al **100 %** en las cuatro métricas. Ni `@fudic/cli` ni
`@fudic/vite` bajan de donde están; la deuda heredada de `@fudic/vite` no se cita para rebajar nada
(CLAUDE.md). Nada de `/* v8 ignore */`.

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
- **El compilador, el formateador y el language server.** No conocen directorios (§2.5) y no se
  tocan.
- **La deuda de cobertura de `@fudic/cli` y `@fudic/vite`.** Se salda en su propia tanda.
