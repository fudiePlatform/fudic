// Un módulo del proyecto, para que `vista-errores.fud` tenga un import que intentar escribir y
// uno que la vista lee como valor. Es un store para el corte de servidor: lo que la vista lee de
// aquí tiene que ser `signal`, `computed` o un `const` de la lista blanca (SDD-61 §3.9).
export let importado = 1;

// FUD1150 sobre `function ayuda(): number { return importado; }`: la vista la lee como valor
// (`ayuda.constructor`), y una función no es nada que el servidor de otro backend pueda evaluar.
export function ayuda(): number { return importado; }
