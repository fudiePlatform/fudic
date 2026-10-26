export type Post = { title: string; tag: string; body: string };

export async function findPost(slug: string): Promise<Post | undefined> {
  return slug === 'a' ? { title: 'A', tag: 'x', body: 'b' } : undefined;
}

export async function listSlugs(): Promise<string[]> {
  return ['a'];
}
