# BUG-58 · El editor no encuentra el `.fudapi` si VS Code no está abierto en el proyecto

> **Estado:** `Hecho` — documentado mientras se arreglaba, a petición de Pedro. [tareas](./BUG-58-Task.md).
> **Corrige:** [SDD-60](../SDD-60-fudapi.md) §4.7 (el `<id>` de un `.fudapi` se lee
> del `src/` de «un proyecto barrido», y el proyecto barrido era la carpeta abierta).
> **Paquetes:** `@fudic/typecheck`

---

## 1. Síntoma

Con VS Code abierto en la raíz del monorepo, cada `.fud` de `examples/basic` que enlaza su
contrato (`<link rel="server" href="./user-form.fudapi">`) marcaba `FUD1111` sobre el `<link>`
aunque el fichero estaba al lado, y `FUD0907` en cada nombre que el contrato da a la vista
(`personForm`, `save`…), arrastrado por el primero. `fudic check` sobre el ejemplo no decía nada.

## 2. Causa

`FudIndex.server` solo aceptaba un `.fudapi` que colgara de `<raíz barrida>/src/`. El CLI barre
el proyecto, pero el editor barre la carpeta del workspace: abierto en el monorepo, la raíz es
el repo y `examples/basic/src/…` no está bajo `<repo>/src/`. Sin contrato, la vista no recibe
sus nombres.

## 3. Corrección

El proyecto de un `.fudapi` es la carpeta más cercana con `package.json` cuyo `src/` lo contiene,
dentro de una raíz barrida; si no hay ninguna, la raíz misma, como antes. El `<id>` se lee desde
ahí: el mismo que da el build (`components/user-form`).

## 4. Criterios de aceptación

1. Barrida la raíz de un monorepo, `server()` de un `.fud` en `examples/basic/src/components/`
   devuelve el `<id>` `components/c`.
2. Un `src/` sin `package.json` entre él y la raíz no es el de ningún proyecto: `undefined`.
3. Los casos que ya pasaban (raíz = proyecto) siguen igual.
