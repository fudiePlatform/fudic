# Pendiente de implementar

Orden propuesto a 2026-10-27. Todo está en `Listo` en `main`.

## Bugs

| # | Qué | Por qué en este orden |
|---|---|---|
| 1 | [BUG-52](sdd/bugs/BUG-52-tests-que-dependen-del-entorno.md) · [tareas](sdd/bugs/BUG-52-Task.md) | Los 3 tests de la CLI que fallan por los colores. Son 7 tareas y no toca nada más. |
| 2 | [BUG-53](sdd/bugs/BUG-53-precarga-sin-sw-a-medias.md) · [tareas](sdd/bugs/BUG-53-Task.md) | La precarga con el grafo completo. Toca el SW, igual que la 67 y la 70: mejor antes que en paralelo. |

## SDD

| # | SDD | Necesita | Nota |
|---|---|---|---|
| 3 | [67](sdd/SDD-67-binario-y-reglas-en-las-funciones.md) · binario y reglas en las funciones | — | La base de las llamadas. |
| 4 | [68](sdd/SDD-68-llamadas-sin-fontaneria.md) · `task` y repintar sin recargar | 67 | |
| 5 | [69](sdd/SDD-69-sesion-por-cookie.md) · sesión por cookie | 68 (solo el ejemplo) | No necesita la 67, solo cabeceras. Puede ir antes; entonces el ejemplo recarga al entrar y salir hasta la 68. |
| 6 | [70](sdd/SDD-70-await-en-la-vista.md) · `@await` en la vista | 67, 68 | La más grande (unas 45 tareas). |
| 7 | [71](sdd/SDD-71-pipes-del-usuario.md) · pipes del usuario | — | Tras la 70: las dos tocan la gramática del `.fudapi` y el emit. |
| 8 | [62](sdd/SDD-62-diagnosticos-que-dicen-la-verdad.md) · diagnósticos que dicen la verdad | — | Migra el `.md` de todos los códigos: mejor cuando ya existen los de 67–71. |
| 9 | [63](sdd/SDD-63-contrato-del-componente.md) · contrato del componente | — | En paralelo con la 64, o con la cadena 67–70 en otro worktree. |
| 9 | [64](sdd/SDD-64-resultados-legibles.md) · resultados legibles | — | Ídem. |
| 10 | [65](sdd/SDD-65-historial-de-cada-pieza.md) · historial de cada pieza | 63, 64 | |
| 11 | [66](sdd/SDD-66-generadores-que-faltan.md) · generadores que faltan | 67, 70 | La última: sus plantillas de `load` usan `later` y las reglas de los argumentos. Enmienda SDD-61 §3.9, como la 71. |

Después: las SDD del MCP ([IDEA-07](sdd/ideas/IDEA-07-mcp-de-fudic.md)).


## Notas de pedro

Aclaradas el 2026-11-05. La primera está desarrollada en «Análisis con sesión», más abajo. La 2 y la 6 se cerraron en SDD-80.

| # | Qué | Tamaño |
|---|---|---|
| 1 | Silenciar o subir diagnósticos | Pequeña |
| 3 | Cabeceras de seguridad configurables (fuera los avisos de Lighthouse) | Pequeña |
| 4 | Nivel de Baseline en `fudic.json` | Pequeña o mediana |
| 5 | Fixtures del `load` de las páginas | Mediana |
| 7 | Generar la hoja de estilos desde la CLI, con el usuario | Mediana |
| 8 | `fudic.json` en la guía del MCP, como el `sw.json` | Pequeña |
| — | Fake o log de llamadas al servidor | Después |

### 1. Silenciar o subir diagnósticos

> **Redactada el 2026-11-10** como [SDD-83](sdd/SDD-83-diagnosticos-a-medida-y-baseline.md), junto
> con la nota 4.

Ver «Análisis con sesión» §1.

### 3. Cabeceras de seguridad configurables

Lighthouse da 100 % en Buenas prácticas, pero saca avisos que no puntúan en «Confianza y
seguridad». Hay que hacerlos desaparecer. No todos son de la CSP:

