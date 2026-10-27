# SDD-71 — Pipes sin i18n y pipes del usuario

> **Estado:** `Listo` — [tareas](./SDD-71-Task.md).
> **Paquetes:** `@fudic/core` · `@fudic/i18n` · `@fudic/conventions` · `@fudic/config` ·
> `@fudic/api` · `@fudic/compiler` · `@fudic/language-core` · `@fudic/vite` · `@fudic/cli` ·
> `@fudic/diagnostics` · `examples/basic` · `examples/workspace`
> **Depende de:** 58 (los pipes, `"locales"`, `FUD1021`), 60 (el `.fudapi`, `fudic:<id>`, las
> carpetas y la raíz de navegador), 61 (la vista portable y su anexo), 45 (el runtime publicado y
> su linker), 22 y 44 (la CLI y sus plantillas), BUG-50 (lo generado pasa en verde sin tocarlo)
> **Rango de diagnósticos:** `FUD1340`–`FUD1359` (nuevo). Usa `FUD1340`. Retira `FUD1021`.
> **Decisiones de gramática:** 170–171 (nuevas). Enmienda la 158 (SDD-58) y SDD-61 §3.9 y A.2/A.4.
> **Origen:** sesión con Pedro del 2026-10-27.
> **Rama sugerida:** `sdd-71-pipes-del-usuario`
>
> **Qué añade en una frase.** Los pipes dejan `@fudic/i18n` y pasan a `@fudic/core`, sin que al
> navegador llegue un byte de lo que no se usa; toda app tiene idioma (`en` si no dice otro); y el
> usuario escribe sus propios pipes: el contrato en un `.fudapi`, la implementación en TS una sola
> vez en `src/pipes`, y para otro backend fudic genera la interfaz y su record.

---

## 1. Contexto y objetivo

SDD-58 metió los pipes dentro de `@fudic/i18n` para probarlos junto a las traducciones. Fue un
atajo, y deja cuatro problemas:

**1. Un pipe exige el paquete de traducciones.** `@(precio | euros)` necesita instalar
`@fudic/i18n` y escribir `"locales"` en `fudic.json`; si no, `FUD1021`. Formatear un precio no
tiene nada que ver con traducir una página. SDD-61 tuvo que meter `"locales": ["es"]` en
`examples/basic` solo para que el reloj pintara la hora.

**2. Una app nueva no tiene idioma.** `fudic new` y `fudic g app` no escriben `"locales"`
(`templates/fudic.json.tmpl`), y `g layout` y `g page` escriben `lang="en"` a mano
(`plans/layout.ts:31`, `plans/page.ts:59`). El único camino es `fudic add i18n --locales`.

**3. El catálogo es cerrado.** Hay seis pipes, los de `Intl`. Un pipe propio solo puede ser uno de
esos seis con otras opciones. Las iniciales de un nombre, truncar un resumen o pintar un estado
con su texto no se pueden hacer. Y la vista no puede hacerlos por su cuenta, porque la lista blanca
de SDD-61 no tiene métodos de texto.

**4. Nadie sabe cómo llevar un pipe a otro backend.** El anexo de SDD-61 promete que los seis de
`Intl` vienen portados (`Fud.Format`). Para uno propio no dice nada.

Esta spec arregla los cuatro:

| | Hoy | Con esta spec |
|---|---|---|
| Dónde viven los presets | `@fudic/i18n` | `@fudic/core` |
| Idioma de una app sin `"locales"` | Ninguno: `FUD1021` | `en` (`DEFAULT_LOCALE` de `@fudic/conventions`) |
| `fudic new` en otro idioma | `fudic add i18n --locales` después | `fudic new tienda --locale es` |
| Un pipe propio | Imposible | `src/pipes/<nombre>.fudapi` + `src/pipes/<nombre>.ts` |
| Ese pipe en C#, Java, Go… | — | fudic genera la interfaz y el record de sus parámetros; la implementación es del equipo de backend |
| Lo que llega al navegador | `$format` y su caché si un módulo traduce | Solo el preset o el pipe que una vista importa |

### 1.1. Lo decidido (no se reabre)

