# SDD-66 — Los generadores que faltan: el `.fudapi` de una pieza y el escaparate

> **Estado:** `Listo` — [tareas](./SDD-66-Task.md).
> **Paquetes:** `@fudic/cli` · `@fudic/workbench` · `@fudic/spec` · `@fudic/compiler` ·
> `@fudic/diagnostics` · `examples/workspace`
> **Depende de:** 22 y 44 (la CLI y el workspace), 60 (`.fudapi`), 61 (la vista portable y su
> corte de servidor), 53 (fixtures), 32 (el banco y sus páginas), BUG-50 (lo generado pasa en verde
> sin tocarlo)
> **Rango de diagnósticos:** `FUD1240`–`FUD1259` (nuevo). Usa `FUD1240`–`FUD1242`.
> **Decisiones de gramática:** ninguna. **Enmienda SDD-61 §3.9**: un módulo de datos también puede
> venir de una librería (§4.2).
> **Origen:** [IDEA-07](./ideas/IDEA-07-mcp-de-fudic.md) §5.3, §10.1 y §11.2 (trabajo 5).
> **Rama sugerida:** `sdd-66-generadores-que-faltan`
>
> **Qué añade en una frase.** `fudic g api` le pone su `.fudapi`, su enlace y su handler a una ruta
> o un componente que ya existen; `fudic g showcase` escribe una página por componente con un
> bloque por cada caso de su fixture, y se regenera; y una comprobación de punta a punta demuestra
> que todo lo que generan los comandos pasa `pnpm test` y `pnpm spec` sin tocarlo.

---

## 1. Contexto y objetivo

El MCP (IDEA-07 §5.3) no escribe ficheros de andamiaje a mano: llama a los mismos planes que la
CLI, para que lo que crea un agente sea **byte a byte** lo que crea un desarrollador. Para eso a
la CLI le faltan dos generadores, y le falta una garantía.

**1. El `.fudapi` de una pieza que ya existe.** Hoy solo `g page --server` escribe un `.fudapi`,
y solo al crear la página. En las fases de IDEA-07 (§4.1) el contrato del servidor llega
**después** de aprobar props y criterios: la pieza ya existe. Para un componente no hay generador
en ningún caso. Hay que escribir a mano tres cosas que tienen que casar: el `.fudapi` al lado, el
`<link rel="server">` en su sitio del `.fud` y el handler en `src/server/<id>.ts`.

**2. El escaparate.** IDEA-07 §10.1: «quiero una página para ver lo que has creado». La evidencia
se construye como lo haría un usuario: una app del workspace que **consume** la librería, con una
página por componente que enseña exactamente los casos de su fixture, los mismos que comprueban
los criterios. Escrita a mano se queda atrás en cuanto alguien añade un caso, y la vista no puede
recorrer las claves de un `Record` (SDD-61, `FUD1153`): tiene que ser **generada y regenerable**.
Hoy, además, una librería no exporta sus fixtures (`templates/lib/package.json.tmpl`): una app no
podría importarlas.

**3. La garantía.** BUG-50 fijó la regla «lo recién generado pasa en verde sin tocar nada», y se
comprobó a mano con un registro local (Verdaccio). Ningún test la vigila: los e2e de la CLI
construyen con `vite build`, pero no ejecutan los tests ni los criterios generados. Para un agente
esta regla es crítica: si lo generado sale en rojo, el agente entra en bucle arreglando lo que no
es suyo.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 22, 44 | Los planes (`Plan`, `FileChange`, `apply`), `resolveTarget`, `targetChange` (con `FUD0443`), `planApp`, `serverLink`, las plantillas. |
| 60 | El `.fudapi`, su `<id>`, `fudic:<id>`, `x.handle(…)` en `src/server`, `<link rel="server">` y sus reglas (`FUD1112`, `FUD1114`). |
| 53 | Las fixtures: `Fixtures<P>` con `$content`. |
| 32 | El banco ya escribe una página por criterio desde una fixture ejecutada (`workbench/src/pages.ts`): props, `$content` y el host para las props que son señales. |
| BUG-50 | La regla de verde sin tocar y el registro local (`scripts/local-registry.mjs`). |

## 3. Interfaz pública

### 3.1. `fudic g api <pieza>`

```
fudic g api src/components/acme-cart          # a component: one function to start from
fudic g api src/routes/productos.fud          # a route: its load
```

`<pieza>` es el `.fud` o su carpeta (de componente). Escribe tres cosas:

**Un componente** (`acme-cart.fud`):

```
# acme-cart.fudapi
# The server functions of the component: their handlers are in src/server/components/acme-cart.ts.
get hello
  -> str
```

