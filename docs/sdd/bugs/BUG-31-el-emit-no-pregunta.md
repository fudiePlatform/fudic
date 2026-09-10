# BUG-31 · El emit no pregunta lo que ya sabe

El compilador tiene el dato delante y emite igual. Una página sin nada hidratable se
descarga el runtime entero; un componente sin CSS produce una hoja construible vacía.

- [ ] **T1** · El layout escribe un marcador; el emit lo resuelve a `main-<build>.js` y lo **omite** si la página no tiene ni un `data-fud-id`.
- [ ] **T2** · Separar el registro del Service Worker del runtime de hidratación: el registro va siempre (offline-first), la hidratación solo si T1 la emite.
- [ ] **T3** · Polyfill de adopción solo si algún componente del grafo trae CSS ([parts.ts:113](packages/compiler/src/emit/parts.ts#L113)).
- [ ] **T4** · Con `css === ''`: ni `<style type="module" specifier>`, ni `shadowrootadoptedstylesheets`, ni `data-fud-adopt`, ni entrada en `COMPONENTS`.
- [ ] **T5** · Los `assets/*` compartidos nombrados con el build id en vez del hash de Rolldown; `hydrate` del manifiesto pierde `assets/` y hash (7 589 → ~4 017 B).
- [ ] **T6** · `<link rel="modulepreload">` de `main-<build>.js` y su rama estática, que el emit conoce entera.

**Hecho cuando**: `/about` no descarga `fudic-main` ni lo precachea la shell; un componente sin CSS no aparece en el `<head>`; `pnpm build` verde.