1. **El idioma por defecto es `en`** y vive en `@fudic/conventions`. Sin `"locales"`, una app se
   comporta como con `"locales": ["en"]`. Quien quiera otro lo pasa a `fudic new` o a `fudic g app`
   con `--locale`.
2. **Los pipes no necesitan `@fudic/i18n`.** Viven en `@fudic/core`. Al navegador no llega **ni
   un byte** de un pipe que ninguna vista usa, ni del catálogo ni del usuario.
3. **Un pipe propio se declara en un `.fudapi`** y se implementa en TS **una sola vez**, en
   `src/pipes`. Ese fichero es el que importan la vista, el render de servidor en Node y el
   navegador. No va en `src/browser` ni en `src/server`.
4. **Para otro backend, fudic genera definiciones y ahí termina.** La interfaz del pipe y el
   record (o struct) de sus parámetros. Implementarla es responsabilidad del equipo de backend:
   fudic no comprueba si está hecho, no avisa y no hace fallar ningún build por eso. Es la misma
   regla que el resto del `.fudapi`.
5. **Sin magia en el compilador.** Aplicar un pipe es llamar a un método de un valor que la vista
   importó. El compilador no distingue los del catálogo de los del usuario.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 58 | El pipe `a \| p` en la vista (decisión 158), sus seis presets, `format()` y `locale` sustituidos por el compilador, `"locales"` y su lectura (`config/src/read.ts`), un grafo de módulos por idioma, `$pipe` en la proyección y `FUD1021`. |
| 60 | El `.fudapi`: ficheros de extensiones (`rule`, `middleware`, `pattern`), nombres kebab-case → camelCase, visibilidad de proyecto (`FUD1081`), `fudic:<id>` y sus `.d.ts` en `.fudic/api`, las carpetas configurables y la raíz de navegador, que carga **entero** `src/browser` (`vite/src/api-root.ts`). |
| 61 | La lista blanca de la vista, el corte de servidor (§3.9: qué puede importar la vista), los tipos portables (§3.10) y el anexo normativo de bajada (A.2, A.4). |
| 45 | El runtime publicado: el linker contesta cada nombre de un paquete `@fudic/*` con su pieza publicada. |
| 22, 44 | Los planes de la CLI, `resolveTarget`, `targetChange` (`FUD0443`), las plantillas, `FUD0725` con `problem: 'flag'`. |
| BUG-50 | Lo que genera la CLI pasa `pnpm test` y `pnpm spec` sin tocarlo. |

## 3. Interfaz pública

### 3.1. El idioma de la app

```ts
// @fudic/conventions
/** The language of an app whose fudic.json declares no `locales`. */
export const DEFAULT_LOCALE = 'en';
/** Where the pipes a project writes live: their `.fudapi` and their implementation. */
export const PIPES_DIR = 'src/pipes';
```

```jsonc
// fudic.json
{
  "id": "tienda",
  "kind": "app",
  "prefix": "app",
  "locales": ["es"],      // opcional; ausente = ["en"]
  "pipes": "src/pipes"    // opcional, como "server" y "browser"
}
```

- **`locales` ausente** en una app es `[DEFAULT_LOCALE]`. `ProjectConfig.locales` deja de ser
  opcional en una app: `readConfig` lo rellena. Un idioma no lleva prefijo en las URL ni
  catálogos (SDD-58 §4.5), así que una app sin `"locales"` sigue sirviendo exactamente las mismas
  URL que hoy.
- **Una librería no tiene idioma.** Sus `.fud` los compila la app que la consume (SDD-43), con el
  idioma de esa app. `"locales"` en el `fudic.json` de una librería se ignora, como hoy.
- **`"pipes"`** se lee como `"server"` y `"browser"` (`readFolder`), y su valor por defecto es
  `PIPES_DIR`.

### 3.2. `pipe` en el `.fudapi` (decisión 170)

```
# src/pipes/truncar.fudapi
# Cuts a text at `max` characters and adds an ellipsis.
pipe truncar
  on str
  max u32
```

```
pipe <nombre>
  on <tipo>+        # lo que formatea: uno o más tipos del .fudapi (una unión)
  <param> <tipo>    # cero o más parámetros
```

- **Es una extensión**, como `rule`: va en un fichero de extensiones. Mezclarlo con un contrato es
  `FUD1078`. Su nombre es kebab-case y en TS camelCase (`nombre-corto` → `nombreCorto`). Es de
  proyecto: un nombre repetido en la app o sus librerías es `FUD1081`.