| Aviso | Se quita con | ¿CSP? |
|---|---|---|
| La CSP no protege contra XSS | CSP estricta: nonces o hashes, `object-src 'none'`, `base-uri 'none'` | Sí |
| Clickjacking | `frame-ancestors 'none'`. Lighthouse lo acepta igual que `X-Frame-Options`, que sobra | Sí |
| DOM XSS: Trusted Types | `require-trusted-types-for 'script'` | Sí |
| HSTS | `Strict-Transport-Security` | No |
| Aislamiento de origen | `Cross-Origin-Opener-Policy: same-origin` | No |

- La configuración va en `fudic.json`. Hoy la CSP está fija en `@fudic/vite` (`plugin.ts`,
  `serve.ts`, `dev.ts`, `wrapper.ts`).
- **Hay dos CSP, no una.** La de la página y la de `/sw.js`. El linker del SW usa `new Function`
  (`transport/src/linker.ts:87`) y necesita `'unsafe-eval'`. Sin él, `canLink()` hace que la app
  degrade a server/SSG en lugar de romperse.
- **Trusted Types rompe dos `innerHTML` del runtime**: `dom/src/browser.ts:36` y
  `forms/src/dom/summary.ts:39`. Hace falta una policy `fudic` que los envuelva.
- Quitar de los docs lo que dependa de Lighthouse donde ya no aplique: SDD-32, BUG-07, BUG-42,
  IDEA-07, INDEX.

### 4. Baseline

> **Redactada el 2026-11-10** como [SDD-83](sdd/SDD-83-diagnosticos-a-medida-y-baseline.md), junto
> con la nota 1. Lo de abajo es el análisis previo; donde no coincida, manda la SDD (el anidamiento
> CSS sí es «widely», y el corte sale de la fecha de los datos, no del reloj).

`fudic.json` fija el nivel: `"baseline": "widely" | "newly" | <año>`. Si la salida usa una feature
por encima de ese nivel (DSD, `:state()`…), sale un diagnóstico. El trabajo está en mapear lo que
emite el compilador a sus entradas en web-features.

#### Análisis con sesión (2026-11-10)

Va en la misma SDD que la nota 1: los avisos de Baseline son warnings, y se suben a error o se
silencian con la misma política (`"FUDxxxx": "error"`, `"warnings": "error"`, `fud-disable`).

**Los datos.** `web-features` 3.45.0 (5 MB, sin dependencias): 1236 features y unas 16 000 claves
de BCD. Cada clave trae su propio estado en `status.by_compat_key` (`high`/`low`/`false` y sus
fechas). Con eso basta: no hacen falta `compute-baseline` ni `@mdn/browser-compat-data`. También
trae `browsers` con las fechas de cada versión, que sirve para traducir el nivel a versiones.

- `"widely"`: `baseline_low_date` + 30 meses ≤ hoy. `"newly"`: tiene `baseline_low_date`.
  `2024`: `baseline_low_date` ≤ 2024-12-31. Una feature `false` no entra en ningún nivel.

**Lo que emite fudic, medido con esos datos:**

| Qué | Clave | Estado | Widely desde |
|---|---|---|---|
| DSD (`shadowrootmode`) | `html.elements.template.shadowrootmode` | high | 2026-08-20 |
| `shadowrootdelegatesfocus` (todo control de formulario) | `html.elements.template.shadowrootdelegatesfocus` | **low** | 2027-03-16 |
| `shadowrootclonable` / `serializable` (si el autor lo pide) | `html.elements.template.*` | low | 2027-03-16 |
| `shadowrootreferencetarget` (si el autor lo pide) | `referencetarget` | **false** | — |
| Controles form-associated | `form-associated-custom-elements` | high | 2025-09-27 |
| `adoptedStyleSheets`, `replaceSync` | `constructed-stylesheets` | high | 2025-09-27 |
| `<style type="module" specifier>` | no está en web-features | — | lleva polyfill |
| `Promise.withResolvers` (frames de `@await`) | `promise-withresolvers` | high | 2026-09-05 |
| `requestIdleCallback` | `requestidlecallback` | false | con alternativa |
| `CompressionStream` | `compression-streams` | high | con detección |

- **El suelo de fudic es Baseline 2024** (DSD y `withResolvers`). Un `"baseline": 2023` no se
  puede cumplir: diagnóstico sobre `fudic.json` que dice qué features lo impiden.
