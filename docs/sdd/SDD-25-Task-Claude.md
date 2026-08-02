# SDD-25 — Tareas de Claude

> **SDD:** [SDD-25 — Extensión de VS Code](./SDD-25-extension-vscode.md)
> **Tareas de implementación cerradas:** [SDD-25-Task.md](./SDD-25-Task.md) — 34/34.
> **Tareas de Pedro:** [SDD-25-Task-Pedro.md](./SDD-25-Task-Pedro.md)
> **Estado:** todo lo hecho está en `main` (`0a59b1d`). El worktree y su rama ya no existen.

Lo que queda del lado del código, después de instalar la extensión de verdad y usarla. Las
34 tareas del fichero original construyeron la extensión; estas salen de **ejecutarla**, que
es donde aparece lo que ninguna suite veía.

El orden importa: la tarea 1 bloquea el cierre de la SDD, el resto no.

---

## Cerrado tras probarlo en el editor

- [x] **1. El reinicio deja el editor sin IntelliSense — criterio §6.7.**
      Cerrado por Pedro (2026-08-02): tras reinstalar la extensión, el reinicio deja el
      servidor operativo y el IntelliSense sigue ahí. El `[Error] Server process exited with
      code 0.` que se veía no era el fallo — es el servidor viejo apagándose limpiamente, y
      `vscode-languageclient` lo loguea como error sin mirar si la parada la pedimos nosotros.
      Queda como tarea 3 la decisión sobre ese ruido.

## Correcciones