- **`on` es obligatorio.** Sin él, `FUD1340`. Vale cualquier tipo de §3.2 de SDD-60: `str`,
  números, `date`, `uuid`, listas, `map`, un `type` o un `enum` del proyecto. Varios tipos son una
  unión (`on date i64`).
- **Un pipe siempre da texto.** No se declara lo que devuelve: lo que sale de un pipe se pinta.
- **Los parámetros** siguen las reglas de los argumentos (SDD-60 §3.2): nombre, tipo y `?` si
  puede faltar.
- Las líneas `#` de encima son su documentación, que se ve en el hover de la vista.

### 3.3. Lo que se genera: `fudic:pipes/<nombre>`

El `<id>` es la ruta del `.fudapi` sin `src/` ni extensión, como en todos: `src/pipes/truncar.fudapi`
es `fudic:pipes/truncar`. Exporta, por cada `pipe`:

```ts
// .fudic/api/pipes/truncar.d.ts (generated)
import type { Pipe } from '@fudic/core';

export interface TruncarArgs {
  readonly max: number;
}
export type TruncarFormat = (value: string, args: TruncarArgs, locale: string) => string;

export declare const truncar: {
  /** Binds the implementation. With parameters, what it returns takes them. */
  implement(format: TruncarFormat): (args: TruncarArgs) => Pipe<string>;
};
```

Sin parámetros no hay `Args` y `implement` devuelve el pipe directamente:

```ts
export type InicialesFormat = (value: string, locale: string) => string;
export declare const iniciales: { implement(format: InicialesFormat): Pipe<string> };
```

- **`implement` no registra nada.** Devuelve un valor, y quien lo quiere lo importa. Esto lo
  diferencia de `.check` y `.handle` (SDD-60 §3.12), y es lo que permite que un pipe sin usar no
  llegue al navegador.
- **El módulo generado de un fichero que solo declara pipes** importa `@fudic/core` y nada más:
  ni la raíz de navegador, ni el registro, ni `@fudic/http`. Si importara la raíz, usar un pipe
  traería todo `src/browser`.

### 3.4. `@fudic/core`

```ts
/** A pipe: formats a `T` as text for a locale. The view calls `format` with the page's locale. */
export interface Pipe<in T> {
  /** `'pipe'` for one the project declares; otherwise the Intl formatter it presets. */
  readonly kind: 'date' | 'number' | 'currency' | 'percent' | 'relative-time' | 'list' | 'pipe';
  /** The `.fudapi` name of a project's pipe. Absent in a preset. */
  readonly name?: string;
  /** A preset's options, or a project pipe's arguments. Plain data. */
  readonly options: Readonly<Record<string, unknown>>;
  format(value: T, locale: string): string;
}

// The presets: the same six, the same signatures as SDD-58 §3.2.
export function date(options: Intl.DateTimeFormatOptions & { timeZone: string }): Pipe<Date | number>;
export function number(options?: Intl.NumberFormatOptions): Pipe<number | bigint>;
export function currency(code: string, options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>): Pipe<number | bigint>;
export function percent(options?: Omit<Intl.NumberFormatOptions, 'style'>): Pipe<number>;
export function relativeTime(unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): Pipe<number>;
export function list(options?: Intl.ListFormatOptions): Pipe<readonly string[]>;

// Replaced by the compiler, as in SDD-58: they move here with the presets.
export declare const locale: string;
export function format<T>(value: T, pipe: Pipe<T>): string;
```

- **`format` es un método del pipe**, también en los presets. Un preset sigue siendo un dato:
  `kind` y `options` es todo lo que necesita un backend en otro lenguaje para formatearlo con su
  ICU. El método solo existe para el runtime de TS. Esto enmienda la decisión 158 («un preset no
  tiene funciones dentro»).
- **Cada preset trae solo su formatter de `Intl`.** `date` usa `Intl.DateTimeFormat` y nada más.
  Guarda su formatter por idioma dentro del propio preset. `$format` y su `WeakMap` desaparecen.
- `locale` y `format` se mudan con los presets. En `@fudic/i18n` quedan `t()`, `$message`,
  `$href` y el catálogo.

