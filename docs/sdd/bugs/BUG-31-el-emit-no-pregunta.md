# BUG-31 · El emit no pregunta lo que ya sabe

**Estado:** `Hecho` — T1–T5 y T7 implementadas y con tests; **T6 queda abierta** y se explica
en su propia línea · **Rama:** `worktree-bug-31-emit-incondicional`

El compilador tiene el dato delante y emite igual. Una página sin nada hidratable se
descarga el runtime entero; un componente sin CSS produce una hoja construible vacía.

- [x] **T1** · El layout escribe un marcador (`<script src="fudic:runtime">`); el emit lo resuelve a `main-<build>.js` y lo **omite** si la página no hidrata.
- [x] **T2** · Separar el registro del Service Worker del runtime de hidratación: `boot` va siempre (offline-first), `main` solo si T1 lo emite.
- [x] **T3** · Polyfill de adopción solo si algún componente del grafo trae CSS ([parts.ts](packages/compiler/src/emit/parts.ts)).
- [x] **T4** · Con `css === ''`: ni `<style type="module" specifier>`, ni `shadowrootadoptedstylesheets`, ni `data-fud-adopt`, ni entrada en `COMPONENTS`.
- [x] **T5** · Los `assets/*` con build id en vez del hash de Rolldown; `hydrate` pierde `assets/` y hash (7 589 → 4 058 B).
- [ ] **T6** · `modulepreload` de main y su rama. Quitado: un preload de la etiqueta siguiente no adelanta nada y bajo SW no casa. Pendiente medir el de la **rama**, cuyos nombres no llegan al emit.
- [x] **T7** · El SW no perdía la navegación: un worker recién despertado tiene `router === null` y el listener, síncrono, la dejaba pasar a la red — offline, la app entera. Ahora la toma y espera al boot (`Router.respond`). Y `warmed` se rehidrata en `ready()` desde `routes-<build>`: era un `Set` en memoria que nacía vacío en cada reinicio, así que la primera navegación a cada ruta iba a la red con el chunk ya en caché. Es lo que hacía que Firefox solo sirviera a la tercera.

**Hecho cuando**: `/about` no descarga `fudic-main` ni lo precachea la shell; un componente sin CSS no aparece en el `<head>`; con el worker parado y offline, la página se sirve igual; `pnpm build` verde.

**Fuera**: el doble `fetch` de `boot`/`main` en Chrome con el documento servido por SW (una etiqueta en el DOM, dos entradas en Resource Timing, `transferSize 0`). El nonce de `<style type="module">`, que Chrome 155 con web features exige por `script-src`, va emitido pero sin medir.
