declare global {
  var __staticAssetReader:
    | {
        readProjectFile: (relativePath: string) => string;
      }
    | undefined;
  var process: { cwd: () => string };
}

export {};
