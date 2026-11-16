# SDD-83 — La prueba de Pedro

> **SDD:** [SDD-83](./SDD-83-diagnosticos-a-medida-y-baseline.md) §6.1 · **Tareas:** [SDD-83-Task](./SDD-83-Task.md)
> **Rama / worktree:** `sdd-83-diagnosticos-y-baseline`.

Cada paso dice dónde tocar, qué escribir y qué tiene que pasar. Las rutas son relativas a
`examples/basic` del worktree. Al terminar, `git checkout examples/basic` lo deja como estaba.

## Antes de empezar

1. **Verdaccio arrancado.** Si no lo está (se para al cerrar la sesión que lo lanzó), desde la raíz
   del worktree: `pnpm registry --no-build`. Se queda en `http://localhost:4873`.
2. **La CLI nueva**, ya instalada en global desde verdaccio. Si hubiera que repetirlo:
   `npm install -g @fudic/cli`.
3. **La extensión**, ya instalada. Recarga la ventana de VS Code (Ctrl+R) antes de empezar. Si hubiera
   que repetirlo: `pnpm --filter fudic-vscode install:vsix`.
4. **`vite dev`** del ejemplo en una terminal: `pnpm dev` dentro de `examples/basic`. Los avisos salen
   en esa terminal además de en el editor.

El ejemplo ya viene con `"baseline": { "target": "widely", "allow": ["state"] }` y
`"diagnostics": { "warnings": "error" }`, así que **todo warning se ve como error**.

## 1. Un aviso de Baseline y «Mover a `@supports`» — ✔ probado

- **Dónde:** `src/components/app-note.fud`, el `<style>`. Se ve en el navegador en `/baseline`.
- **Qué hacer:** mueve `field-sizing: content;` dentro de la regla `textarea { … }` de arriba y borra
  el bloque `@supports (field-sizing: content) { … }`.
- **Qué pasa:** `field-sizing` se subraya con `FUD1524` en el editor y sale en la terminal de dev.
- **Arreglo:** cursor sobre el subrayado, Ctrl+., «Mover a `@supports`». Escribe una regla aparte
  `@supports (field-sizing: content) { textarea { field-sizing: content; } }` y el aviso desaparece
  sin dar ninguno nuevo.

## 2. Permitir una feature

- **Dónde:** `fudic.json`, línea 7, y `src/components/app-menu.fud`.
- **Qué hacer:** en `fudic.json` cambia `"allow": ["state"]` por `"allow": []`.
- **Qué pasa:** en `app-menu.fud` se subrayan `:state(open)` (línea 25, en el `<style>`) y `states`,
  `add`, `delete` (líneas 13, 15 y 16, en el `@code`).
- **Arreglo:** cursor sobre el subrayado de la línea 25, Ctrl+., «Permitir `state` en el proyecto».
  Vuelve `"state"` al `allow` y desaparecen los cuatro avisos.
- **De paso**, añadiendo cada uno al `allow` junto a `"state"`:
  - `"nada"`: `FUD1527`, no es una feature.
  - `"masonry"`: `FUD1527`, se ha movido a `grid-lanes`, con la bombilla «Cambiar por `grid-lanes`».
  - `"view-transitions"`: `FUD1528`, pista, porque nada del ejemplo la usa. Tiene la bombilla «Quitar».
  - Dentro del `allow`, Ctrl+Espacio completa los ids de feature con su nombre.

## 3. Silenciar una línea con la bombilla

- **Dónde:** `src/components/app-calendar-plain.fud`.
- **Qué hacer:** borra la línea 86 entera (`@* fud-disable FUD1380: … *@`).
- **Qué pasa:** se subrayan los dos `@click` de las líneas 88 y 90 con `FUD1380`.
- **Arreglo:** cursor sobre el `@click` de la línea 88, Ctrl+., «Silenciar FUD1380 en esta línea».
  Escribe encima `@* fud-disable-next-line FUD1380:  *@` con el cursor donde va el motivo. Escribe uno.
  La 88 deja de avisar; la del botón sigue avisando, porque solo se ha silenciado una línea.