### 3.5. La vista

```html
@code {
  import truncar from '../pipes/truncar';
  import iniciales from '../pipes/iniciales';
  import { currency } from '@fudic/core';
  const corto = truncar({ max: 40 });
  const euros = currency('EUR');
}
<p>@(post.resumen | corto)</p>
<p>@(post.autor | iniciales)</p>
<p>@(post.precio | euros)</p>
```

- **El operador no cambia** (decisión 158): a la derecha va una expresión de tipo `Pipe<T>` que
  formatea lo que hay a la izquierda. Lo comprueba el pase tipado sobre `$pipe(a, b)` (SDD-58
  §3.6).
- **Un pipe con parámetros se fija en `@code`**, igual que `currency('EUR')`: el argumento es un
  literal de datos (SDD-61 §3.9). En la vista no se llama a nada.
- **Enmienda de SDD-61 §3.9 (decisión 171).** La vista puede importar el `export default` de un
  fichero de la carpeta de pipes del proyecto o del `pipes/*` de una librería. Ese nombre solo
  puede ir a la derecha de un `|` o llamarse en una `const` del corte con un literal de datos. Lo
  demás es `FUD1150`, como cualquier valor del corte sin forma permitida.

### 3.6. La CLI

```sh
fudic new tienda                       # sin "locales": la app es "en"
fudic new tienda --locale es           # "locales": ["es"]
fudic new tienda --workspace --app web --locale es
fudic g app admin --locale fr          # dentro de un workspace
fudic g pipe truncar                   # src/pipes/truncar.{fudapi,ts,test.ts}
fudic g pipe truncar --on Post --project ui
```

- **`--locale <tag>`** en `new` y en `g app`. Se normaliza con `Intl.getCanonicalLocales`. Si no
  es una etiqueta BCP 47, `FUD0725` con `problem: 'flag'`. Con `--locale`, el `fudic.json` lleva
  `"locales": [tag]`; sin él, no lleva la clave. En una librería (`g lib`, `new --lib`) la opción
  no existe (`unknown-flag`).
- **`lang` del layout y de las páginas.** `g layout`, `g page` y la página de `new` escriben
  `<html lang="…">` con el primer idioma del proyecto, o con `DEFAULT_LOCALE` si no tiene ninguno.
  Hoy escriben siempre `en`.
- **`fudic g pipe <nombre>`** en una app o una librería escribe tres ficheros en la carpeta de
  pipes. Con `--on <tipo>` el `on` es ese tipo; sin él, `str`. Lo generado pasa en verde sin
  tocarlo (§4.6).
- **Una librería publica sus pipes.** `templates/lib/package.json.tmpl` gana
  `"./pipes/*": "./src/pipes/*.ts"` en `exports`.

### 3.7. Diagnósticos

| Código | Cuándo |
|---|---|
| `FUD1340` | `pipe` sin `on`: «a pipe declares what it formats: `on <type>`». Subraya el nombre. |

`FUD1021` se retira: toda app tiene idioma. Su `.ts` se borra y su `.md` queda como `retired`,
como hizo SDD-60 con los suyos.

## 4. Comportamiento

### 4.1. El recorrido completo

**1. Se genera.** `fudic g pipe truncar` escribe:

```
# src/pipes/truncar.fudapi
pipe truncar
  on str
```

```ts
// src/pipes/truncar.ts
import { truncar } from 'fudic:pipes/truncar';

export default truncar.implement((value, locale) => value);
```

```ts
// src/pipes/truncar.test.ts
import { expect, test } from 'vitest';
import truncar from './truncar';

test('truncar formats a value', () => {
  expect(truncar.format('fudic', 'en')).toBe('fudic');
});
```

**2. El usuario completa el contrato.** Añade `max u32`. Al guardar, `fudic:pipes/truncar` cambia
y `tsc` señala la implementación: le falta el parámetro `args`.

**3. El usuario escribe la implementación**, en TS completo:

```ts
export default truncar.implement((value, { max }) =>
  value.length <= max ? value : `${value.slice(0, max)}…`);
```

**4. Lo usa en la vista** (§3.5). El hover sobre `truncar` muestra su documentación del `.fudapi`.

