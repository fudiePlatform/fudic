/**
 * Is the header of a control construct reactive?
 *
 * Every other reactivity suite in this repo drives a construct through a PROP — the parent
 * calls `u([, , rows])` and the list reconciles. Not one of them puts a signal in the
 * HEADER of an `@if`, a `@switch`, a `@foreach` or a `@for` and then writes to it, and not
 * one re-renders a component AFTER hydrating it. Those two gaps hide the same defect, and
 * this suite exists to close them from the browser rather than from the emitted text.
 *
 * Four subjects, one page (`/reactividad`):
 *
 *  - `<signal-control>`  one local signal driving the four constructs at once.
 *  - `<signal-store>`    a signal imported from a module instead of declared in `@client`.
 *  - `<signal-while>`    the fifth construct, whose header consumes state to terminate.
 *  - `<signal-code>`     `@{ … }`, the inline code block the grammar defines.
 *
 * **The four defects it was written for, all of them now closed.**
 *
 *  1. *The orphaned anchor.* On the HYDRATE path a block claimed the level's trailing
 *     whitespace as one of its own (`$dom.lastChild($parent)` pushed to `$r`), and that is
 *     the very node the level hands it as an insertion anchor. Retiring the block removed
 *     the anchor, and `ChildNode.before()` on a node with no parent does nothing and throws
 *     nothing: the old content left, the new never arrived, the console stayed clean. On the
 *     CREATE path they are two different nodes, which is why no equivalence suite saw it —
 *     they compare the first paint, and this only shows on the first re-render AFTER
 *     hydrating. It broke `@if` and `@switch` on the first change, and the two loops the
 *     moment a list reached zero and the last row took the anchor with it.
 *  2. *A signal that lives in a module.* Only a `const x = signal(…)` this file can read was
 *     ever subscribed, so a store crossed by reference, read correctly and never repainted.
 *  3. *`@{ … }` was never emitted.* The token has existed since SDD-03; the emit filed it
 *     under "hoisted by module.ts", which is true of `@code` and false of this one.
 *  4. *`@while` could not be written at all.* Its cursor is advanced from the body, and the
 *     body was the block that never ran.
 *
 * Every assertion is written against what SHOULD happen, and they all hold.
 *
 * Note on `open()`: hydration here is driven by the GESTURE (SDD-17), so nothing is alive
 * before the first click. There is no "wait until hydrated" step — the first click both
 * wakes the component and is replayed, and `expect` retries until it lands.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __ready: boolean;
  }
}

/**
 * Open the page, and hand back the array that collects uncaught errors.
 *
 * The errors matter as much as the DOM: `$u` runs the four reconciliations in one body, so
 * a throw inside the first would silently take the other three with it. Asserting the array
 * is empty is what separates "it threw" from "it did nothing", and here it is the second.
 */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__ready = false;
    document.addEventListener('fud:ready', () => {
      window.__ready = true;
    });
  });
  await page.goto('/reactividad');
  await page.waitForFunction(() => window.__ready);
  return errors;
}

/** Playwright locators pierce an open shadow root, so the panel is reachable by CSS. */
const caso = (page: Page, which: string): Locator =>
  page.locator(`signal-control [data-caso="${which}"] .salida`);

const filas = (page: Page, which: string): Locator =>
  page.locator(`signal-control [data-caso="${which}"] .lista li`);

const valor = (page: Page): Locator => page.locator('signal-control .valor');

/** Click `+1` n times, waiting for the counter to land on each step. */
async function mas(page: Page, veces: number): Promise<void> {
  for (let i = 0; i < veces; i += 1) {
    const antes = Number(await valor(page).innerText());
    await page.locator('signal-control .mas').click();
    await expect(valor(page)).toHaveText(String(antes + 1));
  }
}