- **Hoy, una app con formularios no es «widely»** hasta el 2027-03-16, por
  `shadowrootdelegatesfocus`. El aviso cae sobre el componente que lo provoca, no sobre el runtime.
- Lo que fudic usa con alternativa (polyfill, detección) no avisa. Lo declara un manifiesto del
  runtime, con test que lo ate al código.

**Lo que escribe el autor, de más fácil a más difícil:**

1. **Marcado del `.fud`**: elementos y atributos (`popover`, `commandfor`, `<search>`…). Ya hay AST
   con spans: `html.elements.<x>`, `html.elements.<x>.<attr>`, `html.global_attributes.<attr>`.
2. **CSS** (`<style>` del `.fud`, la guía de SDD-79, las hojas de `styles`): hoy el compilador no
   lee reglas, solo equilibra llaves. Hace falta un tokenizador propio que saque propiedades,
   valores (`css.properties.<p>.<valor>`), funciones (`light-dark()`), selectores (`:state()`,
   `:has()`) y at-rules (`@scope`). **Dentro de `@supports` no se avisa**: es el caso limpio de
   mejora progresiva.
3. **TS del navegador** (`@code` de cliente, `src/browser`, pipes): la sintaxis la baja Vite según
   su `build.target`; las APIs no. Para saber que `x.showPopover()` es `api.HTMLElement.showPopover`
   hace falta el tipo de `x`: el `@fudic/typecheck` que ya existe. Un `'x' in obj` o
   `typeof X === 'function'` alrededor cuenta como detección. `src/server` no se mira (corre en Node).

**Vite.** Vite 8 compila por defecto a `baseline-widely-available`, fijo a 2026-01-01 (Chrome 111,
Firefox 114, Safari 16.4). Si `fudic.json` dice otro nivel y el usuario no ha puesto
`build.target`, el plugin lo calcula desde `browsers` de web-features y lo pasa. Comprobar si el
CSS inline de los `.fud` pasa por el `cssTarget` de Vite; si no, lo que no se baja se avisa.

**Librerías.** El nivel es del producto que se sirve. Una lib declara el suyo, que es lo que
promete. Si la app compila una lib con un nivel por encima del suyo, un solo aviso sobre la
dependencia, no uno por línea en `node_modules`, que el usuario no puede tocar.

**Editor y `explain`.** El hover del aviso dice la feature, su estado, las fechas, el soporte por
navegador y el enlace a `webstatus.dev/features/<id>`.

**Bombillas: el usuario no tiene que acordarse de nada.** Cada aviso de Baseline trae:

- «Permitir `popover` en todo el proyecto»: escribe la feature en `allow` de `fudic.json`, y pasa
  `"baseline": "widely"` a la forma de objeto si hace falta.
- «Silenciar aquí»: escribe el `fud-disable-next-line` con su código y deja el cursor en el motivo,
  que es obligatorio.
- «Silenciar en este fichero»: lo mismo, arriba del todo.
- En CSS, «Envolver en `@supports`»: rodea la regla con la comprobación de esa propiedad.
- En `fudic.json`, con un nivel por debajo del suelo de fudic: «Subir a 2024».

Las tres primeras valen para cualquier warning, no solo los de Baseline.

**Decisiones a cerrar:**

1. **Sin `baseline` en `fudic.json`, se comprueba contra `widely`**, como Vite. Si callara, solo lo
   usaría quien ya sabe que existe. Para que no haya ruido, lo que pone fudic no avisa al usuario:
   - fudic se compromete a funcionar en todo navegador de Baseline 2024, y donde no llega pone su
     propio remedio, como ya hace con `<style type="module">` y `requestIdleCallback`;
   - `shadowrootdelegatesfocus`: al hidratar, si el navegador no entiende el atributo, el control
     pasa el foco a su `<input>` interno (los controles ya llevan JS). Comprobar al redactar;
   - el único aviso por culpa de fudic es un nivel por debajo de 2024 en `fudic.json`, con la
     bombilla «Subir a 2024»;
   - el manifiesto de lo que emite fudic pasa a ser una garantía: cada entrada por encima de 2024
     tiene que llevar remedio, y su test lo comprueba.

   Una app nueva sin tocar nada no da ningún aviso. El primero sale cuando el usuario escribe algo
   reciente.