**5. Lo prueba** con su test unitario o con los criterios de la pieza, igual que cualquier otra
cosa.

### 4.2. Qué se emite

`@(post.resumen | corto)` se emite como `corto.format(post.resumen, "es")`, con el idioma como
literal del grafo de ese idioma (SDD-58 §4.6). Lo mismo para un preset: `euros.format(precio, "es")`.
`format(valor, p)` en código se emite igual.

- El emit no importa nada para los pipes. La vista ya importó el pipe en su `@code`.
- La proyección no cambia: `$pipe(a, b)` y su declaración en `GLOBALS_DTS`, con `format` en
  `$Pipe<T>`.

### 4.3. Ni un byte de más

- **Un pipe del usuario** llega al navegador solo si un módulo de navegador lo importa. La carpeta
  de pipes no entra en ninguna raíz (§3.3): ni en el `import.meta.glob` de `src/browser`, ni en el
  de `src/server`.
- **Un preset** es una pieza publicada de `@fudic/core` (SDD-45), una por preset. El linker solo
  publica las que algún módulo importa.
- **Una app sin pipes** no lleva en su `dist` de navegador ni `Intl.` ni código de pipes. Es un
  criterio (§6.10).

### 4.4. Servidor en TS

El render de servidor evalúa el corte del `@code` (SDD-60 §4.8), que incluye el import del pipe:
carga `src/pipes/truncar.ts`, el mismo fichero que el navegador. **Con frontend y backend en TS,
el pipe se escribe una vez.** Lo mismo en el Service Worker y en el prerender.

Una implementación de pipe corre en los dos lados, así que no puede tocar el DOM ni leer el
servidor. No se diagnostica: si lo hace, falla en el lado que no lo tiene, como cualquier módulo
compartido.

### 4.5. Librerías

Una librería declara sus pipes en su propia carpeta de pipes y los exporta (§3.6). Una app los
importa por el paquete:

```html
@code { import truncar from '@acme/ui/pipes/truncar'; }
```

- El `fudic:pipes/truncar` de la librería se resuelve como cualquier `fudic:<id>` de una librería
  (SDD-60).
- El idioma es el de la app que pinta.

### 4.6. Lo generado pasa en verde

- `fudic g pipe` en una app y en una librería: el test generado pasa y `pnpm typecheck` sale
  limpio sin tocar nada (BUG-50).
- `pnpm verify:generated` (SDD-66) incluye `g pipe` si SDD-66 ya está `Hecho`. Si no, lo incluye
  SDD-66 al implementarse.

### 4.7. Otros backends (enmienda del anexo de SDD-61)

Del `.fudapi` de un pipe, el generador nativo (IDEA-05) escribe **solo definiciones**:

| | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|
| El pipe | `interface ITruncarPipe { string Format(string value, TruncarArgs args, string locale); }` | `interface TruncarPipe { String format(String value, TruncarArgs args, String locale); }` | `type TruncarPipe interface { Format(value string, args TruncarArgs, locale string) string }` | `trait TruncarPipe { fn format(&self, value: &str, args: &TruncarArgs, locale: &str) -> String; }` | `class TruncarPipe(Protocol): def format(self, value: str, args: TruncarArgs, locale: str) -> str: ...` |
| Sus parámetros | `sealed record TruncarArgs(double Max)` | `record TruncarArgs(double max)` | `type TruncarArgs struct { Max float64 }` | `struct TruncarArgs { max: f64 }` | `@dataclass class TruncarArgs: max: float` |

Filas nuevas de A.2 («El `@code` que el servidor evalúa» y «Lo que se pinta»):

| Vista | C# (el resto, igual con su forma) |
|---|---|
| `import truncar from '../pipes/truncar'` | Nada |
| `const corto = truncar({ max: 40 })` | `var corto_1 = new TruncarArgs(Max: 40.0);` |
| `@(x \| corto)` | `ioc.Get<ITruncarPipe>().Format(x, corto_1, "es")` |
| `@(x \| iniciales)` (sin parámetros) | `ioc.Get<IInicialesPipe>().Format(x, "es")` |

- La implementación la registra el anfitrión en su contenedor, como la de un token de `inject`
  (A.2). Implementarla es responsabilidad del equipo de backend. **fudic no comprueba que exista**
  y no hace fallar ningún build por eso.
