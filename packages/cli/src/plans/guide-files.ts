/**
 * The files of a style guide: `templates/guide/`, as they are. Every `.css` is rendered with the
 * project's name for its tokens, and everything else — the font, its licence, the icons — copied
 * byte for byte. The `.tmpl` files are what makes the folder a library, so an app's guide goes
 * without them.
 */

import { joinPosix } from '../paths.js';
import { renderTemplate, templateBytes, templateTree } from '../templates.js';
import type { ScaffoldFile } from './scaffold.js';

/** Where a standalone app keeps its guide. */
export const APP_GUIDE_DIR = 'src/guide';

/** The guide's files in `dir`; with `pkgName`, as a library of that name, else as an app's folder. */
export function guideFiles(dir: string, project: string, pkgName?: string): readonly ScaffoldFile[] {
  return templateTree('guide').flatMap((file): ScaffoldFile[] => {
    const source = `guide/${file}`;
    if (file.endsWith('.tmpl')) {
      if (pkgName === undefined) return [];
      return [[joinPosix(dir, file.slice(0, -'.tmpl'.length)), renderTemplate(source, { name: pkgName, project })]];
    }
    if (file.endsWith('.css')) return [[joinPosix(dir, file), renderTemplate(source, { project })]];
    return [[joinPosix(dir, file), templateBytes(source)]];
  });
}

/** What a standalone app's `fudic.json` names its guide with, once it is in `src/guide/`. */
export const APP_GUIDE_FIELDS = {
  globalStyles: { base: `${APP_GUIDE_DIR}/base.css` },
  guide: { sheet: `${APP_GUIDE_DIR}/guide.css`, icon: `${APP_GUIDE_DIR}/logo.svg` },
} as const;
