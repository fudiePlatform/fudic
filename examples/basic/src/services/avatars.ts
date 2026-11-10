import { Service } from '@fudic/di';

/**
 * The photos of `/usuarios`, by person id: in memory, so every restart starts over. A real app
 * would keep them in a bucket or on a disk; the handler gets a `File` and where it goes is its
 * business. Module state, like the people table: the service holds nothing of its own.
 */
const photos = new Map<number, File>();

export class Avatars {
  /** Keeps a copy of the bytes: the `File` a handler receives lives only while it runs. */
  async put(id: number, photo: File): Promise<void> {
    const bytes = await photo.arrayBuffer();
    photos.set(id, new File([bytes], photo.name, { type: photo.type, lastModified: photo.lastModified }));
  }

  get(id: number): File | undefined {
    return photos.get(id);
  }

  remove(id: number): void {
    photos.delete(id);
  }
}
Service(Avatars);