- A.4 gana una frase: los presets del catálogo siguen siendo `Fud.Format`, escritos una vez por
  runtime. Los pipes del proyecto no los escribe fudic.
- En la suite de conformidad, una fila con pipe del usuario compara todo el HTML salvo el texto
  del pipe, igual que las de los presets.

### 4.8. Migración

- `@fudic/i18n` deja de exportar los presets, `Pipe`, `format`, `locale` y `$format`. No hay
  reexportación: un único sitio. Todo el repositorio importa de `@fudic/core`, también los
  ejemplos, los fixtures y los README.
- `examples/basic/fudic.json` pierde `"locales": ["es"]` si SDD-61 lo puso solo para los pipes, y
  el reloj escribe sus presets desde `@fudic/core`. La app pasa a `en`. Los textos ya están en
  inglés, así que no cambia ningún byte salvo lo que formatea el reloj.
- Lo que el compilador reconoce como «pipes de i18n» (`I18N_PIECES`, el import de `@fudic/i18n`
  que escribe la expansión de traducciones, `localize.ts`) deja de tratar `$format`.

## 5. Invariantes LSP

- `pipe` se parsea sin lanzar, con su span. Un `pipe` sin `on` es `FUD1340` y el resto del
  fichero se sigue leyendo.
- El índice del `.fudapi` da hover, ir a la definición y completado para `pipe` como para `rule`.
  Bajo `pipe`: `on` y los tipos tras `on` y tras un parámetro.
- Tocar un `.fudapi` de pipe regenera su `.d.ts` y revalida las vistas que lo importan, sin
  reabrir ficheros.

## 6. Criterios de aceptación

1. **Idioma por defecto.** Una app sin `"locales"`, con `const n = number()` en `@code`, pinta
   `@(1234.5 | n)` como `1,234.5`, y
   `readConfig` le da `locales: ['en']`. Sus URL y su `dist` son los de hoy, salvo los módulos
   que usan pipes.
2. **Sin `@fudic/i18n`.** Una app que no lo tiene en `package.json` usa `date`, `currency` y un
   pipe propio: compila, pinta y pasa `pnpm typecheck`. No sale `FUD1021`.
3. **`--locale`.** `fudic new tienda --locale es` escribe `"locales": ["es"]` y `<html lang="es">`
   en el layout y en la página. Sin la opción, el `fudic.json` no lleva la clave y el `lang` es
   `en`. `--locale es_ES!` da `FUD0725` con `problem: 'flag'`. `g lib --locale es` es
   `unknown-flag`. `g app --locale fr` en un workspace hace lo mismo que `new`.
4. **`g layout` y `g page`** en una app con `"locales": ["fr", "en"]` escriben `lang="fr"`.
5. **El `.fudapi` de un pipe.** `pipe truncar` con `on str` y `max u32` genera
   `TruncarArgs`, `TruncarFormat` y `truncar.implement`, con los tipos de §3.3. Sin parámetros,
   `implement` devuelve `Pipe<V>`. `on date i64` da `Date | number`. `on Post` da el tipo `Post`.
6. **Errores del `.fudapi`.** Sin `on`, `FUD1340` sobre el nombre, y el resto del fichero se
   indexa. Un `pipe` junto a un `load`, `FUD1078`. Dos `pipe truncar` en el proyecto, `FUD1081`.
7. **La implementación tipada.** Una implementación que devuelve un número, o que ignora un
   parámetro que el contrato añadió después, rompe `tsc` en dev (overlay) y en build.
8. **La vista.** Los tres usos de §3.5 pintan lo esperado en el servidor y en el navegador
   después de hidratar. `@(post.precio | corto)`, con `corto` de `str`, es un error de tipos.
   `@(corto)`, `@(truncar)` o leer `corto.options` en la vista es error (`FUD1150` o de tipos).
9. **El emit.** `@(x | corto)` se emite como `corto.format(x, "<idioma>")`. Un módulo con pipes
   no importa `$format` ni nada de `@fudic/i18n`.
