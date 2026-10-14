/** A post of the blog route. */
export interface Post {
  readonly title: string;
  readonly lang: string;
}

/** The data edge of the blog route, which a test mocks. */
export async function findPost(slug: string): Promise<Post | undefined> {
  return { title: `Post ${slug}`, lang: 'en' };
}
