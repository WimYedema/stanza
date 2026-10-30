/**
 * The root of the project of a document: the nearest folder above it that has a project file, not
 * going above the folder that the workspace gives. Generic in what a folder is, so that it runs on
 * plain strings in tests and on VS Code's URIs in the extension.
 */
export async function findProjectRoot<Folder>(
  start: Folder,
  parent: (folder: Folder) => Folder | undefined,
  hasProjectFile: (folder: Folder) => Promise<boolean>,
  isTop: (folder: Folder) => boolean,
): Promise<Folder | undefined> {
  let folder: Folder | undefined = start;
  while (folder !== undefined) {
    if (await hasProjectFile(folder)) return folder;
    if (isTop(folder)) return undefined;
    folder = parent(folder);
  }
  return undefined;
}