10. **Ni un byte.** En el `dist` de navegador de una app:
    - sin pipes, no aparecen `Intl.` ni el código de ningún preset;
    - con solo `date`, aparece `DateTimeFormat` y no aparecen `NumberFormat` ni `ListFormat`;
    - con un pipe propio en `src/pipes` que ninguna vista importa, su código no aparece;
    - si una ruta lo importa, aparece solo en el chunk de esa ruta, y no aparece ningún fichero de
      `src/browser` que no estuviera ya.
11. **Una implementación, dos lados.** El mismo `src/pipes/truncar.ts` pinta el SSR, el prerender,
    el SW y el cliente. Un espía en el fichero comprueba que el servidor lo carga desde ahí y que
    no hay otra copia en `src/server` ni en `src/browser`.
12. **Varios idiomas.** Con `"locales": ["es", "en"]`, el `locale` que recibe el pipe es el de la
    página: `/es/…` → `"es"`, `/en/…` → `"en"`.
13. **Librería.** `examples/workspace` gana un pipe en `libs/ui` que usa una app: se importa como
    `@<scope>/ui/pipes/<nombre>` y pinta con el idioma de la app.
14. **Lo generado, en verde.** `fudic g pipe truncar` en una app y en una librería recién creadas:
    el test generado pasa y `pnpm typecheck` sale limpio sin tocar nada. `--on Post` usa el tipo.
15. **Editor.** Hover sobre `truncar` en la vista muestra la documentación del `.fudapi`;
    completado bajo `pipe` y tras `on`; ir a la definición desde la vista llega al `.fudapi`.
16. **Migración.** Ningún fichero del repositorio importa un preset, `Pipe`, `format` o `locale` de
    `@fudic/i18n`. `examples/basic` pasa su suite y su e2e y pinta el reloj igual.
17. **El anexo.** SDD-61 §A.2 y §A.4 llevan las filas de §4.7.
18. **Cobertura.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. Los paquetes que nacieron
    al 100 % siguen al 100 % en las cuatro métricas.

## 7. Fuera de alcance

- **El generador nativo** (C#, Java, Go, Rust, Python): IDEA-05. Esta spec fija lo que generará
  para un pipe (§4.7). No lo emite.
- **Comprobar implementaciones nativas.** Nunca (§1.1, 4).
- **Pipes nuevos en el catálogo** (mayúsculas, recortar…). Ahora los escribe el usuario.
- **Encadenar con parámetros en la vista** (`@(x | truncar(40))`). La vista no llama (SDD-61); los
  parámetros se fijan en `@code`.
- **Pipes asíncronos.** El texto de un pipe sale en la misma pasada de render.
- **Traducciones**: siguen siendo de `@fudic/i18n` y `fudic add i18n --locales`, sin cambios.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **`src/pipes`, fuera de las dos raíces.** La raíz de navegador carga todo `src/browser` en
   cuanto hace falta una implementación (`api-root.ts`). Un pipe allí llegaría al navegador sin
   que nadie lo usara. En una carpeta propia, solo llega quien la importa.
2. **`implement` devuelve un valor; no registra.** Registrar obligaría a cargar la carpeta desde
   una raíz. Devolver un valor deja que el bundler pode.
3. **El pipe lleva su `format`.** Así el emit es una llamada normal y no necesita saber qué clase
   de pipe es, ni importar una pieza de runtime. El preset sigue siendo un dato para los otros
   backends.
4. **Un pipe da siempre texto.** Es lo que se pinta, así que `gives` sería una palabra que siempre
   dice lo mismo.
5. **Un fichero por pipe en el generador; varios por fichero en la gramática.** El generador sigue
   la forma de una pieza (contrato, implementación y test juntos), pero el `.fudapi` no lo impone.
6. **`locale` y `format` se mudan a `@fudic/core`** con los presets. Hablan del idioma de la
   página, que ahora tiene toda app. `t()` se queda en `@fudic/i18n`, porque traducir sí es de
   ese paquete.
7. **Sin reexportación desde `@fudic/i18n`.** Dos sitios para lo mismo es lo que esta spec quita.
8. **`FUD1021` se retira.** Ninguna app queda sin idioma, así que el error no tiene caso.
9. **`--locale` no escribe nada si no se pasa.** El valor por defecto vive en `@fudic/conventions`,
   no en cada `fudic.json`. Cambiarlo es cambiarlo en un sitio.