```ts
// src/server/components/acme-cart.ts
import { hello } from 'fudic:components/acme-cart';

hello.handle(() => 'Hello from the server');
```

y `<link rel="server" href="./acme-cart.fudapi">` arriba del todo del `.fud`, junto a sus
`<link rel="component">`.

**Una ruta**: lo mismo que ya escribe `g page --server` (`load` con `title str`, su handler y el
enlace en su sitio), sobre una ruta que existe. El `.fud` no se toca más allá del enlace: no se
reescribe su título.

- `--project` como en el resto de `g`.
- Si ya hay `.fudapi` o handler, `FUD0443` (colisión) salvo `--force`, como todo `g`.
- Una plantilla para el componente: `templates/component-api.fudapi.tmpl` y
  `templates/component-api.ts.tmpl`.

### 3.2. `fudic g showcase [<librería>]`

```
fudic g showcase ui                 # workspace: an app that shows every component of libs/ui
fudic g showcase ui --app gallery   # the app's name (default: showcase)
fudic g showcase                    # standalone app: its own components, under /showcase
```

**En un workspace**, con una librería:

1. Si la app no existe, la crea con el plan de `g app <app> --uses <librería>`. Si existe y no usa
   la librería, la añade como con `add <librería>`.
2. Por cada componente de la librería que tiene fixture, una ruta
   `apps/<app>/src/routes/<tag>.fud`:

   ```html
   <!-- Generated by `fudic g showcase ui`. Run it again instead of editing this file. -->
   <link rel="component" href="@acme/ui/acme-button.fud">

   @code {
     import cases from '@acme/ui/acme-button.fixture';

     const primary = cases["primary"];
     const disabled = cases["disabled"];
   }

   <h1>acme-button</h1>

   <section>
     <h2>primary</h2>
     <acme-button .variant=@primary.variant>Save</acme-button>
   </section>

   <section>
     <h2>disabled</h2>
     <acme-button .variant=@disabled.variant .disabled=@disabled.disabled>Save</acme-button>
   </section>
   ```

   Un bloque por caso, en el orden de la fixture; cada prop del caso como `.prop=@caso.prop`, y su
   `$content` como hijos. Un caso con props que son señales usa un host, como el banco (§4.2).
3. Una ruta `apps/<app>/src/routes/index.fud` con un enlace a cada página.

**En una app sola**, sin argumento: lo mismo con los componentes de la app, en
`src/routes/showcase/<tag>.fud` y `src/routes/showcase/index.fud`.

**Regenerar.** `g showcase` vuelve a escribir sin `--force` los ficheros que llevan su marca (la
primera línea), añade los de componentes nuevos y borra los de componentes que ya no tienen
fixture. Un fichero en ese sitio **sin** la marca es `FUD0443`: es de alguien.

### 3.3. Lo que cambia en lo que ya existe

- **Las librerías exportan sus fixtures.** `templates/lib/package.json.tmpl` gana
  `"./*.fixture": "./src/components/*/*.fixture.ts"`; `examples/workspace/libs/ui` igual.
- **Una sola forma de fixture.** `g spec` escribe la fixture como `g component`
  (`import type { Fixtures } from '@fudic/terms'` y `satisfies Fixtures<$Props>`); hoy escribe
  `satisfies Record<string, $Props>` sin el import (`spec/src/scaffold/fixture.ts`).
- **La ayuda.** `GENERATES` (`help/usage.ts`) y la ayuda general listan `spec`, `api` y
  `showcase`; hoy falta `spec`.

### 3.4. La comprobación de punta a punta

```
pnpm verify:generated
```

Un script de la raíz (`scripts/verify-generated.mjs`) que:

1. construye los paquetes y los publica en el registro local (`scripts/local-registry.mjs`);
2. en una carpeta temporal, con ese registro, ejecuta como un usuario:
   - `fudic new acme --workspace --app web --uses ui`;
   - `fudic g component acme-button --project ui`;
   - `fudic g page about --server --project web`;
   - `fudic g component web-cart --project web` y `fudic g api src/components/web-cart --project web`;
   - `fudic g showcase ui`;
   - `fudic new solo`, y dentro `g component`, `g api` sobre ese componente y `g showcase`;
3. en cada proyecto, `pnpm test`, `pnpm spec` y `pnpm build`;
4. sale con 0 solo si todo sale en verde, y si no dice qué comando falló y su salida.

### 3.5. Los códigos

| Código | Título (`.md`) | Cuándo |
|---|---|---|
| `FUD1240` | Only a route or a component has a server | `g api` sobre un layout, un snippet o algo que no es un `.fud` de ruta o componente |
| `FUD1241` | A library's server is not generated yet | `g api` sobre una pieza de una librería |
| `FUD1242` | Nothing to show | `g showcase` sin ningún componente con fixture |

