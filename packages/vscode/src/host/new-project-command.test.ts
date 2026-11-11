import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_PROJECT_COMMAND, registerNewProject } from './new-project-command.js';
import { reset, world } from './vscode-fake.testing.js';

vi.mock('vscode', async () => {
  const fake = await import('./vscode-fake.testing.js');
  return fake.createFakeVscode();
});

const FOLDER = '/w/p';

async function run(): Promise<void> {
  registerNewProject();
  const handler = world.commandHandlers.get(NEW_PROJECT_COMMAND);
  if (handler === undefined) throw new Error('The command is not registered.');
  await (handler as () => Promise<void>)();
}

beforeEach(() => {
  reset({}, `${FOLDER}/none.phrase.md`, '');
  world.dialogFolder = FOLDER;
  world.inputValue = 'My Report';
});

describe('Phrase: New Project', () => {
  it('writes the project into the folder and opens the first document in the Phrase editor', async () => {
    await run();
    expect([...world.files.keys()].sort()).toEqual([
      `${FOLDER}/AGENTS.md`,
      `${FOLDER}/documents/my-report.phrase.md`,
      `${FOLDER}/phrase.yaml`,
      `${FOLDER}/styles/default.yaml`,
    ]);
    expect(world.files.get(`${FOLDER}/phrase.yaml`)).toContain("title: 'My Report'");
    expect(world.commands).toEqual(['vscode.openWith']);
    const [uri, viewType] = world.commandArgs[0] ?? [];
    expect((uri as { path: string }).path).toBe(`${FOLDER}/documents/my-report.phrase.md`);
    expect(viewType).toBe('phrase.editor');
    expect(world.errors).toEqual([]);
  });

  it('suggests the name of the folder as the title, and wants a title', async () => {
    await run();
    expect(world.inputOptions?.value).toBe('p');
    expect(world.inputOptions?.validateInput?.('  ')).toBe('A title is needed.');
    expect(world.inputOptions?.validateInput?.('Report')).toBeUndefined();
  });

  it('does nothing when the folder or the title is not given', async () => {
    world.dialogFolder = undefined;
    await run();
    expect(world.files.size).toBe(0);
    world.dialogFolder = FOLDER;
    world.inputValue = undefined;
    await run();
    expect(world.files.size).toBe(0);
    expect(world.commands).toEqual([]);
  });

  it('keeps an AGENTS.md that is in the folder, writes the project, and says so', async () => {
    world.files.set(`${FOLDER}/AGENTS.md`, 'My own rules.\n');
    await run();
    expect(world.files.get(`${FOLDER}/AGENTS.md`)).toBe('My own rules.\n');
    expect(world.files.has(`${FOLDER}/phrase.yaml`)).toBe(true);
    expect(world.infos).toEqual([expect.stringContaining('AGENTS.md already')]);
    expect(world.errors).toEqual([]);
  });

  it('writes nothing and says why when the folder has a project already', async () => {
    world.files.set(`${FOLDER}/phrase.yaml`, 'phrase-format: 1\n');
    await run();
    expect(world.files.size).toBe(1);
    expect(world.errors).toHaveLength(1);
    expect(world.errors[0]).toContain('phrase.yaml');
    expect(world.commands).toEqual([]);
  });

  it('says so when the files cannot be written', async () => {
    world.failWrites = true;
    await run();
    expect(world.errors[0]).toContain('could not be written');
    expect(world.errors[0]).toContain('EBUSY');
  });

  it('offers to open the folder when it is not in the workspace, and opens it on request', async () => {
    world.outsideWorkspace = true;
    world.infoChoice = 'Open folder';
    await run();
    expect(world.infos[0]).toContain('documents/my-report.phrase.md');
    expect(world.commands).toEqual(['vscode.openFolder']);
  });

  it('leaves the folder closed when the offer is not taken', async () => {
    world.outsideWorkspace = true;
    await run();
    expect(world.infos).toHaveLength(1);
    expect(world.commands).toEqual([]);
    expect(world.files.size).toBe(4);
  });
});
