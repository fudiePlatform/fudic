# examples/i18n

Una app en dos idiomas, `es` y `en`, con todo lo que trae `@fudic/i18n`: rutas con prefijo,
texto traducido al compilar, pipes de moneda y de fecha, plurales y un selector de idioma.

```sh
pnpm translate   # extrae los mensajes a src/locales/es/ y en/, un fichero por componente
pnpm build
pnpm preview     # / redirige a /es/ o /en/ según el navegador
```

Qué mirar:

- `/es/` y `/en/`: el layout no escribe `lang`; cada página sale con el suyo.
- `app-greeting`: N1, sin JavaScript. Texto con etiquetas y huecos, un plural reescrito en los
  dos catálogos, un precio, una fecha que llega del `load` de la ruta y un `@if` con texto.
- `app-cart`: hidratado. El plural que los catálogos escriben para su texto y el precio se
  vuelven a formatear en el navegador.
- La prop de `app-banner` lleva `t()`, y `services/posts.ts` también.
- `/xx/blog/:slug`: parámetros y `paths()`; `/en/blog/nada` lo pinta el servidor.
- El selector de idioma va bajo `translate="no"`: es lo único en español dentro de `/en/`.
