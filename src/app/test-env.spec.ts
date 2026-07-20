// Guards the test-runner plumbing: the `@angular/build:unit-test` builder
// must run in jsdom (no `browsers` option → Node.js + jsdom per its schema).
// If a future change accidentally switches to a non-DOM environment, this
// spec fails with a clear signal before any other test silently breaks.
it('runs in a jsdom DOM environment', () => {
  expect(typeof window).not.toBe('undefined');
});
