// What the specs of `usuarios.fudspec` put in place of the real thing, by name. `data` stands in
// for `load`; each group of `calls` answers those functions without running them; whatever is
// not named here runs for real. The editor reads this file without running it.
import type { Fixtures, Person } from 'fudic:routes/usuarios';
import { fails, file, later, redirects } from '@fudic/spec';

const ana: Person = { id: 1, name: 'Ana', email: 'ana@fudic.dev', age: 34, active: true, notes: '', avatar: false };
const luis: Person = { id: 2, name: 'Luis', email: 'luis@fudic.dev', age: 41, active: true, notes: '', avatar: false };

export default {
  data: {
    'dos-personas': { users: [ana, luis] },
    'con-ana-dentro': { users: [ana, luis], session: 'ana' },
    nadie: { users: [] },
    caido: fails(503, 'la base de datos no responde'),
    'sin-sesion': redirects('/entrar'),
  },
  calls: {
    'entra-ana': { login: undefined },
    'busca-luis': { search: [luis] },
    buscando: { search: later.never() },
    'ana-no-se-desactiva': { save: fails('ana') },
    'luis-borrado': { remove: undefined },
    'sin-sesion': { remove: fails(401, 'sin sesión') },
    csv: { exportar: file('./fixtures/personas.csv', { type: 'text/csv' }) },
  },
} satisfies Fixtures;