- [ ] **2. Cada reinicio filtra tres watchers del workspace.**
      [`src/extension.ts:61`](../../packages/vscode/src/extension.ts#L61) crea un
      `FileSystemWatcher` por cada patrón de `FILE_EVENTS` en **cada** `boot()`, y el cliente
      solo dispone los *listeners* que engancha, nunca los watchers
      (`lib/common/fileSystemWatcher.js:51-57`). Ni se disponen ni entran en
      `context.subscriptions`. Hay que devolverlos junto al cliente y disponerlos al parar.

- [ ] **3. El `[Error]` cosmético en cada reinicio.**
      Descrito en la tarea 1: es ruido de la librería, y aun así lo primero que ve quien
      reinicia es un error en rojo. Dos salidas: filtrar esa línea exacta en nuestro
      `OutputChannel` mientras haya una parada nuestra en vuelo, o dejarla y explicarla en
      `EXTENSION-DEV.md`. **Decisión de Pedro** (su bloque de decisiones, punto a).

- [ ] **4. `github.com/fudie/fudic` no es el remoto.**
      Los ocho `package.json` apuntan ahí; el remoto es `fudiePlatform/fudic`. Es consistente
      en todos, así que o es intencionado o es un error que se arregla de una vez en los
      ocho. **Decisión de Pedro** (punto d).

- [ ] **5. Test frágil de reloj.**
      `§6.14 — cancellation > a burst of edits leaves exactly one request completed` cae
      cuando corren los once paquetes en paralelo y pasa en aislado. No lo toca ningún cambio
      reciente; hay que quitarle la dependencia del reloj real.

## La página de la extensión — aplazada

Los tres huecos de la pestaña **Details** que VS Code muestra al instalar. Ninguno afecta al
funcionamiento. **Decisión de Pedro (2026-08-02): no se tocan.** No hay publicación a la
vista, así que la página de la extensión no es trabajo que rinda hoy; se retoman si algún día
se publica.

- [ ] **6. Icono de la extensión.**
      El manifiesto no declara `icon`, así que la extensión sale con el marcador gris. El
      campo pide un **PNG de 128×128**; los `icons/fud-*.svg` son los del explorador de
      ficheros y no valen. Depende del logo que dé Pedro (su tarea 3). Incluye: campo en el
      manifiesto, que el fichero **no** quede excluido por `.vscodeignore`, y su afirmación
      en `test/manifest.test.ts` y en `verify-vsix`.

- [ ] **7. `CHANGELOG.md`.**
      Cuando existe, VS Code añade una pestaña **Changelog**. Hoy no hay ninguno.

- [ ] **8. Que el `LICENSE` viaje en el `.vsix`.**
      El manifiesto declara `"license": "MIT"` pero el fichero no está en el paquete, así que
      la pestaña de licencia queda vacía. El `LICENSE` está en la raíz del repo, no en el
      paquete: hay que copiarlo o referenciarlo al empaquetar, y afirmarlo en `verify-vsix`.

## Promesas que hoy no son ciertas

- [ ] **9. El estado degradado mezcla dos situaciones.**
      Hoy `Fudic ⚠` dice lo mismo para *«abriste un proyecto sin TypeScript»* —que tiene
      arreglo: instalarlo y reiniciar— y para *«no abriste ninguna carpeta»*, donde el `✓` es
      inalcanzable y el aviso es ruido permanente. Se distinguen con lo que el cliente ya
      sabe (`workspace.folders`). Es un tercer texto para el mismo icono. **Decisión de
      Pedro** (punto b).

- [ ] **10. SDD-24 §6.1 promete un fallback que no puede funcionar.**
      El servidor, si no le dan `tsdk`, intenta cargar su propio `typescript` — y en una
      extensión instalada eso nunca resuelve, porque el `.vsix` no lleva `typescript`. Hoy no
      molesta (el cliente siempre resuelve el `tsdk` del workspace o el de VS Code), pero la
      promesa es falsa. O se vendoriza TypeScript en el `.vsix` (~10 MB más) o se cambia el
      texto de la spec. **Decisión de Pedro** (punto c).

## Hecho

- [x] **11. Emmet, solo en el markup.**
      No funcionaba en ningún `.fud` porque la extensión integrada de VS Code solo activa
      Emmet para los lenguajes de su lista, y `fudic` no está. El camino corto era mapearlo a
      HTML con `emmet.includeLanguages`, pero eso reparsea **el fichero entero** como HTML y
      ofrece markup dentro de `@code`. Pedro lo probó y ese ruido no es aceptable.
      Lo da el servidor, que tiene el árbol y sí sabe dónde está el markup:
      [`services/emmet.ts`](../../packages/language-server/src/services/emmet.ts) responde con
      `@vscode/emmet-helper` **solo** fuera del `@code`, del cuerpo de un elemento raw
      (`<style>`, `<script>`) y de las interpolaciones. Va por LSP, así que no depende de VS
      Code.
      El precio: Emmet se acepta desde la lista de sugerencias, no expandiendo con Tab a
      secas, y no hay *Wrap with Abbreviation* ni *Balance In/Out* — esos comandos son de la
      extensión de VS Code, no del protocolo. Si alguno hace falta, se recupera añadiendo el
      mapeo al manifiesto, con el ruido de vuelta.
      Y un segundo commit encima: los caracteres que continúan una abreviatura (`* > + } $ ] ! )`)
      no llegaban al editor, porque las capacidades que se anuncian al cliente se declaran a
      mano en `capabilities.ts`. Sin `*`, `ul>li*2` no expandía. Ahora las dos listas salen de
      una constante.

- [x] **12. IntelliSense dentro de un atributo, y dentro de una expresión a medio escribir.**
      Dos agujeros distintos que se veían como el mismo síntoma.
      **El editor no preguntaba:** el valor de un atributo es un *string* para la gramática, y
      VS Code no dispara sugerencias dentro de comillas. La extensión contribuye ahora
      `editor.quickSuggestions.strings` para `[fudic]`.
      **La proyección no tenía dónde mapear:** una expresión se proyecta copiando su span
      `expr`, que mientras se teclea está vacío — y una copia vacía no escribe texto ni deja
      mapping. Los props de componente tenían un sustituto para eso; ningún otro constructo lo
      tenía. Ahora vive en `copyExpression` y pasan por él contenido, atributos nativos,
      bindings, manejadores, `ref` y cabeceras de control. Medido contra el servidor instalado:
      `name="@()"` pasó de 0 a 979 completados.

---

## Fuera de alcance

- **La revisión de experiencia de desarrollo** (`packages/cli` + la extensión) que Pedro hará
  mientras ejecuta el guion manual. Lo que salga de ahí son mejoras de producto, no el cierre
  de SDD-25: van a su propia tanda, con su propia spec.
- Publicar en el marketplace (§7 del SDD).

## Cierre

- [ ] Los bloques de arriba, o descartados por decisión explícita.
- [x] `pnpm typecheck` y `pnpm test` del workspace en verde (2176 tests), con cobertura 100 %
      en las cuatro métricas en `language-core`, `language-server` y `vscode`.
- [x] `verify:vsix` y `verify-server-bundle` en verde sobre el `.vsix` instalado — los dos
      corren dentro de `install:vsix`, que es como se instaló el que Pedro tiene.
- [ ] Guion manual anotado por Pedro (su tarea 2) — es la última casilla de
      [SDD-25-Task.md](./SDD-25-Task.md#cierre-de-la-sdd).
- [x] Merge a `main`: fast-forward a `0a59b1d`, siete commits.