- **Las otras dos bombillas**, sobre el `@click` que queda: «Silenciar FUD1380 en este fichero»
  (escribe el comentario arriba del todo) y «Apagar FUD1380 en el proyecto» (escribe
  `"FUD1380": "off"` en `diagnostics` de `fudic.json`). Prueba una, mira el resultado y deshazla.

## 4. Completado y hover en un comentario

- **Dónde:** el comentario que creó el paso 3.
- **Completado:** borra el código y deja `@* fud-disable-next-line ` con el cursor detrás. Ctrl+Espacio:
  primero `FUD1380`, que es lo que sale en la línea siguiente, y después el resto con su título.
- **Hover:** ratón sobre `FUD1380` dentro del comentario: título, «warning» por defecto y «error» en
  este proyecto.

## 5. Un comentario sin motivo

- **Dónde:** el mismo comentario.
- **Qué hacer:** borra todo lo que hay después de `FUD1380:`.
- **Qué pasa:** `FUD1522` (error) sobre el comentario, y el `@click` de debajo vuelve a avisar.

## 6. Un comentario que no silencia nada

- **Dónde:** `src/components/app-calendar-plain.fud`, encima de la línea del botón «+7 filas» (la 96
  si el fichero está como en la rama).
- **Qué hacer:** escribe `@* fud-disable-next-line FUD1380: prueba *@`.
- **Qué pasa:** `FUD1523` (pista, con puntos suaves) con la bombilla «Quitar»: esa línea no tiene
  ningún `@click` dentro de un bucle.
- **De paso:** cambia `FUD1380` por `FUD9999`: `FUD1520` (no existe). Cámbialo por `FUD0051`:
  `FUD1521` (un error no se silencia).

## 7. El build falla con un warning

- **Dónde:** `src/components/app-calendar-plain.fud`.
- **Qué hacer:** deja algún `@click` sin silenciar (por ejemplo, el paso 3 sin el comentario) y
  ejecuta `pnpm build` dentro de `examples/basic`.
- **Qué pasa:** el build falla con `FUD1380` como error y el mensaje termina en «(warning by default;
  error in this project)».

## 8. Un nivel por debajo de lo que necesita fudic

- **Dónde:** `fudic.json`, línea 7.
- **Qué hacer:** cambia `"target": "widely"` por `"target": 2023`.
- **Qué pasa:** `2023` se subraya con `FUD1525`: fudic necesita navegadores desde 2024-03-05.
- **Arreglo:** Ctrl+., «Subir a 2024». Escribe `2024` y el aviso desaparece. Vuelve a `"widely"`.

## 9. Bajar un error en la política

- **Dónde:** `fudic.json`, línea 8.
- **Qué hacer:** deja `"diagnostics": { "warnings": "error", "FUD0051": "off" }`.
- **Qué pasa:** `"FUD0051"` se subraya con `FUD1521` (un error no se baja), con la bombilla «Quitar».
- **De paso:** dentro de `diagnostics`, Ctrl+Espacio completa los códigos con su título, y un código
  de error solo admite `"error"`.

## 10. La CLI

- **Dónde:** una carpeta fuera del repo, en una terminal.
- **Qué hacer:** `fudic new demo`.
- **Qué pasa:** la instalación termina sin errores (los `@fudic/*` salen de verdaccio) y el
  `demo/fudic.json` trae `"baseline": "widely"`. Abre `demo` en VS Code: la guía de estilos que
  genera no da ningún `FUD1524`.

## Al terminar

- `git checkout examples/basic` deja el ejemplo como en la rama.
- Si todo está bien, el SDD pasa a `Hecho` y se hace el merge `--no-ff` a `main` (las dos tareas que
  quedan en el Task).
- Si algo falla, se cuenta qué paso y qué se vio, y se arregla antes del merge.
