import { locale, t } from '@fudic/i18n';

/** A post. Its title is content, not interface: it comes per locale from the data. */
export interface Post {
  readonly slug: string;
  readonly title: string;
  readonly minutes: number;
}

const POSTS: Readonly<Record<string, { readonly title: Readonly<Record<string, string>>; readonly minutes: number }>> = {
  hola: { title: { es: 'Hola, mundo', en: 'Hello, world' }, minutes: 1 },
  pipes: { title: { es: 'Formatos con pipes', en: 'Formatting with pipes' }, minutes: 4 },
};

export function slugs(): string[] {
  return Object.keys(POSTS);
}

export function findPost(slug: string): Post | undefined {
  const post = POSTS[slug];
  return post === undefined ? undefined : { slug, title: post.title[locale] ?? slug, minutes: post.minutes };
}

export function notFound(slug: string): string {
  return t('No hay ninguna entrada llamada {slug}', { slug });
}

export function readingTime(minutes: number): string {
  return t('{minutes, plural, one {# minuto de lectura} other {# minutos de lectura}}', { minutes });
}
