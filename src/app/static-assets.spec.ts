type StaticAssetReader = {
  readProjectFile: (relativePath: string) => string;
};

function getReader(): StaticAssetReader {
  const reader = (globalThis as { __staticAssetReader?: StaticAssetReader }).__staticAssetReader;
  if (!reader) {
    throw new Error('__staticAssetReader is not wired; check src/setup.ts.');
  }
  return reader;
}

describe('static assets', () => {
  it('index.html exposes the verified title "Deniz Etkar — Mission Control"', () => {
    const indexHtml = getReader().readProjectFile('src/index.html');
    expect(indexHtml).toMatch(/Deniz Etkar — Mission Control/);
  });
});
