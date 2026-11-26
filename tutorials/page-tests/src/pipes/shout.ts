import { shout } from 'fudic:pipes/shout';

export default shout.implement((value, locale) => value.toLocaleUpperCase(locale));
