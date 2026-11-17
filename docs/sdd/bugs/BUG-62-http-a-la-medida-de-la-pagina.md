# BUG-62 · Cada página descargaba el cliente http entero, y una regla podía comprobarse antes de existir

> **Estado:** `Hecho` — arreglado primero y documentado después, a petición de Pedro. [tareas](./BUG-62-Task.md).
> **Corrige:** [BUG-57](./BUG-57-http-como-pieza-del-runtime.md) §3 (las piezas de `@fudic/http`),
> [SDD-67](../SDD-67-binario-y-reglas-en-las-funciones.md) §3.2 (los argumentos de un `get`) y
> [SDD-60](../SDD-60-fudapi.md) §4.4 (el registro de implementaciones).
> **Paquetes:** `@fudic/http` · `@fudic/api` · `@fudic/diagnostics` · `@fudic/forms` · `@fudic/testing` · `examples/basic` · `examples/pieces-bench`

---

## 1. Síntoma

Lo vio Pedro en `examples/basic/dist/_fudic/<versión>/http/`: un `contract.js` de 25,6 KB (9,6 KB
gzip) que descargaba **todo** chunk que tocara `@fudic/http`, usara lo que usara. Tres casos:

1. **El módulo raíz del navegador** lo descargaba entero para cuatro nombres que ni siquiera son de
   http: `inTurn`, `loadingFile`, `setFolders` y `takeRefusal`, el registro de `@fudic/forms`, que
   `@fudic/http/contract` reexporta.
2. **Toda llamada se llevaba los ficheros**: multipart, `XMLHttpRequest`, la lectura de un `-> file`
   y de un valor con ficheros, aunque la función no tocara un fichero.
3. **Una página solo JSON se llevaba el binario**, porque estaba dentro de `contract`, y además los
   argumentos de un `get` viajaban en `?a=` como bytes en base64url, en vez de como un querystring
   normal: una URL ilegible que obligaba a
   tener el códec binario para escribirla.

Y uno que no era de tamaño, que salió al medir y confirmó la sesión que cerró SDD-85: con la red
lenta, salir de un campo antes de que el módulo raíz registrara las reglas lanzaba
`required of @fudic/forms/rules has no implementation in src/browser`, el campo se quedaba sin
mensaje y el envío daba por bueno un formulario vacío. Ya fallaba en main, de vez en cuando, en los
e2e de formularios.

## 2. Causa

- **Una pieza por formato, no por uso.** BUG-57 partió `@fudic/http` en `contract` y `json`, con el
  argumento de que toda página que llama a su servidor necesita stubs, errores y binario. Pero una
  pieza publicada se importa por URL y no se poda: la granularidad de la pieza es lo único que decide
  qué se descarga.
- **`stub` decidía en ejecución lo que el compilador ya sabía.** Importaba de forma estática todas las
  capacidades que una función *podría* tener y elegía con `spec.files`; el `.fudapi` sabe en
  compilación qué función lleva ficheros.
- **La regla no esperaba al registro.** El módulo raíz carga las implementaciones con `import()`
  dinámicos, fichero a fichero, y nadie espera a que acabe antes de que el formulario esté vivo. Una
  regla con su hueco vacío lanzaba en vez de esperar; y la validez del formulario, un `computed`, no
  tenía cómo enterarse de que la implementación había llegado.

## 3. Corrección

1. **Cinco piezas, cada una para quien la usa.**
   - `contract`: stubs, `page`, middlewares, errores, descriptores, `csrf`, `error-pages`, `rule-send`.
   - `bin`: el formato binario y el lector de los frames de `load`, que son binarios.
   - `files`: `upload` y `download`. El módulo generado del navegador se los pasa a `stub` solo en las
     funciones cuyos argumentos o cuyo `->` alcanzan un `file`, importados como `$upload` y
     `$download` para que ninguna declaración choque con ellos.
   - `json`: como antes.
   - `registry`: el registro de forms, reexportado por la URL de `forms/contract`. Es lo único que
     importa el módulo raíz.
2. **Los argumentos de un `get` son claves normales de su query**, una por argumento y en texto,
   exactamente como los de `query` (`?q=ana`), en los dos formatos. `?a=` desaparece, con el módulo de
   base64url y la reserva del nombre `a` (FUD1076). Como un `get` no tiene cuerpo, el compilador le
   exige argumentos escalares con el mismo diagnóstico que a `query` (FUD1101). El servidor los lee
   como lee `query`: uno que falta es un 400 `argument q is missing`.
3. **Fuera del navegador** la variante servidor de `fn`, `contractsOf` y el `credentials:
   'same-origin'` redundante (es el valor por defecto de `fetch`).
4. **Una regla espera a su implementación mientras el registro carga.** El registro cuenta las cargas
   en curso (`loading()`); con una en marcha, una regla con el hueco vacío espera a `settled()` y
   comprueba entonces, y solo un hueco vacío *después* de la carga falla como antes. Cada hueco es una
   señal, así que la validez del formulario se recalcula sola cuando llega la implementación.
5. **Un envío durante la carga espera.** El envío decide con los errores ya anotados, y con las
   reglas sin responder no había ninguno. Ahora `bindForm`, si el registro está cargando, detiene el
   envío antes de que nadie más lo oiga —el `@submit` del autor incluido— y lo repite con
   `requestSubmit()` cuando las reglas están dentro.
6. **`@fudic/testing`** pasa `upload` y `download` al stub de cada función, como el módulo del
   navegador: en un test la función existe una sola vez, en su variante de servidor.

Se midió también partir más (`page`, `schema`, `rule-send`, `compress`, `csrf`, `error-pages` como
piezas propias) y **no compensa**: las piezas que una página carga juntas comprimen peor por separado,
cada una es una petición más, y alargar la carga en serie del módulo raíz abría más la ventana del
punto 4.

## 4. Criterios de aceptación

1. El módulo raíz del navegador solo alcanza `http/registry`.
2. Una función sin ficheros no alcanza `http/files`; una con ficheros, sí.
3. Una página cuyas funciones hablan JSON y sin `load` no alcanza `http/bin`.
4. Los argumentos de un `get` y de su `.url()` son claves de su query (`?q=ana`), también en
   `fud-bin`; un `get` con un argumento compuesto es FUD1101.
5. Con las reglas llegando tarde, salir de un campo muestra su mensaje y enviar el formulario vacío
   no lo envía, sin ningún error (`examples/basic/tests/rule-race.spec.ts`; los dos casos fallan sin
   el arreglo).
6. La comprobación de piezas en verde; `pnpm typecheck`, `pnpm test`, `pnpm build` y Playwright en
   verde.

## 5. Medición

Build real de `examples/basic`, bytes de http en el cierre estático de cada chunk:

| Chunk | Antes | Después | gzip |
|---|---|---|---|
| `fudic-root.browser`, `rules`, `wide` | 25.581 | 252 | 9.596 → 176 (−98 %) |
| `log`, `middlewares`, `fudic_http` | 25.581 | 14.478 | 9.596 → 5.998 (−37 %) |
| `app-adjuntos` (JSON y ficheros, sin binario) | 26.728 | 19.568 | 10.229 → 8.405 (−18 %) |
| `entrar`, `people`, `user` (binario) | 25.581 | 21.634 | 9.596 → 8.898 (−7 %) |
| `usuarios`, `user-form` (todo) | 26.728 | 26.724 | 10.229 → 11.305 (+11 %) |

El último caso es el precio aceptado: una página que lo usa todo descarga cinco ficheros en vez de
dos y pierde la compresión entre ellos (~1,1 KB gzip).