**Fix:** `1240`: «a layout reads its data through its route's `load`; a snippet through its
caller»; `1241`: «write the `.fudapi` in the library's `fudapi/` folder by hand»; `1242`: «give a
component its cases: `fudic g spec <name>` writes its fixture».

## 4. Comportamiento

### 4.1. `g api`

- **El `<id>`** es el de SDD-60 §3.11: la ruta del `.fudapi` dentro de `src/`, sin extensión
  (`components/acme-cart`, `routes/productos`). El handler va en `<server>/<id>.ts`, con `server`
  leído de `fudic.json` (`src/server` por defecto).
- **El enlace va donde manda el papel del fichero**: arriba del todo en un componente y en una
  ruta (en una ruta, tras su `<link rel="layout">`), dentro de `<head>` en una página. Es la misma
  regla que ya aplica `g page --server` y la bombilla de enlaces (`componentLinkAnchor`).
- **Una librería** se rechaza con `FUD1241`. Su `.fudapi` vive en su carpeta `fudapi/` y sus
  handlers se publican compilados (SDD-60 §3.15): generarlo bien es otra plantilla y otro build, y
  se hará cuando un caso lo pida. El resto del `g api` no depende de esto.
- Lo generado compila y el handler responde: `hello` devuelve su texto en `/_fudic/fn/<id>/hello`.

### 4.2. `g showcase`

- **Las fixtures se leen ejecutándolas**, como el banco: una fixture puede tener señales y
  `$content`, y su forma real solo se sabe al ejecutarla. Por eso el plan vive en
  `@fudic/workbench` (`planShowcase`), que ya ejecuta fixtures, y la CLI lo resuelve desde el
  proyecto como ya resuelve el banco para `fudic spec`.
- **Las páginas salen del mismo código que las del banco.** Lo que hoy escribe `pages.ts` para un
  criterio (las props de un caso como `.prop=@…`, `$content` como hijos y un host cuando hay
  señales) pasa a una función compartida de `@fudic/workbench` que usan las dos. Si las páginas del
  banco compilan, el escaparate compila.
- **Un caso, una variable**: `const <caso> = cases["<caso>"]`, la misma lectura de la fixture que
  ya hacen las páginas del banco y que SDD-61 admite (su criterio 22). Un nombre de caso que no es
  un identificador válido (`'titulo-largo'`) se convierte a camelCase (`tituloLargo`); si choca con
  otro, se numera.
- **La fixture viene de una librería** (`@acme/ui/acme-button.fixture`), y SDD-61 §3.9 solo admite
  módulos de datos **del proyecto**: una importación de un paquete que no es del catálogo es
  `FUD1150`. Esta spec lo enmienda: el analizador `server-cut` acepta como módulo de datos el
  `export default` de un módulo que `readModule` resuelve **dentro de una librería fudic** (un
  paquete con `fudic.json`), con las mismas reglas que uno del proyecto. Un paquete cualquiera de
  npm sigue siendo `FUD1150`.
- **La cabecera de cada página** (su `<link rel="layout">` y el sitio de los enlaces) es la que
  escribe `g page` en esa app.
- **Los hosts** de casos con señales van en `src/components/showcase/` de la app, con la misma
  marca de generado.
- **El índice**: una lista de enlaces, uno por página, con el tag como texto.
- **Determinista**: la misma librería y las mismas fixtures dan los mismos ficheros byte a byte.

### 4.3. `verify:generated`

- No es parte de `pnpm test`: necesita red local, un registro y varios minutos. Se ejecuta al
  cerrar cualquier SDD o BUG que toque la CLI o sus plantillas, y su tarea de entrega lo dice. El
  README de desarrollo de `@fudic/cli` lo explica en tres líneas.
- La lista de comandos del paso 2 sale de una tabla del script. Un generador nuevo que no esté en
  ella hace fallar un test de la CLI (que compara la tabla con `GENERATE_TYPES`): nadie puede
  añadir un generador sin comprobar que lo que escribe pasa en verde.

## 5. Invariantes

- **Plan → apply**, como toda la CLI: `--dry-run` y `--json` funcionan en los dos generadores, y
  ninguno escribe fuera de `apply`.
- **Lo generado pasa en verde sin tocarlo**, comprobado por `verify:generated`.
- **Determinista.** El mismo proyecto da el mismo plan.
- **Cobertura:** lo nuevo de la CLI y del banco al 100 % en las cuatro métricas; ningún umbral
  baja.

## 6. Criterios de aceptación

