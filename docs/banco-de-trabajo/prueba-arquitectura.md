# Banco de trabajo: la arquitectura, probada (2026-10-03)

> **Para la sesión que retome esto.** La arquitectura de abajo **está demostrada** con el plugin
> de fudic real, Playwright real y una ventana de VS Code real. **No hay que volver a probarla**:
> el siguiente paso es redactar el SDD (reescribir SDD-32 o abrir uno encima) con estas
> decisiones, y arreglar los dos bugs de §5, que son de `main` y no del banco.
>
> El código de la prueba está en [prueba/](./prueba/). La maqueta y la discusión anteriores, en
> [index.html](./index.html). El lenguaje `.fudspec` ya existe ([SDD-52](../sdd/SDD-52-fudspec.md),
> [SDD-53](../sdd/SDD-53-fudspec-autoria.md)).

## 1. Qué hace el banco, visto por el usuario

1. Está en un `.fud` o en su `.fudspec` y pulsa **Ctrl+K V**.
2. Se abre una pestaña al lado (como la vista previa de markdown) con **una tarjeta por criterio**,
   cada una con el componente vivo, montado con los datos de su fixture e hidratado.
3. Los criterios se ejecutan y cada tarjeta se pone en verde o en rojo, con su evidencia.
4. **Al guardar** el `.fud`, la `.fudspec`, la fixture o un término, se vuelve a ejecutar **solo**.
5. Un botón **«Abrir en el navegador»** abre la misma vista en Chrome.

## 2. Decisiones tomadas con Pedro

| # | Decisión | Por qué |
|---|---|---|
| 1 | `given route …` es **solo un ejemplo**: el componente se monta **aislado**, en una página generada. | El banco abre un componente, no una app. |
| 2 | Los términos se escriben como en [examples/basic/fudic/terms/](../../examples/basic/fudic/terms/): `run(ctx, { args })` → `{ pass, evidence }`, con `ctx.locate(ref)` (`box`, `textContent`, `isVisible`, `click`, `setAttribute`) y `ctx.goto`. | Es el contrato que ya existe; el banco construye ese `ctx`. |
| 3 | **Opción A: la fixture se ejecuta** (no se lee de forma estática). | Una prop puede ser `Signal<number>`: la fixture hace `import { signal } from '@fudic/core'` y `signal(10)`, que es el valor inicial. |
| 4 | **Se hidrata.** | Sin reactividad las pruebas no sirven: unas tabs no cambian de pestaña. Casi ningún componente salvo un botón o una tarjeta es nivel 1. |
| 5 | **Los criterios los ejecuta Playwright**, sin ventana. | Hay criterios que no son triviales (árbol de accesibilidad, eventos reales `isTrusted`). El webview de VS Code no se puede pilotar con Playwright. |
| 6 | **Vite va dentro del servidor del banco, como middleware**; no se extiende Vite. | Vite ya compila, resuelve `@fudic/core` en el navegador, hidrata y recompila al guardar. El servidor y el WebSocket son del banco. |
| 7 | **Se ven las dos cosas:** por defecto la pestaña de VS Code; un botón la abre en el navegador. | Las dos son la misma página del banco, conectada al mismo WebSocket. |
| 8 | **Al guardar se vuelve a ejecutar solo.** | Escribir, guardar, ver el verde. |

## 3. La arquitectura

```
 Ctrl+K V
    │ la extensión lanza el proceso del banco (uno por componente) y lee una línea JSON
    ▼
 ┌─ Banco (Node) ──────────────────────────────────────────────────────────────┐
 │  http.Server en 127.0.0.1:P  — un solo puerto, un solo origen               │
 │   ├─ /__bench/        el shell: tarjetas, verde/rojo, evidencia             │
 │   ├─ /__bench/ws      el WebSocket del banco → resultados al shell         │
 │   └─ todo lo demás →  Vite (middlewareMode, hmr sobre este mismo server)    │
 │                        + plugin fudic con routesDir = node_modules/.fudic-bench/routes
 │                          · una página .fud generada por criterio, con su fixture
 │                          · su propio WS de recarga (vite-hmr), en el mismo puerto
 │  @fudic/spec: parseSpec(.fudspec) → criterios, pasos, `props <fixture>`     │
 │  vite.ssrLoadModule(fixture.ts) → los valores (opción A)                    │
 │  Playwright (chrome del sistema, headless) → ejecuta los términos reales    │
 │  vite.watcher + el "full-reload" de Vite → volver a ejecutar al guardar     │
 └──────────▲───────────────────────────────▲───────────────────────────────────┘
            │ WS                             │ WS
   Pestaña de VS Code (webview)       «Abrir en el navegador»
   <iframe src=http://127.0.0.1:P/__bench/>   la misma URL en Chrome
     └ un <iframe> por criterio → su página generada (viva, hidratada, con HMR)
```

Lo que ve el humano (los iframes, con HMR) y lo que mide Playwright son **dos instancias de la
misma página**: el humano puede tocar la suya sin estropear la medida.

