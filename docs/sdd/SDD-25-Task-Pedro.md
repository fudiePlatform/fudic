# SDD-25 — Tareas de Pedro

> **SDD:** [SDD-25 — Extensión de VS Code](./SDD-25-extension-vscode.md)
> **Tareas de Claude:** [SDD-25-Task-Claude.md](./SDD-25-Task-Claude.md)
> **Guion completo:** [`packages/vscode/docs/verificacion-manual.md`](../../packages/vscode/docs/verificacion-manual.md)

Lo que solo puede hacer alguien delante del editor, más las decisiones que no son mías.
Ocho de los doce criterios de §6 piden un VS Code vivo o un `.vsix` instalado: doblar el
editor solo demostraría que el doble responde.

La extensión instalada ahora mismo (`fudic.fudic-vscode-0.0.1`) lleva ya los tres arreglos
de la sesión anterior: el `languageId` real, las URIs de formateo y el `require` del bundle.

---

## 1. Capturar el reinicio que rompe el IntelliSense — **bloquea el cierre**

Es el criterio §6.7 y hoy falla. Mi diagnóstico está a la espera de estos datos; sin ellos
solo puedo elegir entre tres hipótesis.

- [ ] Poner en `settings.json` del workspace: `"fudic.trace.server": "verbose"`.
- [ ] Recargar la ventana (`Ctrl+R`) y abrir `blog/[slug].fud` de
      `packages/language-server/fixtures/`. **Comprobar que el completado funciona** antes de
      reiniciar — si ya no va, el fallo no es del reinicio.
- [ ] Ejecutar **«Fudic: Restart Language Server»** desde la paleta.
- [ ] Intentar un completado dentro de `<app-badge |>`.
- [ ] Pegarme, del canal **Fudic**, todo lo que salga desde `restarting the language server`.
      Con `verbose` el volcado es largo: vale con la parte que va desde ahí hasta después del
      completado fallido.

Y tres datos que valen tanto como el trace:

- [ ] ¿Qué dice la barra de estado tras el reinicio: `Fudic ✓`, `⚠` o `✕`?
- [ ] ¿Salió algún aviso emergente?
- [ ] ¿Un `Ctrl+R` (recargar ventana) devuelve el IntelliSense? Distingue *«el servidor nuevo
      está roto»* de *«el cliente nuevo no le está hablando»*.

## 2. Ejecutar el guion de verificación manual

Los ocho pasos de
[`packages/vscode/docs/verificacion-manual.md`](../../packages/vscode/docs/verificacion-manual.md).
Es la última casilla abierta de [SDD-25-Task.md](./SDD-25-Task.md#cierre-de-la-sdd), y la
anotación al final del guion (fecha, versión de VS Code, pasos verdes) es lo que cierra la
SDD.

- [ ] **Paso 1** — registro e icono del lenguaje (§6.1).
- [ ] **Paso 2** — corrección semántica: `<app-badge>` y `<article>` de distinto color (§6.3).
- [ ] **Paso 3** — ciclo completo: completado de `tone`, hover, F12, el error sobre
      `@data.body` al romper `load()` (§6.4). **Es el paso que más dice**: si algo de esto
      falla, no es la extensión, es el servidor.
- [ ] **Paso 4** — `Ctrl+/` produce `@* … *@` y lo revierte (§6.5).
- [ ] **Paso 5** — plegado de `@code`, `@if` con `@else`, `@foreach` (§6.6).
- [ ] **Paso 6** — reinicio en menos de tres segundos (§6.7). **Hoy falla**: es la tarea 1.
- [ ] **Paso 7** — el `.vsix` en una máquina limpia (§6.11). Requiere otra máquina o un
      contenedor; el `.vsix` es específico de plataforma (Windows x64 el que tienes).
- [ ] **Paso 8** — abrir la carpeta por un `.ts` activa la extensión (§6.12).
- [ ] Rellenar la tabla de anotación del final del guion.

## 3. El logo de la extensión

- [ ] Dame un **PNG de 128×128** para el campo `icon` del manifiesto, o dime que derive uno
      de `icons/fud-light.svg`. Sin él, la extensión sale con el marcador gris por defecto en
      la lista y en su página.

> Los `icons/fud-*.svg` que ya existen son los del **explorador de ficheros** (uno por tema),
> y esos no se tocan. El icono de la extensión es otra cosa: uno solo, PNG, cuadrado, y se ve
> a 128 px y a 42 px.

## 4. Decisiones

Cuatro cosas que no puedo decidir yo. Cada una corresponde a una tarea mía parada.

- [ ] **a. El `[Error] Server process exited with code 0.` de cada reinicio.**
      Es ruido de `vscode-languageclient`: loguea la muerte del servidor como error sin mirar
      si la parada la pedimos nosotros. **¿Lo filtro del canal o lo dejo y lo documento?**
      Filtrarlo significa reconocer una cadena de la librería en nuestro código; dejarlo
      significa que cada reinicio enseña un error rojo que no lo es.
- [ ] **b. El tercer estado degradado.** Hoy `Fudic ⚠` dice lo mismo con un proyecto sin
      TypeScript (tiene arreglo) que con un fichero suelto sin carpeta abierta (no tiene
      arreglo, y el `✓` es inalcanzable). **¿Quieres un texto propio para el segundo caso?**
- [ ] **c. El fallback de TypeScript que promete SDD-24 §6.1.** Hoy es mentira en una
      extensión instalada: el `.vsix` no lleva `typescript`. **¿Vendorizamos TypeScript
      (~10 MB más en cada `.vsix`, por target) o cambiamos la promesa de la spec?** Mi
      recomendación es cambiar la promesa: el cliente siempre resuelve un `tsdk`, así que ese
      camino no se pisa nunca en la práctica.
- [ ] **d. La organización de GitHub.** Los ocho `package.json` dicen
      `github.com/fudie/fudic` y el remoto es `fudiePlatform/fudic`. **¿Cuál es la buena?**
- [x] **e. Emmet.** Resuelto: lo da el servidor y solo funciona en el markup, nunca dentro de
      `@code`, `<style>` o `@(…)`. Ver [mi tarea 11](./SDD-25-Task-Claude.md#emmet).

## 5. Versión inicial del `CHANGELOG`

- [ ] La extensión está en `0.0.1`. Para escribir el primer `CHANGELOG.md` necesito saber si
      la primera entrada es `0.0.1` (lo que ya has instalado) o si esto sale como `0.1.0`.

---

## Fuera de alcance

La revisión de experiencia de desarrollo —la `cli` de `packages/cli` y la extensión juntas—
que harás mientras ejecutas el guion. Lo que salga de ahí son mejoras de producto: van a su
propia tanda con su propia spec, no al cierre de SDD-25. Apúntalas donde quieras y las
convertimos en SDD después.
