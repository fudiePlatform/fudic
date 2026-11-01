import { iniciales } from 'fudic:@fudic/example-ui/pipes/iniciales';

// Written once: the library's own tests, the app's server render and its browser all load this file.
export default iniciales.implement((value, locale) =>
  value
    .split(/\s+/u)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toLocaleUpperCase(locale))
    .join(''),
);
