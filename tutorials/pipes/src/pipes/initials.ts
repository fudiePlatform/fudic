import { initials } from 'fudic:pipes/initials';

export default initials.implement((value, locale) =>
  value.split(/\s+/u).map((word) => word.charAt(0).toLocaleUpperCase(locale)).join(''),
);
