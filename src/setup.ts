// Global test setup for the Angular + Vitest test runner.
// `tsconfig.spec.json` already declares `types: ["vitest/globals"]`, so the
// `expect`/`it`/`describe` globals are available without an explicit import.
// This file is referenced via `setupFiles` in the `angular.json` test target
// and exists to give future tests a single wiring point (DOM shims, mocks, etc).
export {};