2. **Permitir por feature**: `"baseline": { "target": "widely", "allow": ["view-transitions"] }`,
   con el id de web-features. Silenciar el código entero silencia todas las features a la vez; esto
   deja usar una a sabiendas. Un id desconocido da warning, como un código desconocido.
3. **`widely` se mueve con el tiempo.** Propuesta: calcularlo por fecha (`low` + 30 meses contra
   hoy), no con el `high` guardado en el paquete. Solo puede aflojar, nunca romper un build, y no
   depende de subir de versión `web-features` (`:state()` pasa a widely el 2026-11-17).
4. **Dónde viven los datos**: dependencia exacta de `web-features` en un paquete `@fudic/baseline`,
   o una tabla compacta generada al construir fudic (unos 800 KB con todas las claves, menos con
   solo CSS, HTML y JS). Lo segundo pesa menos en el `.vsix`.

### 5. Fixtures del `load` de las páginas

> **Cerrada el 2026-11-12: [SDD-82](sdd/SDD-82-specs-de-pagina-y-de-flujo.md) `Hecho`**, a falta de
> la prueba de Pedro. Una `.fudspec` puede ser de una página (`page /usuarios`, con su fixture
> tipada por el `Fixtures` del `.fudapi`) o de un flujo (`flow alta-de-usuario`), y el banco, la
> CLI, el editor, el MCP y `visit` las ejecutan con la misma fixture. Lo grabado contra el servidor
> real se vuelca en el `.fixture.ts` (`fudic-workbench record`), que era la mitad de «Después: fake o
> log de llamadas».
>
> **Redactada el 2026-11-08** como [SDD-82](sdd/SDD-82-specs-de-pagina-y-de-flujo.md) (specs de
> página y de flujo), que depende de [SDD-81](sdd/SDD-81-ficheros.md) (el tipo `file`, `Hecho` el
> 2026-11-10 a falta de la prueba de Pedro: la 82 ya puede empezar tras su merge). Lo de abajo
> es la nota original. Dos cosas cambiaron: `$Data` no hace falta, porque el `.fudapi` ya genera
> `LoadData` y ahora genera `Fixtures`; y `data` va en `given`, con la ruta en la cabecera
> (`page /usuarios`).

**Sin frontmatter** ni gramática nueva en `.fud` ni en `.fudapi`: costaría LSP, VS Code y otra
dependencia. Se repite el patrón que ya tienen los componentes (SDD-52/53): `<tag>.fixture.ts` con
`$Props`, y `props <x>` en la `.fudspec` con completado, hover, ir a la definición, `FUD0950`–`0953`
y la bombilla. Para los componentes, esta nota ya está hecha.

Para las páginas, junto al `.fudapi` de la ruta:

```ts
// routes/espera.fixture.ts
import type { $Data } from './espera.fudapi';
import { later } from '@fudic/spec';

export default {
  'todo-llega': {
    title: 'Lo que tarda, llega después',
    inicio: later(2000, 10),
    resumen: later(5000, { personas: 12, activas: 9 }),
    roto: later.fails(3000, 404, 'el servicio de avisos no responde'),
  },
  'al-instante': { title: 'Ya', inicio: 10, resumen: { personas: 1, activas: 1 }, roto: 'ok' },
  'colgada': { title: 'Esperando', inicio: later.never(), resumen: later.never(), roto: later.never() },
} satisfies Record<string, $Data>;
```

```
criterion lista-vacia
  given
    route /usuarios
    data vacia
```

- El `.fudapi` proyecta `$Data`: el tipo de lo que devuelve el `load`, igual que el `.fud`
  proyecta `$Props`. Hoy esa forma solo existe como JSON (`api/src/data-shape.ts`).
- La `.fudspec` tiene una línea `data <nombre>` en `given`, hermana de `props`, con su
  validación y su LSP.
- Quien monta la página usa la fixture en lugar de llamar al `load`. Lo usan la `.fudspec`, el
  banco y la preview del MCP. `params` y `layout` salen solos, porque `layout` ya se resuelve con
  lo que trajo el `load`.
