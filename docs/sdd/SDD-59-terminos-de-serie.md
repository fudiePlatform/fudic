# SDD-59 · Los términos: un runtime abierto en `@fudic/terms`

> **Estado:** `Hecho` (2026-10-17) · pendiente la prueba de producto de Pedro
> **Paquetes:** `@fudic/terms` (nuevo) · `@fudic/workbench` · `@fudic/spec` · `@fudic/language-server` · `fudic-vscode` · `examples/basic`
> **Rango:** `FUD1040`–`FUD1059`.
> **Lo necesita:** [BUG-50](./bugs/BUG-50-la-cli-que-nadie-entiende.md): el `.fudspec` que genera
> `fudic g component` trae un criterio que pasa sin que el usuario escriba ningún término.
> **Prioridad:** máxima. Sin esto, el banco solo sabe hacer clic y medir: no sirve para probar un
> componente de verdad.

---

## 1. Contexto y objetivo

Un `.fudspec` se escribe con **términos**: cada línea de un `given`, `when` o `then` es un módulo
`<block>/<nombre>.js` cuyo `run(ctx, args)` la ejecuta. Hoy eso tiene tres defectos que hacen la
herramienta inútil para casos normales.

### 1.1. `ctx` es una lista cerrada que vive dentro del banco

`ctx` lo construye `@fudic/workbench` ([context.ts:11-25](../../packages/workbench/src/context.ts#L11-L25),
creado en [engine.ts:106](../../packages/workbench/src/engine.ts#L106)) con cinco métodos:
`box`, `textContent`, `isVisible`, `click`, `setAttribute`. Por debajo hay Playwright entero,
pero el término no lo recibe. Cualquier término que necesite algo más (leer un atributo, pulsar
una tecla, saber a qué slot fue un nodo) obliga a cambiar el banco y publicarlo. Ni el usuario ni
nosotros podemos escribir un término sin tocar el banco. El tipo `TermContext` tampoco se exporta:
nadie sabe qué tiene `ctx` sin leer el código del banco.

Dos casos que hoy no se pueden expresar:

- **Teclado.** Un menú que por accesibilidad abre con una tecla: no hay forma de enviar la tecla
  ni de enfocar el componente.
- **Slots.** Un componente con slot: no hay forma de ponerle un hijo, y tampoco de comprobar en qué
  slot ha caído.

### 1.2. La página del banco no admite contenido

El banco monta `<tag attrs></tag>` sin hijos ([pages.ts:148-158](../../packages/workbench/src/pages.ts#L148-L158)).
La fixture solo da props. Un slot no se puede llenar.

### 1.3. No hay términos de serie

SDD-52 definió dos capas de términos, la del proyecto (`fudic/terms/`) y la del framework; gana
la primera que tiene el término, entero ([catalog.ts:2-5](../../packages/spec/src/catalog.ts#L2-L5)).
La del framework existe en el código —`frameworkTerms` en
[session.ts:39-40](../../packages/workbench/src/session.ts#L39-L40) y
[server.ts:89-90](../../packages/language-server/src/server.ts#L89-L90)— y ningún paquete la
llena. Cada proyecto escribe sus propios `click` o `text`.

### Objetivo

**El banco se amplía desde fuera, y por la misma puerta para todos.** El banco deja de saber
qué puede hacer un término: solo ejecuta pasos sobre una página y acepta **extensiones**. Una
extensión amplía el `ctx` que reciben los términos y puede preparar la página antes de montar el
componente.

- **Nosotros** ampliamos el banco con `@fudic/terms`, que es una extensión más: el `ctx` sobre
  Playwright real, sus tipos y los términos de serie. No usa ningún camino privado del banco.
- **El usuario** amplía el banco con la suya, en su proyecto, con el mismo API y sin tocar ningún
  paquete de fudic. Lo que nosotros podemos hacer, él también.

Y la fixture puede dar contenido al componente.

## 2. Dependencias

| SDD | Aporta |
|---|---|
| 52 | El lenguaje `.fudspec`, el contrato del módulo de término (`meta`, `run`, `selfTest`), las dos capas |
| 53 | `fudic g term`, la fixture y su lectura (`readFixtures`) |
| 32, BUG-48, BUG-49 | El banco: la página por criterio, `settled()` (esperar a que la página termine lo que provocó un gesto, hidratación incluida), las marcas de la captura, `fudic-workbench run` |
| 50 | `@fudic/diagnostics` |

## 3. Interfaz pública

### 3.1. El paquete

```
@fudic/terms
  src/index.ts           stock, defineExtension, termsDir, tipos públicos (§3.2)
  terms/
    when/   click.js · press.js · type.js · focus.js · set-attribute.js
    then/   visible.js · hidden.js · text.js · attribute.js · focused.js · slotted.js
            min-height.js · min-width.js
  dist/
```

- `dependencies`: `playwright-core` (la misma versión exacta que el banco).
- Se instala como **devDependency** del proyecto.
- `termsDir()` devuelve la carpeta `terms/`, absoluta.

### 3.2. El contexto que recibe un término

```ts
import type { Locator, Page } from 'playwright-core';

export interface TermContext {
  /** La página de Playwright donde está montado el componente: teclado, ratón, evaluate… */
  readonly page: Page;
  /**
   * Un Locator de Playwright por tag (`ui-menu`) o por rol (`role:menuitem/"Abrir"`).
   * Atraviesa shadow roots. El banco exige que resuelva a un solo elemento y lo marca en la captura.
   */
  locate(ref: string): Locator;
  /**
   * Ejecuta un gesto y espera a que la página termine lo que provocó: peticiones, chunks,
   * microtareas y la hidratación del primer gesto. Todo `when` que toca la página pasa por aquí.
   */
  act<T>(target: Locator, gesture: () => Promise<T>): Promise<T>;
  /** Lo que ve una persona: entra en shadow roots, pone cada slot con su contenido asignado. */
  text(target: Locator): Promise<string>;
}

export interface TermOutcome {
  readonly pass: boolean;
  readonly evidence: string | { readonly expected: unknown; readonly actual: unknown } | null;
}

export interface TermMeta<P extends string = string> {
  readonly name: string;
  readonly block: 'given' | 'when' | 'then';
  readonly params: readonly { readonly name: P; readonly type: 'element' | 'number' | 'string' | 'token' }[];
  readonly describe?: (args: Readonly<Record<P, string | number>>) => string;
}

// Un término .js lo usa en su `run` con un comentario JSDoc: @type {import('@fudic/terms').Term['run']}
// C es el ctx que ve: el de serie, o el que deja el `fudic/bench.js` del proyecto (§3.3).
export interface Term<P extends string = string, C extends TermContext = TermContext> {
  readonly meta: TermMeta<P>;
  run(ctx: C, args: Readonly<Record<P, string | number>>): Promise<TermOutcome>;
}

/** El ctx que deja una extensión; el de serie si no lo amplía. */
export type ContextOf<E> = /* el `Out` de su `context` */;

/** Lo que el banco le da al runtime: la página y sus avisos. */
export interface TermHost {
  readonly page: Page;
  /** Espera de BUG-48: lo que ya hace `settled()` hoy. */
  settle<T>(target: Locator, gesture: () => Promise<T>): Promise<T>;
  /** Para la captura: dónde estaba cada referencia resuelta. */
  onLocate(ref: string, box: { x: number; y: number; width: number; height: number }): void;
}

/**
 * Una ampliación del banco. El banco aplica las extensiones en orden —primero la de
 * `@fudic/terms`, después la del proyecto— y cada una recibe lo que dejó la anterior.
 */
export interface BenchExtension<In extends TermContext = TermContext, Out extends In = In> {
  /** Antes de montar el componente: emular medios, interceptar red, fijar viewport o idioma… */
  setup?(page: Page): Promise<void>;
  /** Amplía el ctx: devuelve el que verán los términos. */
  context?(ctx: In, host: TermHost): Out;
}

/** La extensión de serie: crea el ctx base sobre el TermHost. */
export const stock: BenchExtension;

/** Para escribir una con tipos. */
export function defineExtension<In extends TermContext, Out extends In>(
  extension: BenchExtension<In, Out>,
): BenchExtension<In, Out>;
```

El banco solo conoce `BenchExtension` y `TermHost`. No importa `@fudic/terms`: recibe la lista
de extensiones ya cargada.

`ctx.goto` desaparece: el banco monta el componente solo y nunca navega.

### 3.3. La extensión del usuario

Un proyecto amplía el banco con `fudic/bench.js`:

```js
import { defineExtension } from '@fudic/terms';

export default defineExtension({
  // Antes de montar: el componente se prueba en modo oscuro y sin red real.
  async setup(page) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.route('**/api/**', (route) => route.fulfill({ json: [] }));
  },
  // Un verbo nuevo para todos los términos del proyecto.
  context: (ctx) => ({
    ...ctx,
    async openMenu(ref) {
      const el = ctx.locate(ref);
      await ctx.act(el, () => el.press('Enter'));
    },
  }),
});
```

Sus términos usan `ctx.openMenu(...)`, con tipos: su `run` lleva
`@type {import('@fudic/terms').Term<string, import('@fudic/terms').ContextOf<typeof import('../../bench.js').default>>['run']}`
(decisión de Pedro, 2026-10-17). Sin ese fichero, el banco lleva solo la extensión de serie.

### 3.4. La fixture admite contenido

Una entrada de la fixture puede llevar `$content`: HTML que va **dentro** del host, como hijos,
renderizado en el servidor igual que lo escribiría una página.

```ts
// ui-card.fixture.ts
import type { Fixtures } from '@fudic/terms';
import type { $Props } from './ui-card.fud';

export default {
  base: {},
  conIcono: { $content: '<span slot="icon" role="img" aria-label="estrella">★</span>' },
} satisfies Fixtures<$Props>;
```

`Fixtures<P> = Record<string, P & { readonly $content?: string }>`. Las fixtures que hoy usan
`Record<string, $Props>` siguen valiendo.

### 3.5. Vocabulario de serie

| Bloque | Término | Parámetros | Hace / pasa cuando |
|---|---|---|---|
| `when` | `click` | `target: element` | clic, vía `act` |
| `when` | `press` | `target: element`, `key: string` | enfoca `target` y pulsa `key` (`"x"`, `"Enter"`, `"Shift+Tab"`), vía `act` |
| `when` | `type` | `target: element`, `text: string` | escribe `text` en `target`, vía `act` |
| `when` | `focus` | `target: element` | enfoca `target` |
| `when` | `set-attribute` | `target: element`, `attribute: token`, `value: string` | pone el atributo; la evidencia dice el valor anterior |
| `then` | `visible` | `target: element` | `isVisible()` |
| `then` | `hidden` | `target: element` | no visible |
| `then` | `text` | `target: element`, `expected: string` | el texto visible contiene `expected` |
| `then` | `attribute` | `target: element`, `attribute: token`, `expected: string` | `getAttribute(attribute) === expected` |
| `then` | `focused` | `target: element` | `target` es el elemento enfocado, atravesando shadow roots |
| `then` | `slotted` | `target: element`, `slot: token` | `target` está asignado al slot `slot` de su host (`default` = el slot sin nombre) |
| `then` | `min-height` | `target: element`, `px: number` | `height >= px` |
| `then` | `min-width` | `target: element`, `px: number` | `width >= px` |

Cada término de serie está escrito **solo** con el `ctx` de §3.2: si uno necesita algo que `ctx`
no da, el que está mal es `ctx`.

## 4. Comportamiento

1. **El banco no construye `ctx`.** Recibe una lista de `BenchExtension`. Por cada criterio
   ejecuta los `setup` en orden, monta el componente, y encadena los `context` en orden partiendo
   del `TermHost` (la página de Playwright real, `settled` y `onLocate`). `context.ts` sale del
   banco.
2. **Quién carga las extensiones.** La sesión resuelve `@fudic/terms` desde la raíz del proyecto
   (su `stock`) y, si existe, `fudic/bench.js` del proyecto, en ese orden. Sin `@fudic/terms`
   instalado, no hay `ctx` base y cualquier término da `error` con un mensaje que dice que falta
   el paquete.
3. **El banco le pasa la `Page` real.** `PageLike` sigue siendo la abstracción del banco para lo
   suyo (navegar, silenciar WebSockets, errores de página); las extensiones reciben la `Page` de
   Playwright que hay debajo.
4. **Un error al cargar o al ejecutar una extensión** es un `error` del criterio con su mensaje y
   el fichero, nunca un fallo del banco.
5. **Una referencia, un elemento.** `ctx.locate` mantiene la regla de hoy: si resuelve a más de
   uno, el paso da error diciendo cuántos.
6. **`$content`** se escribe dentro del host en la página del criterio, en el HTML que sirve el
   servidor. Sin `$content`, el host sale vacío como hoy.
7. **El proyecto gana.** Un `fudic/terms/then/text.js` del proyecto sustituye entero al de serie
   (regla de [catalog.ts:2-5](../../packages/spec/src/catalog.ts#L2-L5), sin cambios).
8. **`fudic/terms/` es para extender.** Un proyecto nuevo no lo tiene; aparece con el primer
   `fudic g term`, que genera el término con el `@type` de su `run`: `Term['run']`, o el de §3.3
   si el proyecto tiene `fudic/bench.js`. La bombilla del editor genera el mismo.
9. **Los términos de serie no exportan `selfTest`** (FUD0946 solo lo exige al proyecto,
   [term-module.ts:100](../../packages/spec/src/term-module.ts#L100)). Se prueban con los tests del
   paquete.
10. **El editor** resuelve la capa del framework por el proyecto del `.fudspec` (en un workspace,
    cada app y cada lib tiene la suya) y completa `ctx.` en un término `.js` gracias a los tipos,
    incluidos los métodos que añade `fudic/bench.js`.
11. **`examples/basic`** borra sus `click`, `set-attribute`, `text`, `visible`, `min-height`, y
    reescribe `given/route.js` sin `ctx.goto` o lo retira si ningún spec lo usa.

## 5. Invariantes

- Un término se valida leyendo su `meta` sin ejecutarlo (SDD-52); el contrato no cambia.
- El banco sigue sin compilar nada y sin leer el `vite.config` del proyecto.
- Cobertura: `@fudic/terms` nace al **100 %** en las cuatro métricas (`src/**/*.ts` y
  `terms/**/*.js`). `@fudic/workbench` y los demás paquetes tocados no bajan de su suelo.

## 6. Criterios de aceptación

### 6.1. Teclado

Un `ui-menu` que abre su lista con la tecla `x`:

```
component ui-menu

criterion abre-con-tecla
  given
    props base
  when
    press ui-menu "x"
  then
    visible role:menu
    focused role:menuitem/"Primero"
```

En verde con el componente que lo implementa; en rojo (`fail`, con evidencia) si el componente
no escucha la tecla.

### 6.2. Slots

`ui-card` con `<slot name="icon">` y la fixture `conIcono` de §3.4:

```
component ui-card

criterion icono-en-su-slot
  given
    props conIcono
  then
    slotted role:img/"estrella" icon
    visible role:img/"estrella"
```

En verde; en rojo si el componente no declara `icon`, con `actual` diciendo a qué slot fue (o
`none`).

### 6.3. El banco se amplía desde fuera

1. El banco funciona con extensiones falsas inyectadas en sus tests: ningún test del banco importa
   `@fudic/terms`, y ningún fichero de `packages/workbench/src` lo importa.
2. `packages/workbench/src/context.ts` no existe.
3. `@fudic/terms` solo usa lo público del banco: `BenchExtension` y `TermHost`.
4. Dos extensiones se encadenan en orden: la segunda recibe el `ctx` de la primera y sus `setup`
   corren uno tras otro antes de montar.

### 6.4. El usuario amplía el banco sin tocar fudic

Un proyecto con el `fudic/bench.js` de §3.3:

1. Un término propio `when/open-menu.js` que llama a `ctx.openMenu(target)` ejecuta en verde. Sin
   `fudic/bench.js`, el mismo término da `error` con `ctx.openMenu is not a function`.
2. Su `setup` se aplica: un `then` propio que lee `matchMedia('(prefers-color-scheme: dark)')`
   da `pass`, y una petición a `/api/…` del componente recibe `[]`.
3. Un `fudic/bench.js` que lanza al cargarse da `error` en cada criterio, con el mensaje y la ruta
   del fichero; el banco sigue vivo.

### 6.5. Un término nuevo sin tocar el banco

Un término del proyecto `then/has-class.js` que usa `ctx.locate(t).evaluate(...)` para leer
`classList` funciona sin cambiar ningún paquete de fudic.

### 6.6. Tipos

En VS Code, dentro de un término con `/** @type {import('@fudic/terms').Term} */`, escribir `ctx.`
ofrece `page`, `locate`, `act` y `text`, y `ctx.locate(x).` ofrece el API de `Locator`.

### 6.7. Vocabulario y capas

1. `termsDir()` devuelve una ruta absoluta que existe, con `given/`, `when/` y `then/`.
2. Cada término de §3.5 pasa el validador de SDD-52 con `layer: 'framework'` sin diagnósticos.
3. Cada término da `pass` en su caso positivo y `fail` (no `error`) en el negativo, con la
   evidencia de §3.5.
4. Un proyecto con `@fudic/terms` y **sin** `fudic/terms/` ejecuta en verde:
   ```
   component ui-button

   criterion renders
     given
       props base
     then
       visible ui-button
   ```
5. El mismo proyecto **sin** `@fudic/terms`: `visible` es un término desconocido, con el
   diagnóstico de SDD-52.
6. Un `fudic/terms/then/visible.js` del proyecto sustituye al de serie.
7. En un workspace con un proyecto con `@fudic/terms` y otro sin él, el editor valida cada
   `.fudspec` con la capa de su proyecto, y el completado tras `then` ofrece los de §3.5 en el
   primero.
8. `examples/basic`: sin sus términos duplicados, `pnpm test:spec` en verde.

## 7. Fuera de alcance

- Navegar entre páginas desde un criterio: el banco monta el componente solo.
- Ejecutar `selfTest` de los términos del proyecto.
- Términos escritos en `.ts`.
- La CLI (qué instala, qué genera): [BUG-50](./bugs/BUG-50-la-cli-que-nadie-entiende.md).