## 4. Lo que se probó y el resultado

### 4.1. VS Code no lo impide (VS Code 1.140, Windows, local)

Extensión desechable ([prueba/extension/](./prueba/extension/), `server.mjs` sin Vite): la pestaña
carga `http://127.0.0.1:P/` en un iframe, sin `portMapping`, con la CSP
`frame-src http://127.0.0.1:*`.

| Comprobación | Resultado |
|---|---|
| La pestaña carga el shell desde `127.0.0.1` | ✅ |
| WebSocket del shell con el banco, en los dos sentidos | ✅ (`origin` = `http://127.0.0.1:P`) |
| El shell lee el shadow DOM de dos iframes (mismo origen) | ✅ |
| El JS del componente carga e hidrata dentro de la pestaña; un click cambia el panel | ✅ |

**No probado:** VS Code remoto (SSH, WSL, Codespaces). Ahí `127.0.0.1` no es la máquina del
usuario; habrá que pasar la URL por `vscode.env.asExternalUri`.

### 4.2. El banco completo con el plugin de fudic

[prueba/bank.mjs](./prueba/bank.mjs) sobre `examples/basic`, con `app-card.fudspec` y su fixture
reales, más un componente de tabs con un bug a propósito y una prueba de prop `Signal`.

| Comprobación | Resultado |
|---|---|
| Vite en middleware dentro del `http.Server` del banco; nuestro WS y el de Vite en el mismo puerto | ✅ |
| Una página generada por criterio en `node_modules/.fudic-bench/routes` (fuera de git; el watcher de Vite no la mira) | ✅ |
| La `.fudspec` se lee con `@fudic/spec`; los términos reales de `fudic/terms` corren sin cambios | ✅ |
| La fixture `.ts` se ejecuta con `vite.ssrLoadModule` y sus valores llegan como props | ✅ |
| Hidrata (`/fudic-main.js` + `/@fudic/h/<tag>.js`) | ✅ |
| Prop `Signal` desde la fixture: `signal(10)` se pinta `10 — 20` y al pulsar pasa a `11 — 22` | ✅ |
| Guardar el `.fud` → el banco vuelve a ejecutar solo, ~0,4 s después de guardar | ✅ |
| Rojo → guardar el arreglo → verde | ⚠️ Pasó en la prueba automática, pero por suerte: el click llegaba justo al cargar. En la ventana de Pedro no se puso verde. Es el **bug A** de §5. |

Los tres criterios de `app-card.fudspec` salen en rojo, y es correcto. Son fallos reales, no del
banco:

- `min-height app-card 44` → `20px`: el host de `app-card` es `inline`.
- `text app-card "…"` → `""`: Playwright lee el `textContent` del host, no el de su shadow DOM.
  Hay que decidir si `textContent` en el `ctx` atraviesa el shadow root.
- `click role:link/"Featured"` navega a `/blog/featured` (404), y después el link ya no está.

### 4.3. Lo que la prueba obliga a meter en el diseño

1. **La página generada es un documento completo** (`<!DOCTYPE html><html><head>…<body>`). Con solo
   `<head>` + `<app-x>`, el compilador la lee como un componente (`FUD0156`) y no como una ruta.
2. **Esa página lleva `<script src="fudic:runtime"></script>`** en el `<head>`. Sin layout nadie lo
   pone, y sin él el componente no hidrata.
3. **El import de la fixture va sin `.ts`** (`TS5097` en el chequeo de tipos del plugin).
4. **Las props se pasan como `.prop=@nombre`**, desestructuradas de la fixture en el `@code` de la
   página: `const { title, href } = fixtures["minima"];`.
5. **Una página no puede ser dueña de un signal que pasa a un hijo** (`FUD0200`: «name a signal(…)
   or computed(…) of this component»). Para una prop `Signal<T>`, el banco genera un **componente
   anfitrión** que declara `const value = signal(<valor>)` en su `@client`. El valor inicial lo
   escribe el banco **literal**, sacado de ejecutar la fixture (`fixture.diez.value()` → `10`).
   Inicializarlo desde una constante del `@code` falla en el servidor: `Cannot access 'initial'
   before initialization`.
6. **El navegador que mide no escucha las recargas de Vite.** El plugin manda dos `full-reload` al
   guardar: el del cambio y otro cuando termina el chequeo de tipos en vivo (SDD-35 §4.5). Si una
   página de Playwright los escucha, se recarga a mitad del criterio. Solución probada:
   `page.routeWebSocket(u => !u.pathname.startsWith('/__bench'), () => {})`.
7. **Cuándo volver a ejecutar:** el watcher dice *qué* cambió y el primer `full-reload` de Vite
   dice *cuándo* está listo. Volver a ejecutar en el evento del watcher es una carrera. Se
   intercepta `vite.environments.client.hot.send`.
8. **El aviso de error de Vite (overlay) se desactiva** (`hmr.overlay: false`). Un error en la
   página de un criterio se pintaba encima de la de otro y tapaba los clicks. Los errores van al
   shell.