- **Los campos `later` entran desde el principio**, con sus tres estados:
  - **llega**: el valor tal cual, o `later(ms, valor)`;
  - **falla**: `later.fails(ms, status, title)`, que pinta el `@catch (e)`;
  - **no llega nunca**: `later.never()`, para comprobar el hueco sin depender de relojes.
- `later` devuelve datos, no una promesa (`{ $later: 2000, value: 10 }`). La fixture sigue siendo
  serializable (SDD-52, decisión 2) y vale como semilla del fake. El montaje la convierte en la
  promesa, como hoy hace a mano `server/espera.ts`.
- `$Data` tipa un campo `later` como `T | Later<T>`. En un campo que no es `later`, `later(...)`
  es un error de TS.
- En el editor, el `import type` de un `.fud` es hoy `any` (SDD-52, decisión 1). Para `$Data`
  pasaría lo mismo, salvo que se proyecte de verdad.

### 7. Hoja de estilos desde la CLI

Un generador interactivo: el usuario elige o completa tokens, colores, etc. `fudic.json` ya adopta
hojas en los shadow roots (`packages/mcp/guide/html-css.md:208`). Encaja con la SDD-66.

### 8. `fudic.json` en el MCP

El `sw.json` ya está en la guía (`guide/overview.md`, `guide/pages.md`). El `fudic.json` necesita
su página o su esquema para que la IA sepa configurarlo, incluidas las claves nuevas de 1, 3 y 4.

### Después: fake o log de llamadas

Grabar todas las llamadas al servidor con sus respuestas y reproducirlas. Es el fake de IDEA-07
(§3 camino 2, §10.6, §10.7). Va en su propia SDD. Encaja con la 5: lo grabado se vuelca en el
mismo formato que el `.fixture.ts`, y una fixture es la semilla del fake.


## Analisis con sesión 

La idea encaja bien con lo que ya hay. Lo más importante que he encontrado:

Diagnósticos: de los 377 códigos, 344 son errores. Solo hay 31 warnings y 2 info, que son los que de verdad se pueden silenciar.
1. Silenciar o subir diagnósticos
Proyecto (fudic.json) — vale igual para lib y para app; cada uno manda solo sobre sus propios ficheros:


{
  "id": "basic",
  "kind": "app",
  "prefix": "app",
  "diagnostics": {
    "FUD1380": "off",
    "FUD1022": "error",
    "warnings": "error"
  }
}
FUD1380: off silencia "Event binding inside a loop" en todo el proyecto.
FUD1022: error hace que una traducción que falta rompa el build.
warnings: error sirve para CI: cualquier warning se trata como error.
Fichero .fud — el caso real ya existe en app-calendar-plain.fud:85-90, que pone un @click en un bucle a propósito, para compararlo con app-calendar:


@* fud-disable FUD1380: demo del coste de un listener por celda *@          ← todo el fichero

<div class="cell" @click=@pick($event, day)>
  @* fud-disable-next-line FUD1380: contraste con app-calendar *@         ← solo la línea siguiente
  <button @click=@pick($event, day)>✎</button>
En .fudapi es lo mismo con #: # fud-disable-next-line FUD0972.

Reglas que propongo:

Regla	Por qué
Un error no se puede bajar, solo subir	Si es error, la salida no es válida; silenciarlo esconde un build roto
El motivo detrás de : es obligatorio	Si no, en seis meses nadie sabe por qué está ahí
Una supresión que no silencia nada da un hint propio	Así no se queda basura cuando se arregla el código
Un código desconocido o retirado da un warning	Una errata como FUD1308 no puede silenciar en falso
La lib no impone nada a la app	La config de una lib solo cuenta al compilar sus ficheros
Esto no rompe la regla actual de que "la severidad pertenece al código" (types.ts:10-12). El código conserva su severidad por defecto, la política solo cambia cómo se informa, y explain muestra las dos.

Coste: una función applyPolicy(diags, policy, suppressions) en @fudic/diagnostics que usen compilador, vite y LSP por igual. Además, recoger los comentarios fud-disable con su span y 3 o 4 códigos nuevos. Y de propina para el LSP, un quick-fix: "Silenciar FUD1380 en esta línea".