test.describe('una signal en la cabecera de un constructo', () => {
  test('el servidor pinta el estado inicial, y la hidratación no lo toca', async ({ page }) => {
    const errors = await open(page);

    await expect(valor(page)).toHaveText('1');
    await expect(caso(page, 'if')).toHaveText('Hay uno o ninguno.');
    await expect(caso(page, 'switch')).toHaveText('uno');
    await expect(filas(page, 'foreach')).toHaveCount(1);
    await expect(filas(page, 'for')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('@foreach: una fila más por cada +1', async ({ page }) => {
    await open(page);

    await mas(page, 1);
    await expect(filas(page, 'foreach')).toHaveCount(2);
    await mas(page, 1);
    await expect(filas(page, 'foreach')).toHaveCount(3);
  });

  test('@for: una fila más por cada +1', async ({ page }) => {
    await open(page);

    await mas(page, 1);
    await expect(filas(page, 'for')).toHaveCount(2);
    await mas(page, 1);
    await expect(filas(page, 'for')).toHaveCount(3);
  });

  test('@if: cambia de rama cuando la condición cambia', async ({ page }) => {
    await open(page);

    await mas(page, 1);
    await expect(caso(page, 'if')).toHaveText('Hay más de uno.');
  });

  test('el mecanismo: una rama sale y la otra entra, siempre una sola', async ({ page }) => {
    const errors = await open(page);
    await expect(caso(page, 'if')).toHaveCount(1);

    // Este es el test del defecto que el arreglo cierra. Sin él, `r()` del bloque vivo
    // borraba el nodo que el nivel usa como ancla, y `before()` sobre un nodo huérfano no
    // inserta y no lanza: el hueco quedaba VACÍO —ni la rama vieja ni la nueva— y la
    // consola limpia. Contar exactamente una es lo que separa «cambió» de «desapareció».
    await mas(page, 1);
    await expect(caso(page, 'if')).toHaveCount(1);
    await expect(caso(page, 'if')).toHaveText('Hay más de uno.');

    // Y de vuelta, que es cuando el bloque recién creado tiene que ser retirado a su vez.
    await page.locator('signal-control .menos').click();
    await expect(caso(page, 'if')).toHaveCount(1);
    await expect(caso(page, 'if')).toHaveText('Hay uno o ninguno.');
    expect(errors).toEqual([]);
  });

  test('@switch: cambia de case cuando el discriminante cambia', async ({ page }) => {
    await open(page);

    await mas(page, 1);
    await expect(caso(page, 'switch')).toHaveText('muchos');
  });

  test('bajar a cero vacía las dos listas', async ({ page }) => {
    await open(page);

    await page.locator('signal-control .menos').click();
    await expect(valor(page)).toHaveText('0');
    await expect(filas(page, 'foreach')).toHaveCount(0);
    await expect(filas(page, 'for')).toHaveCount(0);
  });

  test('y volver a subir desde cero las repuebla', async ({ page }) => {
    // El mismo defecto que el del `@if`, retrasado: vaciar la lista retiraba la última
    // fila, que era la dueña del nodo que el nivel usa como ancla, y a partir de ahí
    // ninguna fila nueva entraba jamás.
    await open(page);

    await page.locator('signal-control .menos').click();
    await expect(valor(page)).toHaveText('0');

    await mas(page, 1);
    await expect(filas(page, 'foreach')).toHaveCount(1);
    await expect(filas(page, 'for')).toHaveCount(1);
  });
});

test.describe('una signal que vive en un módulo', () => {
  const tienda = (page: Page, n: number): Locator =>
    page.locator('signal-store').nth(n).locator('.valor');

  test('escribir en el store repinta a quien lo lee', async ({ page }) => {
    // Un nombre importado no se puede probar reactivo aquí —el módulo es otro fichero— así
    // que el chunk lo pasa por `$subIf`, que pregunta al VALOR en tiempo de ejecución y no
    // hace nada cuando la respuesta es no. Las DOS instancias suben, que es lo que hace de
    // esto un store y no una variable.
    await open(page);

    await page.locator('signal-store').first().locator('.mas').click();
    await expect(tienda(page, 0)).toHaveText('1');
    await expect(tienda(page, 1)).toHaveText('1');
  });

  test('el valor SÍ es compartido: un repintado ajeno lo saca a la luz', async ({ page }) => {
    await open(page);

    // Tres escrituras en el store desde la PRIMERA instancia.
    for (let i = 0; i < 3; i += 1) {
      await page.locator('signal-store').first().locator('.mas').click();
    }

    // Y un repintado forzado en la SEGUNDA, con una signal local que nada tiene que ver
    // con el store. El 3 aparece: el valor estaba bien y era compartido entre las dos
    // instancias todo el rato. Lo que falta es la suscripción, no el dato — y por eso
    // este fallo aparece y desaparece según lo que repinte al lado.
    await page.locator('signal-store').nth(1).locator('.repintar').click();
    await expect(tienda(page, 1)).toHaveText('3');
  });
});

test.describe('los dos que la gramática define y el emit no sostiene', () => {
  test('@while: la lista sobrevive a un repintado que no la toca', async ({ page }) => {
    // La forma canónica de la decisión 91: un recorrido de lista enlazada cuyo cuerpo
    // avanza el cursor con `@{ … }`, y una semilla `@{ cur = lista; }` delante del bucle.
    // La semilla corre también en la pasada de actualización, así que la cabecera arranca
    // otra vez desde el principio en vez de desde el `null` que dejó la anterior.
    await open(page);

    const filas = page.locator('signal-while .lista li');
    await expect(filas).toHaveCount(3);

    await page.locator('signal-while .tocar').click();
    await expect(page.locator('signal-while .pie').first()).toContainText('toques: 1');
    await expect(filas).toHaveCount(3);
  });

  test('@{ … }: el bloque de código en línea se ejecuta antes de pintar', async ({ page }) => {
    // El token existía desde SDD-03 y el emit lo marcaba `'none'` — «lo iza module.ts»,
    // cierto para `@code` y falso para este, que no se izaba a ninguna parte y por tanto no
    // corría en ningún sitio. Sin él, el `@while` de arriba no se puede escribir.
    await open(page);

    await expect(page.locator('signal-code .marca')).toHaveText('marca = 3');
  });
});
