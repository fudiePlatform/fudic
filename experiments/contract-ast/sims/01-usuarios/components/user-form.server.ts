/**
 * The server of `<user-form>`, in one file: how it is called, what it receives, what it returns.
 * It answers at `/_fudic/fn/c/user-form/save`, whatever page uses the component.
 */

import type { Put, i32 } from "@fudic/contract";
import { bool, form, max, min, pattern, required, serverValidator, str, u8 } from "@fudic/forms";
import type { auth } from "../middlewares/auth";

export default interface UserForm {
  save: Put<(person: typeof personForm) => Saved, [typeof auth], { invalidates: ["/usuarios"] }>;
}

/** What `save` returns: what the component's `fudic:result` paints. */
export interface Saved {
  readonly id: i32;
  readonly name: string;
}

/** What `save` receives. The browser validates with it before sending, the server again. */
export const personForm = form({
  name: str("", [required], { messages: { required: () => "Escribe el nombre." } }),
  email: str(
    "",
    [
      required,
      pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
      // As today: server code inside the form (IDEA-05 §11.2).
      serverValidator(async (v: string) => ((await emailTaken(v)) ? { taken: true } : null)),
    ],
    {
      messages: {
        required: () => "Escribe el email.",
        pattern: () => "Ese email no parece válido.",
        taken: () => "Ese email ya lo usa otra persona.",
      },
    },
  ),
  age: u8(null, [required, min(18), max(120)], {
    messages: {
      required: () => "Escribe la edad.",
      min: (n) => `Tiene que tener al menos ${String(n)} años.`,
      max: (n) => `Como mucho ${String(n)} años.`,
    },
  }),
  active: bool(true),
  notes: str(""),
}, {
  catches: [400, 409, 422],
});

/** The server code the validator reaches into today. */
declare function emailTaken(email: string): Promise<boolean>;
