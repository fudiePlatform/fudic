# Verificación manual de SDD-25

Ocho pasos. Son los criterios de §6 que **ninguna suite puede comprobar**: piden un VS Code
vivo o un `.vsix` instalado, y doblar el editor solo demostraría que el doble responde.

Los otros seis criterios están automatizados en
[`test/acceptance/criteria.test.ts`](../test/acceptance/criteria.test.ts), organizado por
criterio para que se vea de un vistazo cuál cubre qué.

Este guion se ejecuta **una vez antes de cerrar la SDD** y se anota el resultado. No es un
sustituto de los tests: es la parte honesta de decir que la mitad del producto de una
extensión solo existe dentro del editor.

---

## Preparación

```sh
pnpm build                                   # los dos bundles
pnpm --filter fudic-vscode verify:vsix       # qué entra en el paquete
pnpm --filter fudic-vscode package           # produce fudic-vscode.vsix
code --install-extension packages/vscode/fudic-vscode.vsix
```

Workspace de prueba: `packages/language-server/fixtures/` — es el proyecto real de §6, con
`blog/[slug].fud`, `layouts/_layout.fud`, `components/site-nav.fud` y
`components/app-badge.fud`.

---

## Los pasos

### 1. Registro y icono — criterio §6.1

- [ ] Abrir `blog/[slug].fud`. La barra de estado del editor dice **Fudic** como lenguaje.
- [ ] En el explorador, los `.fud` llevan el icono propio, y **cambia** al alternar entre
      tema claro y oscuro.

> Lo declarativo (el id, la extensión, que los dos ficheros de icono existen) ya lo afirma
> el test. Lo que aquí se mira es que VS Code de verdad los pinta.

### 2. Corrección semántica — criterio §6.3

- [ ] Con el servidor vivo, en `blog/[slug].fud`: `<app-badge>` y `<article>` **no** se ven
      del mismo color.
- [ ] Con `"editor.semanticHighlighting.enabled": false`, los dos vuelven a parecerse.

> Es la comprobación de que los semantic tokens del servidor corrigen la aproximación de
> TextMate, que es todo el trato de §4.2. Sin este paso, no hay forma de distinguir «la
> gramática acertó» de «el servidor lo arregló».

### 3. Ciclo completo — criterio §6.4

En `blog/[slug].fud`:

- [ ] Dentro de `<app-badge |>`, se ofrece `tone`.
- [ ] Dentro de `tone="@(|)"`, se ofrecen `'neutral' | 'success' | 'info'`.
- [ ] Hover sobre `tone` muestra el tipo `Tone`.
- [ ] **F12** sobre `<app-badge>` abre `components/app-badge.fud`.
- [ ] Romper `load()` — cambiar el tipo de retorno para que `body` no exista — pone un error
      **sobre `@data.body`**, en el `.fud`, no en un fichero virtual.
- [ ] Deshacer lo devuelve a cero errores.

### 4. Comentario — criterio §6.5

- [ ] Seleccionar `<h1>@data.title</h1>` y pulsar **Ctrl+/**: queda envuelto en `@* … *@`.
- [ ] Volver a pulsar **Ctrl+/**: vuelve a como estaba.
- [ ] En ningún contexto —dentro de `@code`, dentro de `<style>`, en el markup— aparece un
      comentario de línea `//`.

### 5. Plegado — criterio §6.6

- [ ] `@code`, `@server` y `@client` pliegan por sus llaves.
- [ ] Un `@if` con `@else` pliega la rama del `@if` sin comerse el `else`.
- [ ] Un `@foreach` pliega su cuerpo.

### 6. Reinicio — criterio §6.7

- [ ] Con el editor abierto, instalar una dependencia en el workspace (`pnpm add -D
      typescript`, por ejemplo).
- [ ] Ejecutar **«Fudic: Restart Language Server»** desde la paleta.
- [ ] El estado pasa por `Fudic ⟳` y vuelve a `Fudic ✓` en **menos de tres segundos**, sin
      recargar la ventana.
- [ ] El `tsdk` del registro (canal de salida de Fudic) es ahora el del proyecto.

> Que el reinicio re-resuelve el `tsdk` en vez de relanzar el mismo proceso está probado en
> `activate.test.ts`. Los tres segundos son de reloj y solo se miden aquí.

### 7. Empaquetado — criterio §6.11

- [ ] En una máquina (o un contenedor) **sin el repo**, instalar el `.vsix`.
- [ ] Abrir un `.fud` suelto: color inmediato.
- [ ] Abrir una carpeta con `typescript` instalado: `Fudic ✓` y el completado funciona sin
      instalar nada más.

> **El `.vsix` es específico de plataforma.** El parser es un addon NAPI y su `.node` no se
> puede bundlear, así que `scripts/vendor-native.mjs` copia a `dist/node_modules/` el binding
> de la máquina que empaquetó. Una release real se publica por target
> (`vsce package --target win32-x64`, `linux-x64`, `darwin-arm64`, …), que es el mecanismo que
> VS Code tiene justo para esto. Un `.vsix` empaquetado en Windows **no** sirve en Linux: el
> servidor arranca y muere en el primer parseo.
>
> Ya verificado en local (Windows, VS Code 1.130.0): instalado con
> `code --install-extension`, el `dist/server.mjs` **instalado** contesta `initialize` y
> devuelve los tres virtuales de `[slug].fud`, o sea que parsea con oxc desde el binding
> vendorizado. Lo que este paso añade es la máquina limpia.

### 8. Activación por workspace — criterio §6.12

- [ ] Abrir la carpeta de fixtures **por un `.ts`** (`data/posts.ts`), sin tocar ningún
      `.fud`.
- [ ] La extensión está activa: el canal de salida de Fudic existe.
- [ ] Abrir `blog/[slug].fud` ya muestra los diagnósticos inter-fichero, sin espera de
      arranque.

---

## Anotación

| Fecha | Versión de VS Code | Pasos verdes | Notas |
|---|---|---|---|
| | | | |
