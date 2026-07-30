/**
 * The extension entry point (SDD-25 §4.1).
 *
 * VS Code calls `activate` once, on the first activation event — opening a `.fud`, or
 * opening a workspace that contains one. Activation stays cheap by contract (§5): the
 * language server runs in its own process, and nothing here parses, resolves or validates.
 *
 * This file is also the only one in the package allowed to import `vscode`. It is an
 * adapter with no branches: it builds the ports and hands them to the activation logic,
 * which is plain code a test can drive without an extension host.
 */

import type { ExtensionContext } from 'vscode';

export function activate(_context: ExtensionContext): void {}

export function deactivate(): void {}
