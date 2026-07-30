/**
 * `fudic.showVirtualFiles` (SDD-25 §4.3, criterion 8).
 *
 * The daily debugging tool of whoever develops the emitter. Without being able to see what
 * is being shown to `tsserver`, every strange diagnostic is debugged blind — which is why
 * the SDD calls it instrumental rather than a convenience.
 */

import { requireFudAndServer, type CommandDeps } from './deps.js';
import { NO_VIRTUAL_FILES, requestFailed } from './messages.js';

export const VIRTUAL_FILES_REQUEST = 'fudic/virtualFiles';

/** The shape SDD-24 §3.4 answers with. */
export interface VirtualFile {
  readonly fileName: string;
  readonly languageId: string;
  readonly text: string;
}

export const showVirtualFiles = async (deps: CommandDeps): Promise<void> => {
  const target = requireFudAndServer(deps);
  if ('problem' in target) {
    deps.notifications.warn(target.problem);
    return;
  }

  let files: readonly VirtualFile[];
  try {
    files = await deps.session.client.sendRequest<readonly VirtualFile[]>(VIRTUAL_FILES_REQUEST, {
      uri: target.uri,
    });
  } catch (error) {
    // The server can die between the check above and the answer. Reporting beats an
    // unhandled rejection in a channel the user never opens.
    deps.notifications.warn(requestFailed(VIRTUAL_FILES_REQUEST, error));
    return;
  }

  if (files.length === 0) {
    deps.notifications.warn(NO_VIRTUAL_FILES);
    return;
  }

  // One editor per virtual, each with its own language: the client virtual is TypeScript
  // and the `<style>` ones are CSS, and reading either as plain text defeats the point.
  for (const file of files) {
    await deps.documents.openReadOnly(file.fileName, file.languageId, file.text);
  }
};
