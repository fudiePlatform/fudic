/**
 * The data endpoint answers with frames since SDD-70 §3.7: what a test reads them back to, the
 * `{ data, layout? }` of the first frame, by the types of the route's `load`.
 */

import { readFrames, type DataTypes } from '@fudic/http/wire/frames';

export async function framed(res: Response, types: DataTypes = {}): Promise<{ data: unknown; layout?: unknown }> {
  const { data, layout } = await readFrames(types, res.body!);
  return layout === undefined ? { data } : { data, layout };
}