**`g api`**

1. Sobre un componente sin servidor escribe el `.fudapi`, el handler en
   `src/server/components/<tag>.ts` y el enlace arriba del `.fud`; el proyecto compila sin
   diagnósticos y `hello` responde su texto (test con el servidor de dev en memoria de
   `@fudic/testing`).
2. Sobre una ruta escribe su `load`, su handler y el enlace en su sitio; el título del `.fud` no
   cambia.
3. Una segunda vez da `FUD0443`; con `--force`, reescribe.
4. Sobre un layout o un snippet, `FUD1240`; sobre un componente de una librería, `FUD1241`.
5. `--dry-run --json` devuelve el plan sin escribir.

**`g showcase`**

6. En `examples/workspace`, `g showcase ui` crea `apps/showcase` con una página por componente de
   `libs/ui` con fixture y su índice; `pnpm build` de la app pinta cada caso con sus props y su
   contenido.
7. Una fixture con un caso `'titulo-largo'` da la variable `tituloLargo`; un caso con una prop
   señal sale a través de un host en `src/components/showcase/`.
8. Añadir un caso a una fixture y volver a ejecutar `g showcase ui` actualiza solo esa página, sin
   `--force`. Un componente nuevo con fixture añade su página; uno que pierde la fixture la pierde.
9. Un fichero sin la marca en el sitio de una página da `FUD0443`.
10. Sin ningún componente con fixture, `FUD1242`.
11. En una app sola, `g showcase` escribe bajo `src/routes/showcase/`.
12. Las páginas del banco no cambian tras mover su generador a la función compartida (sus tests
    siguen en verde sin tocarlos).

**Lo que cambia**

13. Una librería nueva exporta `./*.fixture`, y una app del workspace importa
    `@acme/ui/acme-button.fixture`.
14. `g spec` sobre un componente con props requeridas escribe la fixture con `Fixtures<$Props>` y
    su import, igual que `g component`.
15. `fudic g --help` lista `spec`, `api` y `showcase`.
16. **La enmienda a SDD-61.** Un `.fud` de una app que importa `@acme/ui/acme-button.fixture` (una
    librería fudic) y lee `cases["primary"]` en la vista no da `FUD1150`; el mismo import de un
    paquete sin `fudic.json`, sí.

**La garantía**

17. `pnpm verify:generated` sale en verde con la lista de §3.4. Un test de la CLI falla si
    `GENERATE_TYPES` tiene un tipo que la tabla del script no ejecuta.

**Entrega**

18. Los tres códigos tienen `.ts`, `.md` y línea en `index.ts`. `pnpm typecheck`, `pnpm test` y
    `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas.

## 7. Fuera de alcance

- **Que `fudic new` deje configurado el MCP** (`.mcp.json` y un `CLAUDE.md`/`AGENTS.md` de tres
  líneas, IDEA-07 §4). Pasa a la spec del MCP: escribir hoy una configuración que apunta a un
  servidor que no existe rompería la regla de BUG-50 en el primer `new`.
- **El contrato del backend** (`add backend`, IDEA-07 §3, camino 1): IDEA-07 §11.3.
- **`g api` en una librería**: §4.1.
- **Generar más de una función** o funciones con parámetros: se escriben en el `.fudapi` con el
  editor, que las completa.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **El escaparate sale del generador de páginas del banco.** Ya resuelve lo difícil (señales,
   `$content`, hosts) y está probado; un segundo generador se desviaría del primero.
2. **Una variable por caso en lugar de spread.** `...cases.primary` arrastraría `$content` como
   atributo, y su tipo es una intersección que la vista portable no acepta (SDD-61 §3.10).
   `.prop=@caso.prop` es lo que ya hace el banco.
3. **La marca en la primera línea decide qué se puede regenerar.** Sin ella, regenerar pisaría lo
   que alguien escribió; con `--force` para todo, nadie regeneraría.
4. **`verify:generated` fuera de `pnpm test`.** Necesita publicar en un registro e instalar como un
   usuario; en `pnpm test` haría la suite lenta y dependiente de la red. Lo vigila la tarea de
   entrega de cada spec de CLI y el test que obliga a que cada generador esté en su tabla.
5. **El MCP en `fudic new`, a la spec del MCP**, por la razón de §7.
6. **Se enmienda SDD-61 en lugar de copiar la fixture en la app.** Copiar los casos dejaría dos
   fuentes que se separan; importar la fixture de la librería es lo que haría un usuario. La
   frontera queda en «librería fudic» (con `fudic.json`), que es código que el proyecto controla y
   que el corte de servidor ya sabe resolver; un paquete cualquiera sigue fuera.