9. **El banco recibe su propia configuración de Vite** (`configFile: false` + `fudic({ routesDir })`).
   Lo que el usuario tenga en su `vite.config.ts` no se carga. Está por decidir si se fusiona.
10. Aviso inofensivo a reconocer: con `routesDir` apuntando al banco, el plugin dice `FUD0742`
    («fudic.json declares stylesheets and this project defines no component»).

## 5. Bugs encontrados (en `main`, independientes del banco)

### Bug A — el primer click sobre un componente sin hidratar se pierde

**Se reproduce sin el banco**, con `pnpm dev` normal de `examples/basic`.

Componente (`examples/basic/src/components/app-bench-tabs.fud`, temporal):

```html
@code {
  @client {
    import { signal } from "@fudic/core";

    const active = signal(0);

    function pickA() {
      active.set(5);
    }

    function pickB() {
      active.set(1);
    }
  }
}

<app-bench-tabs>
  <template shadowrootmode="open">
    <button role="tab" @click=@pickA>Tab A</button>
    <button role="tab" @click=@pickB>Tab B</button>
    <p role="tabpanel">valor @active()</p>
  </template>
</app-bench-tabs>
```

Montado en una ruta con layout (`src/routes/zz-probe/tabs.fud`:
`<link rel="layout" href="../../layouts/_layout.fud">` + `<app-bench-tabs></app-bench-tabs>`),
`npx vite`, y [prueba/first-click.mjs](./prueba/first-click.mjs) contra `/zz-probe/tabs`, con
Playwright y Chrome del sistema:

| Espera antes del primer click | antes | tras el 1er click | tras el 2º click |
|---|---|---|---|
| 0 ms | `valor 0` | `valor 0` | `valor 1` |
| 1000 ms | `valor 0` | `valor 0` | `valor 1` |
| 3000 ms | `valor 0` | `valor 0` | `valor 1` |

- El click **no llega a ningún handler**: no es que llegue al equivocado (`pickA` daría `5`).
- Dentro de una página del banco pasa igual. Con 0 ms de espera **a veces** acierta, y por eso la
  prueba automática salió verde.
- **`app-toggle` no lo sufre**: un botón, un handler y el estado pintado dentro del botón. Funciona
  al primer click con 0, 1000 y 3000 ms, tanto en `/hidratacion` como dentro de una página del
  banco. La diferencia que dispara el bug está en el componente (dos botones, un handler cada uno,
  el estado fuera de los botones), no en la página.
- **Sin causa raíz todavía.** Por dónde mirar: `@fudic/core` `hydrate/capture.js` y
  `hydrate/replay.js`, que son los que deben guardar el primer evento y repetirlo al despertar.

### Bug B — `pnpm dev` de `examples/basic` da 500 en `/` y `/blog`

```
cd examples/basic && npx vite
GET /       → 500
GET /blog   → 500
GET /about  → 200
[vite] Internal server error: [module runner] Dynamic access of "import.meta.env" is not
supported. Please, use "import.meta.env.DEV" instead.
    at dev (…)  at guardUrl (…)  at SsrDom.setUrl (…)
```

- Causa: [packages/dom/src/url.ts:136-143](../../packages/dom/src/url.ts#L136-L143), `dev()` hace
  `const meta = import.meta as …; return meta.env?.DEV === true;`. El runner de módulos de Vite 8
  (SSR) no admite leer `import.meta.env` a través de un alias. Salta en toda página que pinta un
  atributo URL (`setUrl` → `guardUrl`), por ejemplo el `href` de `app-card`.
- En la prueba se esquivó con un transform local (`prueba/bank.mjs`, plugin `probe-dom-env`) que
  reescribe esa línea a `const meta = { env: import.meta.env };`. **Sin verificar como arreglo:**
  falta comprobar que sigue funcionando fuera de Vite (el `@fudic/ssr` publicado, leído desde
  `node_modules`, donde `import.meta.env` no existe), que es lo que protege el comentario de esa
  función.

## 6. Lo que queda para el SDD (sin volver a probar nada de §4)

- **Reescribir SDD-32 o abrir uno encima.** SDD-32 tal cual (sin hidratación, servidor propio sin
  Vite, Playwright como ventana del humano, «segundo click relanza») queda superado por §2.
- Forma del `ctx` del motor: lo que hace `locate` con un tag que casa con varios elementos, y si
  `textContent` atraviesa el shadow root (§4.2).
- Formato de los mensajes del WebSocket hacia el shell. Hoy es `{ phase, results }`, solo para la
  prueba.
- El componente anfitrión para props `Signal` (§4.3, punto 5): generarlo siempre o solo cuando
  hace falta.
- Configuración de Vite del usuario: si se fusiona con la del banco (§4.3, punto 9).
- VS Code remoto: `asExternalUri` (§4.1).
- Por qué `textContent` y `min-height` dan lo que dan en `app-card`. Es del componente, no del
  banco, pero el ejemplo debería tener al menos un criterio en verde.
