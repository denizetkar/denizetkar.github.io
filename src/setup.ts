// Global test setup for the Angular + Vitest test runner.
// `tsconfig.spec.json` already declares `types: ["vitest/globals"]`, so the
// `expect`/`it`/`describe` globals are available without an explicit import.
// This file is referenced via `setupFiles` in the `angular.json` test target
// and exists to give future tests a single wiring point (DOM shims, mocks, etc).

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Expose a tiny reader so static-asset specs can read project files without
// each spec needing its own Node fs wiring (the Angular test builder runs in
// a sandboxed Vite context where `node:fs` is not directly importable).
globalThis.__staticAssetReader = {
  readProjectFile: (relativePath: string): string =>
    readFileSync(resolve(process.cwd(), relativePath), 'utf-8'),
};

export {};
